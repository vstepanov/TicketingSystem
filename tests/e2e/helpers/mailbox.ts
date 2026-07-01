/**
 * Test-only SMTP capture server + mailbox reader (E2E, plan §6.1 "mock SMTP").
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * The signup → verify E2E journey needs the raw single-use verification token.
 * That token is only ever transmitted inside the verification email link; the
 * database stores just a SHA-256 *hash* of it (see src/server/services/
 * token.service.ts), so the raw value CANNOT be recovered from the DB. The
 * production code has no test-only backdoor and we do not add one.
 *
 * Instead the E2E stack points the app-under-test's SMTP settings
 * (SMTP_HOST / SMTP_PORT) at this in-process capture server. Nodemailer speaks
 * plain SMTP to it, we parse just enough of the protocol to grab the message
 * body, persist every captured message to a JSON mailbox file, and the specs
 * read that file to extract the `/verify?token=...` link exactly as a real user
 * would receive it. No production code changes; the token stays out of the DB.
 *
 * This is a *minimal* SMTP responder implemented directly on Node's `net`
 * module so it pulls in no extra dependency (the project has no `smtp-server`).
 * It understands EHLO/HELO, MAIL, RCPT, DATA (terminated by a lone ".") and
 * QUIT — enough for Nodemailer's happy path against an unauthenticated relay.
 * ---------------------------------------------------------------------------
 */
import { createServer, type Server, type Socket } from "node:net";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** One captured outbound message. */
export interface CapturedMail {
  from: string;
  to: string[];
  /** Raw DATA payload (headers + body, CRLF-joined, dot-unstuffed). */
  data: string;
  /** Epoch millis when the message was captured. */
  receivedAt: number;
}

/** Handle to a running capture server. */
export interface MailboxServer {
  /** TCP port the SMTP capture server is listening on. */
  port: number;
  /** Path to the JSON file every captured message is appended to. */
  mailboxFile: string;
  /** Stop the server and release the port. */
  stop: () => Promise<void>;
}

/** Read the mailbox file, tolerating the "not created yet" case. */
async function readMailbox(mailboxFile: string): Promise<CapturedMail[]> {
  try {
    const raw = await readFile(mailboxFile, "utf8");
    return raw.trim() ? (JSON.parse(raw) as CapturedMail[]) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/**
 * Handle a single SMTP conversation on `socket`, appending any fully-received
 * message to `mailboxFile`. Deliberately liberal: it accepts every verb with a
 * generic 250 and only special-cases the state machine we need.
 */
function handleConnection(socket: Socket, mailboxFile: string): void {
  let buffer = "";
  let inData = false;
  let dataLines: string[] = [];
  let mailFrom = "";
  const rcptTo: string[] = [];

  const send = (line: string) => socket.write(`${line}\r\n`);
  send("220 test-smtp ready");

  socket.setEncoding("utf8");
  socket.on("data", (chunk: string) => {
    buffer += chunk;

    // Process complete CRLF-terminated lines.
    let idx: number;
    while ((idx = buffer.indexOf("\r\n")) !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      if (inData) {
        if (line === ".") {
          // End of DATA. Unstuff leading dots (SMTP dot-stuffing) and persist.
          const data = dataLines
            .map((l) => (l.startsWith("..") ? l.slice(1) : l))
            .join("\r\n");
          const message: CapturedMail = {
            from: mailFrom,
            to: [...rcptTo],
            data,
            receivedAt: Date.now(),
          };
          // Append atomically enough for a single-process test run.
          void readMailbox(mailboxFile)
            .then((existing) =>
              writeFile(mailboxFile, JSON.stringify([...existing, message])),
            )
            .then(() => send("250 message accepted"))
            .catch(() => send("451 mailbox write failed"));
          inData = false;
          dataLines = [];
          mailFrom = "";
          rcptTo.length = 0;
        } else {
          dataLines.push(line);
        }
        continue;
      }

      const upper = line.toUpperCase();
      if (upper.startsWith("EHLO") || upper.startsWith("HELO")) {
        // Advertise no AUTH so Nodemailer sends mail unauthenticated.
        send("250-test-smtp");
        send("250 SIZE 10485760");
      } else if (upper.startsWith("MAIL FROM")) {
        mailFrom = line.slice(line.indexOf(":") + 1).trim();
        send("250 sender ok");
      } else if (upper.startsWith("RCPT TO")) {
        rcptTo.push(line.slice(line.indexOf(":") + 1).trim());
        send("250 recipient ok");
      } else if (upper === "DATA") {
        inData = true;
        send("354 start mail input; end with <CRLF>.<CRLF>");
      } else if (upper === "QUIT") {
        send("221 bye");
        socket.end();
      } else if (upper === "RSET") {
        mailFrom = "";
        rcptTo.length = 0;
        send("250 reset ok");
      } else if (upper === "NOOP") {
        send("250 ok");
      } else {
        // Be permissive with anything else (e.g. STARTTLS is simply refused so
        // Nodemailer falls back to plaintext when `secure:false` + no TLS need).
        send("250 ok");
      }
    }
  });

  socket.on("error", () => {
    /* ignore: connection reset by client is normal after QUIT */
  });
}

/**
 * Start the SMTP capture server on a random free port with a fresh mailbox
 * file. Callers pass the resulting `port` to the app-under-test via SMTP_PORT.
 */
export async function startMailboxServer(): Promise<MailboxServer> {
  const dir = await mkdtemp(join(tmpdir(), "ticketing-mail-"));
  const mailboxFile = join(dir, "mailbox.json");
  await writeFile(mailboxFile, "[]");

  const server: Server = createServer((socket) =>
    handleConnection(socket, mailboxFile),
  );

  const port: number = await new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("Could not determine mailbox server port."));
        return;
      }
      resolve(address.port);
    });
  });

  const stop = () =>
    new Promise<void>((resolve) => server.close(() => resolve()));

  return { port, mailboxFile, stop };
}

/**
 * Poll the mailbox file until a message addressed to `recipient` appears, then
 * return the `/verify?token=...` link extracted from its body.
 *
 * @throws if no matching message with a verification link arrives before the
 *   timeout — surfaces as a clear E2E failure rather than a silent hang.
 */
export async function waitForVerificationLink(
  mailboxFile: string,
  recipient: string,
  timeoutMs = 15_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  const wanted = recipient.toLowerCase();

  while (Date.now() < deadline) {
    const mails = await readMailbox(mailboxFile);
    for (const mail of mails) {
      const addressed = mail.to.some((t) => t.toLowerCase().includes(wanted));
      if (!addressed) continue;
      const link = extractVerificationLink(mail.data);
      if (link) return link;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(
    `No verification email for ${recipient} arrived within ${timeoutMs}ms.`,
  );
}

/**
 * Pull the verification URL out of a raw email body. Emails may be
 * quoted-printable encoded (Nodemailer default for the HTML part), so we first
 * undo the common `=\r\n` soft-breaks and `=3D` (`=`) escapes before matching.
 */
export function extractVerificationLink(data: string): string | undefined {
  const decoded = data
    .replace(/=\r\n/g, "")
    .replace(/=\n/g, "")
    .replace(/=3D/gi, "=");
  const match = decoded.match(/https?:\/\/[^\s"'<>]+\/verify\?token=[^\s"'<>]+/);
  return match?.[0];
}
