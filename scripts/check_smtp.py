#!/usr/bin/env python3
"""Verify the SMTP configuration actually works.

Reads the SAME variables the app uses (from `.env` by default) and walks the
full send path step by step so you can see exactly where a failure happens:

    1. load + validate config
    2. DNS resolution of SMTP_HOST
    3. TCP connect to SMTP_HOST:SMTP_PORT
    4. EHLO
    5. STARTTLS (port 587/other) or implicit TLS (port 465)
    6. AUTH  -- only when BOTH SMTP_USER and SMTP_PASS are set
              (mirrors src/server/services/mail.service.ts)
    7. send a real test email  (only with --send)

The DataArt relay (relay1.dataart.com) accepts UNAUTHENTICATED mail as long as
the recipient is a @dataart.com address, so the default recipient is your
DataArt address. Override with --to.

Examples
--------
    # connect + STARTTLS + (optional) auth, but DO NOT send:
    python3 scripts/check_smtp.py

    # actually send a test message to yourself:
    python3 scripts/check_smtp.py --send --to you@dataart.com

    # use a different env file / see the raw SMTP conversation:
    python3 scripts/check_smtp.py --env .env.local --debug --send

Exit code is 0 on success, non-zero on the first failing step.
"""
from __future__ import annotations

import argparse
import smtplib
import socket
import ssl
import sys
from email.message import EmailMessage
from email.utils import formatdate, make_msgid, parseaddr
from pathlib import Path

DEFAULT_TO = "vitaliy.stepanov@dataart.com"


# --------------------------------------------------------------------------- #
# tiny .env parser (no external deps)
# --------------------------------------------------------------------------- #
def load_env(path: Path) -> dict[str, str]:
    """Parse a dotenv file into a dict. Supports KEY=VALUE, comments, quotes."""
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :]
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        env[key] = value
    return env


# --------------------------------------------------------------------------- #
# pretty output helpers
# --------------------------------------------------------------------------- #
_USE_COLOR = sys.stdout.isatty()


def _c(code: str, text: str) -> str:
    return f"\033[{code}m{text}\033[0m" if _USE_COLOR else text


def step(msg: str) -> None:
    print(_c("36", f"→ {msg}"))


def ok(msg: str) -> None:
    print(_c("32", f"  ✓ {msg}"))


def fail(msg: str) -> None:
    print(_c("31", f"  ✗ {msg}"))


def info(msg: str) -> None:
    print(f"    {msg}")


def die(msg: str, code: int = 1) -> "None":
    fail(msg)
    print(_c("31", "\nSMTP check FAILED."))
    sys.exit(code)


# --------------------------------------------------------------------------- #
# main
# --------------------------------------------------------------------------- #
def main() -> int:
    parser = argparse.ArgumentParser(
        description="Check that the configured SMTP relay works.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--env",
        default=".env",
        help="path to the env file to read (default: .env)",
    )
    parser.add_argument(
        "--to",
        default=None,
        help=f"recipient for the test email (default: SMTP test addr / {DEFAULT_TO})",
    )
    parser.add_argument(
        "--send",
        action="store_true",
        help="actually send a test email (otherwise just connect/handshake)",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=15.0,
        help="socket timeout in seconds (default: 15)",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="print the raw SMTP conversation",
    )
    args = parser.parse_args()

    # ---- 1. load config ---------------------------------------------------- #
    env_path = Path(args.env)
    step(f"Loading config from {env_path}")
    env = load_env(env_path)
    # fall back to real process env for anything missing (e.g. CI)
    import os

    def get(key: str, default: str | None = None) -> str | None:
        return env.get(key) or os.environ.get(key) or default

    host = get("SMTP_HOST")
    port_raw = get("SMTP_PORT", "587")
    user = get("SMTP_USER") or ""
    password = get("SMTP_PASS") or ""
    mail_from = get("SMTP_FROM")

    if not host:
        die("SMTP_HOST is not set.")
    if not mail_from:
        die("SMTP_FROM is not set.")
    try:
        port = int(port_raw or "587")
    except ValueError:
        die(f"SMTP_PORT is not an integer: {port_raw!r}")
        return 1

    use_auth = bool(user and password)  # mirror the app: auth only if BOTH set
    implicit_tls = port == 465  # 465 = implicit TLS; otherwise STARTTLS

    from_addr = parseaddr(mail_from)[1] or mail_from
    to_addr = args.to or get("SMTP_TEST_TO") or DEFAULT_TO

    ok("config loaded")
    info(f"host       = {host}")
    info(f"port       = {port}  ({'implicit TLS' if implicit_tls else 'STARTTLS'})")
    info(f"from       = {mail_from}")
    info(f"auth       = {'yes (user=' + user + ')' if use_auth else 'no (unauthenticated)'}")
    info(f"password   = {'set (' + str(len(password)) + ' chars)' if password else '(empty)'}")
    info(f"send email = {'yes -> ' + to_addr if args.send else 'no (handshake only)'}")
    if args.send and not to_addr.lower().endswith("@dataart.com") and not use_auth:
        info(
            _c(
                "33",
                "WARNING: unauthenticated relay usually only accepts mail to "
                "@dataart.com recipients; this send may be rejected.",
            )
        )

    # ---- 2. DNS ------------------------------------------------------------ #
    step(f"Resolving {host}")
    try:
        infos = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
        addrs = sorted({i[4][0] for i in infos})
        ok(f"resolved to {', '.join(addrs)}")
    except socket.gaierror as e:
        die(f"DNS resolution failed: {e}. Are you on the DataArt network/VPN?")
        return 1

    # ---- 3-7. connect + handshake ----------------------------------------- #
    context = ssl.create_default_context()
    server: smtplib.SMTP | None = None
    try:
        step(f"Connecting to {host}:{port}")
        if implicit_tls:
            server = smtplib.SMTP_SSL(
                host, port, timeout=args.timeout, context=context
            )
        else:
            server = smtplib.SMTP(host, port, timeout=args.timeout)
        if args.debug:
            server.set_debuglevel(1)
        ok("TCP connection established")

        step("EHLO")
        code, msg = server.ehlo()
        if code // 100 != 2:
            die(f"EHLO refused: {code} {msg!r}")
        ok(f"EHLO ok ({code})")

        if not implicit_tls:
            step("STARTTLS")
            if not server.has_extn("starttls"):
                die("Server does not advertise STARTTLS.")
            server.starttls(context=context)
            server.ehlo()  # re-EHLO after TLS
            ok("TLS negotiated")
        else:
            ok("using implicit TLS (port 465)")

        if use_auth:
            step(f"AUTH LOGIN as {user}")
            try:
                server.login(user, password)
                ok("authentication succeeded")
            except smtplib.SMTPAuthenticationError as e:
                die(f"authentication failed: {e.smtp_code} {e.smtp_error!r}")
        else:
            info("skipping AUTH (no credentials configured)")

        if args.send:
            step(f"Sending test email to {to_addr}")
            message = EmailMessage()
            message["From"] = mail_from
            message["To"] = to_addr
            message["Subject"] = "Ticket Tracker — SMTP connectivity test"
            message["Date"] = formatdate(localtime=True)
            message["Message-ID"] = make_msgid(domain="dataart.com")
            message.set_content(
                "This is an automated SMTP connectivity test from the Ticket "
                "Tracker app (scripts/check_smtp.py).\n\n"
                f"Relay: {host}:{port}\n"
                f"Auth:  {'yes' if use_auth else 'no (unauthenticated)'}\n\n"
                "If you received this, sending verification emails will work."
            )
            refused = server.send_message(message, from_addr=from_addr, to_addrs=[to_addr])
            if refused:
                die(f"recipient(s) refused: {refused}")
            ok("message accepted by the relay for delivery")
            info(f"check the inbox of {to_addr}")
        else:
            step("NOOP (no --send, verifying session only)")
            code, msg = server.noop()
            ok(f"NOOP ok ({code})")

    except smtplib.SMTPConnectError as e:
        die(f"connection refused by server: {e}")
    except smtplib.SMTPServerDisconnected as e:
        die(f"server disconnected unexpectedly: {e}")
    except smtplib.SMTPException as e:
        die(f"SMTP error: {e}")
    except (socket.timeout, TimeoutError):
        die(f"timed out after {args.timeout}s connecting to {host}:{port}.")
    except ConnectionRefusedError:
        die(f"connection refused: nothing listening on {host}:{port}?")
    except OSError as e:
        die(f"network error: {e}")
    finally:
        if server is not None:
            try:
                server.quit()
            except Exception:
                pass

    print(_c("32", "\nSMTP check PASSED."))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
