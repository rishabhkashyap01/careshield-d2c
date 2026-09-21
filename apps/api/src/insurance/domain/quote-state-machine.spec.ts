import { QuoteStatus } from '../../generated/prisma/enums.js';
import {
  assertTransition,
  canTransition,
  InvalidQuoteTransitionError,
  requiresValidLock,
} from './quote-state-machine.js';
import {
  computeExpiresAt,
  isQuoteExpired,
  QUOTE_LOCK_MS,
} from './quote-lock.js';

const { QUOTE_GENERATED, MEDICAL_DECLARED, PREMIUM_PAID, POLICY_ISSUED } =
  QuoteStatus;
const ALL = [QUOTE_GENERATED, MEDICAL_DECLARED, PREMIUM_PAID, POLICY_ISSUED];

describe('quote state machine', () => {
  const legal: Array<[QuoteStatus, QuoteStatus]> = [
    [QUOTE_GENERATED, MEDICAL_DECLARED],
    [MEDICAL_DECLARED, PREMIUM_PAID],
    [PREMIUM_PAID, POLICY_ISSUED],
  ];

  it.each(legal)('allows %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => assertTransition(from, to)).not.toThrow();
  });

  it('rejects every other transition (skips, reversals, self-loops)', () => {
    for (const from of ALL) {
      for (const to of ALL) {
        const isLegal = legal.some(([f, t]) => f === from && t === to);
        if (isLegal) continue;
        expect(canTransition(from, to)).toBe(false);
        expect(() => assertTransition(from, to)).toThrow(
          InvalidQuoteTransitionError,
        );
      }
    }
  });

  it('only declaration and payment are guarded by the quote lock', () => {
    expect(ALL.filter(requiresValidLock)).toEqual([
      MEDICAL_DECLARED,
      PREMIUM_PAID,
    ]);
  });
});

describe('quote lock', () => {
  const now = new Date('2026-09-21T10:00:00.000Z');

  it('expires exactly 15 minutes after creation', () => {
    const expiresAt = computeExpiresAt(now);
    expect(expiresAt.toISOString()).toBe('2026-09-21T10:15:00.000Z');
    expect(expiresAt.getTime() - now.getTime()).toBe(QUOTE_LOCK_MS);
  });

  it('is valid up to and including expires_at, expired 1ms after', () => {
    const quote = { expiresAt: computeExpiresAt(now) };
    expect(isQuoteExpired(quote, quote.expiresAt)).toBe(false);
    expect(isQuoteExpired(quote, new Date(quote.expiresAt.getTime() + 1))).toBe(
      true,
    );
  });
});
