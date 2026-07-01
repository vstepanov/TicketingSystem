/**
 * Mail service (plan §2.7, §4.2). Sends transactional email via Nodemailer.
 *
 * SMTP is *not* containerised — the app talks to an external relay
 * (`relay1.dataart.com` by default), fully configured from env (§2.1, §11). All
 * mail secrets come from env only; nothing is hard-coded here.
 *
 * The transport is injectable: {@link sendVerificationEmail} accepts a
 * {@link MailTransport} so tests pass a fake that captures the message instead of
 * hitting a real relay. In production the lazily-created Nodemailer transport is
 * used.
 */
import nodemailer from "nodemailer";

import { env } from "@/lib/env";
import { renderVerificationEmail } from "./email-templates";

/**
 * Minimal transport contract we depend on — a subset of Nodemailer's
 * `Transporter`. Injecting this (rather than the concrete transporter) keeps the
 * mail service unit-testable without SMTP.
 */
export interface MailTransport {
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<unknown>;
}

let cachedTransport: MailTransport | undefined;

/**
 * Build (once) the real Nodemailer SMTP transport from env. Auth is only
 * attached when both user and pass are configured — some relays accept
 * unauthenticated mail (§env SMTP_USER/SMTP_PASS optional).
 */
function getDefaultTransport(): MailTransport {
  if (cachedTransport === undefined) {
    cachedTransport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      // STARTTLS on 587 / implicit TLS on 465.
      secure: env.SMTP_PORT === 465,
      auth:
        env.SMTP_USER && env.SMTP_PASS
          ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
          : undefined,
    });
  }
  return cachedTransport;
}

/** Build the verification link containing the raw single-use token (§4.3). */
export function buildVerificationLink(rawToken: string): string {
  const base = env.APP_URL.replace(/\/$/, "");
  return `${base}/verify?token=${encodeURIComponent(rawToken)}`;
}

/**
 * Send the verification email for a freshly issued token.
 *
 * @param to Recipient email.
 * @param rawToken Raw single-use token (only ever transmitted in the link).
 * @param transport Optional transport override (tests inject a fake).
 */
export async function sendVerificationEmail(
  to: string,
  rawToken: string,
  transport: MailTransport = getDefaultTransport(),
): Promise<void> {
  const link = buildVerificationLink(rawToken);
  const { subject, text, html } = renderVerificationEmail(link);
  await transport.sendMail({ from: env.SMTP_FROM, to, subject, text, html });
}
