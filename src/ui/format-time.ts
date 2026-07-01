/**
 * Shared time formatting helpers (plan §0.1 — Wave 0 consolidation).
 *
 * Previously each view carried its own local `formatUtc` copy (TicketCard,
 * TeamRow, EpicRow, use-ticket). Those are consolidated here so timestamp
 * formatting lives in exactly one place. This module exposes three pure
 * functions:
 *
 *   - {@link formatCompactUtc} — `YYYY-MM-DD HH:MM UTC`. This preserves the
 *     EXACT visible output of the previous `formatUtc` copies and is what every
 *     current call site uses (Wave 0 changes no visible output).
 *   - {@link formatRelative} — relative time ("2h ago", "Yesterday", "Jun 20",
 *     …) for board/table use. Exported for LATER waves; not yet wired anywhere.
 *   - {@link formatMonthDayUtc} — `Mon D, HH:MM UTC` for the ticket meta line.
 *     Exported for a LATER wave; not yet wired anywhere.
 *
 * Every function guards `Number.isNaN(date.getTime())` and returns the raw
 * `iso` string on invalid input, matching the previous behavior.
 */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Compact, explicit UTC display: `YYYY-MM-DD HH:MM UTC`
 * (e.g. "2025-06-22 09:15 UTC"). Preserves the previous `formatUtc` output.
 */
export function formatCompactUtc(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const y = date.getUTCFullYear();
  const mo = pad(date.getUTCMonth() + 1);
  const d = pad(date.getUTCDate());
  const h = pad(date.getUTCHours());
  const mi = pad(date.getUTCMinutes());
  return `${y}-${mo}-${d} ${h}:${mi} UTC`;
}

/**
 * Month-name UTC display: `Mon D, HH:MM UTC` (e.g. "Jun 22, 09:15 UTC").
 * For the ticket meta line — wired up in a later wave.
 */
export function formatMonthDayUtc(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const mo = MONTHS[date.getUTCMonth()];
  const d = date.getUTCDate();
  const h = pad(date.getUTCHours());
  const mi = pad(date.getUTCMinutes());
  return `${mo} ${d}, ${h}:${mi} UTC`;
}

/**
 * Relative time for board/table use. Rules:
 *   - < 60s or < 60m → "Xm ago" (0m ago at the low end)
 *   - < 24h → "Xh ago"
 *   - exactly 1 day ago (24h ≤ Δ < 48h) → "Yesterday"
 *   - same UTC calendar day → "Today HH:MM"
 *   - within the current year → "Mon D" (e.g. "Jun 20")
 *   - otherwise → "Mon D, YYYY"
 *
 * Exported for a later wave; not yet wired anywhere.
 */
export function formatRelative(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  const sameUtcDay =
    date.getUTCFullYear() === now.getUTCFullYear() &&
    date.getUTCMonth() === now.getUTCMonth() &&
    date.getUTCDate() === now.getUTCDate();

  if (diffMs >= 0 && diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  if (diffMs >= 0 && diffHours < 24) {
    return `${diffHours}h ago`;
  }
  if (diffMs >= 0 && diffDays === 1) {
    return "Yesterday";
  }
  if (sameUtcDay) {
    return `Today ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
  }

  const mo = MONTHS[date.getUTCMonth()];
  const d = date.getUTCDate();
  if (date.getUTCFullYear() === now.getUTCFullYear()) {
    return `${mo} ${d}`;
  }
  return `${mo} ${d}, ${date.getUTCFullYear()}`;
}
