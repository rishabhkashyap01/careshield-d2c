import { QuoteStatus } from '../../generated/prisma/enums.js';

/**
 * Quote lifecycle — a finite state machine:
 *
 *   QUOTE_GENERATED → MEDICAL_DECLARED → PENDING_PAYMENT → PREMIUM_PAID → POLICY_ISSUED
 *                            ↑                  │
 *                            └── payment failed ┘
 *
 * PENDING_PAYMENT is committed BEFORE the payment gateway is called, so the
 * gateway round trip never runs inside a database transaction, and it freezes
 * the 15-minute clock: a payment started in time may settle after expiry.
 *
 * The same rules are enforced in PostgreSQL by the `enforce_quote_lifecycle`
 * trigger, so this module is the fast, friendly check and the database is the
 * guarantee.
 */
export const QUOTE_TRANSITIONS: Readonly<
  Record<QuoteStatus, readonly QuoteStatus[]>
> = Object.freeze({
  [QuoteStatus.QUOTE_GENERATED]: [QuoteStatus.MEDICAL_DECLARED],
  [QuoteStatus.MEDICAL_DECLARED]: [QuoteStatus.PENDING_PAYMENT],
  [QuoteStatus.PENDING_PAYMENT]: [
    QuoteStatus.PREMIUM_PAID,
    QuoteStatus.MEDICAL_DECLARED, // payment failed: the customer may retry
  ],
  [QuoteStatus.PREMIUM_PAID]: [QuoteStatus.POLICY_ISSUED],
  [QuoteStatus.POLICY_ISSUED]: [],
});

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

/**
 * Transitions that must happen while the 15-minute quote lock is valid:
 * declaring, and STARTING a payment. Settling or failing a payment that was
 * started in time is allowed after expiry — the clock was frozen.
 */
export function requiresValidLock(from: QuoteStatus, to: QuoteStatus): boolean {
  return (
    (from === QuoteStatus.QUOTE_GENERATED &&
      to === QuoteStatus.MEDICAL_DECLARED) ||
    to === QuoteStatus.PENDING_PAYMENT
  );
}

export function assertTransition(from: QuoteStatus, to: QuoteStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidQuoteTransitionError(from, to);
  }
}
