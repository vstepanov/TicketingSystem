/**
 * Email templates (plan §2.7). Pure rendering functions — no I/O — so they are
 * trivially unit-testable and reused by the mail service.
 */

/** Product name shown in emails. */
const BRAND = "Ticket Tracker";

/** A rendered email: subject + plain-text and HTML bodies. */
export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/**
 * Render the account-verification email around a verification `link`. The link
 * carries the raw single-use token; the DB stores only its hash.
 */
export function renderVerificationEmail(link: string): RenderedEmail {
  const subject = `Verify your ${BRAND} account`;
  const text = [
    `Welcome to ${BRAND}!`,
    "",
    "Please verify your email address by opening the link below:",
    link,
    "",
    "This link expires in 24 hours and can be used only once.",
    "If you did not create an account, you can ignore this email.",
  ].join("\n");

  const html = [
    `<p>Welcome to ${BRAND}!</p>`,
    "<p>Please verify your email address by clicking the link below:</p>",
    `<p><a href="${link}">Verify my email</a></p>`,
    "<p>This link expires in 24 hours and can be used only once.</p>",
    "<p>If you did not create an account, you can ignore this email.</p>",
  ].join("\n");

  return { subject, text, html };
}
