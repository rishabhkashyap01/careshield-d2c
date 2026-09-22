/**
 * Generated tests for webhook signatures, idempotency request hashing and the
 * public quote / policy response shapes.
 */
import fc from 'fast-check';
import {
  Prisma,
  type Policy,
  type Quote,
} from '../../generated/prisma/client.js';
import { calculatePremium } from '../domain/premium-calculator.js';
import { computeExpiresAt, QUOTE_LOCK_MS } from '../domain/quote-lock.js';
import { toQuoteResponse } from '../dto/quote-response.dto.js';
import { hashRequest } from './idempotency.service.js';
import { toPolicyResponse } from './policy-response.js';
import {
  signWebhook,
  verifyWebhook,
  WEBHOOK_TOLERANCE_SECONDS,
} from './webhook-signature.js';

const secret = fc.string({ minLength: 1, maxLength: 64 });
const payload = fc.oneof(
  fc.string({ maxLength: 400 }),
  fc.json({ maxDepth: 3 }),
  fc.string({ unit: 'binary', maxLength: 200 }), // any Unicode, incl. emoji and ₹
);
const unixNow = fc.integer({ min: 1_000_000_000, max: 4_000_000_000 });

describe('webhook signatures (generated)', () => {
  it('a body signed with the secret always verifies within the time window', () => {
    fc.assert(
      fc.property(
        secret,
        payload,
        unixNow,
        fc.integer({
          min: -WEBHOOK_TOLERANCE_SECONDS,
          max: WEBHOOK_TOLERANCE_SECONDS,
        }),
        (s, body, now, skew) => {
          const header = signWebhook(s, body, now + skew);
          expect(verifyWebhook(s, body, header, now)).toBe(true);
        },
      ),
    );
  });

  it('any change to the body, however small, fails verification', () => {
    fc.assert(
      fc.property(
        secret,
        payload,
        unixNow,
        fc.nat(),
        fc.string({ minLength: 1, maxLength: 3 }),
        (s, body, now, pos, insert) => {
          const i = body.length ? pos % (body.length + 1) : 0;
          const tampered = body.slice(0, i) + insert + body.slice(i);
          fc.pre(tampered !== body);
          expect(
            verifyWebhook(s, tampered, signWebhook(s, body, now), now),
          ).toBe(false);
        },
      ),
    );
  });

  it('a different secret never verifies', () => {
    fc.assert(
      fc.property(secret, secret, payload, unixNow, (s1, s2, body, now) => {
        fc.pre(s1 !== s2);
        expect(verifyWebhook(s2, body, signWebhook(s1, body, now), now)).toBe(
          false,
        );
      }),
    );
  });

  it('events outside the ±5 minute window are refused (no replaying old events)', () => {
    fc.assert(
      fc.property(
        secret,
        payload,
        unixNow,
        fc.integer({ min: WEBHOOK_TOLERANCE_SECONDS + 1, max: 10 ** 7 }),
        fc.boolean(),
        (s, body, now, gap, future) => {
          const t = future ? now + gap : now - gap;
          expect(verifyWebhook(s, body, signWebhook(s, body, t), now)).toBe(
            false,
          );
        },
      ),
    );
  });

  it('garbage headers are refused without throwing', () => {
    fc.assert(
      fc.property(
        secret,
        payload,
        fc.option(fc.string({ maxLength: 120 }), { nil: undefined }),
        (s, body, header) => {
          expect(() => verifyWebhook(s, body, header)).not.toThrow();
          expect(verifyWebhook(s, body, header)).toBe(false);
        },
      ),
    );
  });
});

describe('idempotency request hash (generated)', () => {
  const request = fc.record({ quoteId: fc.uuid(), paymentToken: fc.string() });

  it('is stable for the same request and differs for different ones', () => {
    fc.assert(
      fc.property(request, request, (a, b) => {
        expect(hashRequest(a)).toBe(hashRequest({ ...a }));
        expect(hashRequest(a)).toMatch(/^[0-9a-f]{64}$/);
        if (a.quoteId !== b.quoteId || a.paymentToken !== b.paymentToken)
          expect(hashRequest(a)).not.toBe(hashRequest(b));
      }),
    );
  });
});

const instant = fc.date({
  min: new Date('2000-01-01'),
  max: new Date('2100-01-01'),
  noInvalidDate: true,
});
const quoteArb = fc
  .record({
    age: fc.integer({ min: 18, max: 99 }),
    pec: fc.boolean(),
    created: instant,
    id: fc.uuid(),
  })
  .map(({ age, pec, created, id }) => {
    const p = calculatePremium({ age, hasPreExistingConditions: pec });
    return {
      id,
      status: 'QUOTE_GENERATED',
      age,
      hasPreExistingConditions: pec,
      currency: p.currency,
      basePremium: p.basePremium,
      ageLoading: p.ageLoading,
      conditionLoading: p.conditionLoading,
      totalPremium: p.totalPremium,
      createdAt: created,
      expiresAt: computeExpiresAt(created),
    } as Quote;
  });
const MONEY = /^\d{1,8}\.\d{2}$/;

describe('quote response (generated)', () => {
  it('remainingMs is the server-measured time left: never negative, never over 15 minutes, 0 exactly when expired or at the deadline', () => {
    fc.assert(
      fc.property(
        quoteArb,
        fc.integer({ min: -60_000, max: 2 * QUOTE_LOCK_MS }),
        (quote, sinceCreated) => {
          const now = new Date(quote.createdAt.getTime() + sinceCreated);
          const body = toQuoteResponse(quote, now);
          const left = quote.expiresAt.getTime() - now.getTime();
          expect(body.remainingMs).toBe(Math.max(0, left));
          expect(body.remainingMs).toBeLessThanOrEqual(QUOTE_LOCK_MS + 60_000);
          expect(body.isExpired).toBe(left < 0);
        },
      ),
    );
  });

  it('money is always a 2-decimal string that adds up, and dates are ISO', () => {
    fc.assert(
      fc.property(quoteArb, (quote) => {
        const b = toQuoteResponse(quote);
        for (const v of Object.values(b.premium).filter(
          (x) => x !== b.premium.currency,
        ))
          expect(v).toMatch(MONEY);
        const sum = new Prisma.Decimal(b.premium.base)
          .add(b.premium.ageLoading)
          .add(b.premium.conditionLoading);
        expect(sum.toFixed(2)).toBe(b.premium.total);
        expect(new Date(b.expiresAt).toISOString()).toBe(b.expiresAt);
        expect(JSON.parse(JSON.stringify(b))).toEqual(b); // survives JSON unchanged
      }),
    );
  });

  it('policy responses carry the paid amount as a 2-decimal string and a 1-year cover window', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('10000.00', '15000.00', '20000.00'),
        instant,
        (amount, issued) => {
          const end = new Date(issued);
          end.setUTCFullYear(end.getUTCFullYear() + 1);
          const policy = {
            policyNumber: 'CSM-2026-000001',
            quoteId: '6f1c2b1e-8a4d-4c7e-9b3a-1d2e3f4a5b6c',
            premiumPaid: new Prisma.Decimal(amount),
            currency: 'INR',
            paymentReference: 'pay_0123456789abcdef',
            coverageStart: issued,
            coverageEnd: end,
            issuedAt: issued,
          } as Policy;
          const b = toPolicyResponse(policy);
          expect(b.premiumPaid).toBe(amount);
          expect(b.status).toBe('POLICY_ISSUED');
          expect(Date.parse(b.coverageEnd)).toBeGreaterThan(
            Date.parse(b.coverageStart),
          );
        },
      ),
    );
  });
});
