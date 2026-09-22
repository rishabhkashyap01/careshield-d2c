/**
 * Generated tests for the pricing rules and the 15-minute quote lock.
 * fast-check invents the applicants and clocks; each `it` states a rule that
 * must hold for ALL of them.
 */
import fc from 'fast-check';
import { Prisma } from '../../generated/prisma/client.js';
import { calculatePremium, PRICING } from './premium-calculator.js';
import {
  computeExpiresAt,
  isQuoteExpired,
  QUOTE_LOCK_MS,
} from './quote-lock.js';

/**
 * Ages 0–150, with the boundaries of every rule weighted in: purely random
 * integers hit exactly 45 only about half the time in 100 runs, so a bug like
 * `>=` instead of `>` could slip through. Boundaries are always tried.
 */
const age = fc.oneof(
  {
    weight: 1,
    arbitrary: fc.constantFrom(0, 17, 18, 44, 45, 46, 47, 99, 100, 150),
  },
  { weight: 3, arbitrary: fc.integer({ min: 0, max: 150 }) },
);
const applicant = fc.record({ age, hasPreExistingConditions: fc.boolean() });
/** Any instant between 1970 and 2200 (ms precision, like the database). */
const instant = fc.date({
  min: new Date(0),
  max: new Date('2200-01-01T00:00:00Z'),
  noInvalidDate: true,
});

/** The brief, written independently of the implementation, in whole rupees. */
function expectedTotal(a: { age: number; hasPreExistingConditions: boolean }) {
  return (
    10_000 + (a.age > 45 ? 5_000 : 0) + (a.hasPreExistingConditions ? 5_000 : 0)
  );
}

describe('premium calculation (generated)', () => {
  it('matches the brief for every applicant: ₹10,000 base, +50% over 45, +₹5,000 for conditions', () => {
    fc.assert(
      fc.property(applicant, (a) => {
        const p = calculatePremium(a);
        expect(p.totalPremium.toNumber()).toBe(expectedTotal(a));
        expect(p.basePremium.toFixed(2)).toBe('10000.00');
        expect(p.ageLoading.toFixed(2)).toBe(a.age > 45 ? '5000.00' : '0.00');
        expect(p.conditionLoading.toFixed(2)).toBe(
          a.hasPreExistingConditions ? '5000.00' : '0.00',
        );
      }),
    );
  });

  it('total always equals base + loadings, exactly (the same rule the DB CHECK enforces)', () => {
    fc.assert(
      fc.property(applicant, (a) => {
        const p = calculatePremium(a);
        expect(
          p.basePremium
            .add(p.ageLoading)
            .add(p.conditionLoading)
            .equals(p.totalPremium),
        ).toBe(true);
      }),
    );
  });

  it('every amount fits NUMERIC(10,2): 2 decimals, non-negative, below 10^8', () => {
    fc.assert(
      fc.property(applicant, (a) => {
        const p = calculatePremium(a);
        for (const d of [
          p.basePremium,
          p.ageLoading,
          p.conditionLoading,
          p.totalPremium,
        ]) {
          expect(d.decimalPlaces()).toBeLessThanOrEqual(2);
          expect(d.isNegative()).toBe(false);
          expect(d.lessThan(new Prisma.Decimal('100000000'))).toBe(true);
        }
      }),
    );
  });

  it('is deterministic: the same applicant always gets the same price', () => {
    fc.assert(
      fc.property(applicant, (a) => {
        expect(calculatePremium(a)).toEqual(calculatePremium({ ...a }));
      }),
    );
  });

  it('never gets cheaper as the applicant gets older, or when conditions are added', () => {
    fc.assert(
      fc.property(age, age, fc.boolean(), (x, y, pec) => {
        const [young, old] = x <= y ? [x, y] : [y, x];
        const a = calculatePremium({
          age: young,
          hasPreExistingConditions: pec,
        });
        const b = calculatePremium({ age: old, hasPreExistingConditions: pec });
        expect(b.totalPremium.greaterThanOrEqualTo(a.totalPremium)).toBe(true);
        const withConditions = calculatePremium({
          age: x,
          hasPreExistingConditions: true,
        });
        const without = calculatePremium({
          age: x,
          hasPreExistingConditions: false,
        });
        expect(
          withConditions.totalPremium.minus(without.totalPremium).toNumber(),
        ).toBe(5_000);
      }),
    );
  });

  it('only ever produces one of the three possible prices', () => {
    fc.assert(
      fc.property(applicant, (a) => {
        expect(['10000.00', '15000.00', '20000.00']).toContain(
          calculatePremium(a).totalPremium.toFixed(2),
        );
      }),
    );
  });

  it('refuses any age that is not a non-negative whole number', () => {
    const badAge = fc.oneof(
      fc.integer({ max: -1 }),
      fc.double({ noNaN: false }).filter((n) => !Number.isInteger(n) || n < 0),
    );
    fc.assert(
      fc.property(badAge, fc.boolean(), (n, pec) => {
        expect(() =>
          calculatePremium({ age: n, hasPreExistingConditions: pec }),
        ).toThrow(RangeError);
      }),
    );
  });

  it('uses the published constants', () => {
    expect(PRICING.ageLoadingThreshold).toBe(45);
    expect(PRICING.ageLoadingRate.toNumber()).toBe(0.5);
  });
});

describe('15-minute quote lock (generated)', () => {
  it('expires exactly 15 minutes after any creation time, to the millisecond', () => {
    fc.assert(
      fc.property(instant, (created) => {
        expect(computeExpiresAt(created).getTime() - created.getTime()).toBe(
          QUOTE_LOCK_MS,
        );
      }),
    );
  });

  it('is valid up to and including expires_at, and expired from 1 ms after', () => {
    fc.assert(
      fc.property(
        instant,
        fc.integer({ min: -QUOTE_LOCK_MS, max: QUOTE_LOCK_MS }),
        (created, offset) => {
          const quote = { expiresAt: computeExpiresAt(created) };
          const now = new Date(quote.expiresAt.getTime() + offset);
          expect(isQuoteExpired(quote, now)).toBe(offset > 0);
        },
      ),
    );
  });

  it('once expired, stays expired as time moves on', () => {
    fc.assert(
      fc.property(instant, fc.nat(), fc.nat(), (created, a, b) => {
        const quote = { expiresAt: computeExpiresAt(created) };
        const t1 = new Date(quote.expiresAt.getTime() + 1 + Math.min(a, b));
        const t2 = new Date(quote.expiresAt.getTime() + 1 + Math.max(a, b));
        expect(isQuoteExpired(quote, t1)).toBe(true);
        expect(isQuoteExpired(quote, t2)).toBe(true);
      }),
    );
  });
});
