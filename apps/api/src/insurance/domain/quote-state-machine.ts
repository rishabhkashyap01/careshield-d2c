import { QuoteStatus } from '../../generated/prisma/enums.js';

/**
 * Quote lifecycle — a strictly linear finite state machine:
 *
 *   QUOTE_GENERATED → MEDICAL_DECLARED → PREMIUM_PAID → POLICY_ISSUED
 *
 * The same rules are enforced in PostgreSQL by the `enforce_quote_lifecycle`
 * trigger, so this module is the fast, friendly check and the database is the
 * guarantee.
 */
export const QUOTE_TRANSITIONS: Readonly<
  Record<QuoteStatus, readonly QuoteStatus[]>
> = Object.freeze({
  [QuoteStatus.QUOTE_GENERATED]: [QuoteStatus.MEDICAL_DECLARED],
  [QuoteStatus.MEDICAL_DECLARED]: [QuoteStatus.PREMIUM_PAID],
  [QuoteStatus.PREMIUM_PAID]: [QuoteStatus.POLICY_ISSUED],
  [QuoteStatus.POLICY_ISSUED]: [],
});

/** Transitions that must happen while the 15-minute quote lock is still valid. */
const LOCK_GUARDED_TARGETS: ReadonlySet<QuoteStatus> = new Set([
  QuoteStatus.MEDICAL_DECLARED,
  QuoteStatus.PREMIUM_PAID,
]);

export class InvalidQuoteTransitionError extends Error {
  constructor(
    readonly from: QuoteStatus,
    readonly to: QuoteStatus,
  ) {
    super(`Illegal quote transition ${from} -> ${to}`);
    this.name = 'InvalidQuoteTransitionError';
  }
}

export class QuoteExpiredError extends Error {
  constructor(
    readonly quoteId: string,
    readonly expiresAt: Date,
  ) {
    super(
      `Quote ${quoteId} expired at ${expiresAt.toISOString()}; recalculate the premium`,
    );
    this.name = 'QuoteExpiredError';
  }
}

export function canTransition(from: QuoteStatus, to: QuoteStatus): boolean {
  return QUOTE_TRANSITIONS[from].includes(to);
}

export function nextStatus(from: QuoteStatus): QuoteStatus | null {
  return QUOTE_TRANSITIONS[from][0] ?? null;
}

export function isTerminal(status: QuoteStatus): boolean {
  return QUOTE_TRANSITIONS[status].length === 0;
}

export function requiresValidLock(to: QuoteStatus): boolean {
  return LOCK_GUARDED_TARGETS.has(to);
}

export function assertTransition(from: QuoteStatus, to: QuoteStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidQuoteTransitionError(from, to);
  }
}
