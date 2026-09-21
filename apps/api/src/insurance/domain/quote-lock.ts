/** How long a calculated premium is honoured. */
export const QUOTE_LOCK_MINUTES = 15;
export const QUOTE_LOCK_MS = QUOTE_LOCK_MINUTES * 60 * 1000;

/** expires_at is always derived from the server clock, never the client. */
export function computeExpiresAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + QUOTE_LOCK_MS);
}

export function isQuoteExpired(
  quote: { expiresAt: Date },
  now: Date = new Date(),
): boolean {
  return now.getTime() > quote.expiresAt.getTime();
}
