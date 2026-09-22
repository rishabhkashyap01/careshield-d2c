import { Prisma, type Quote } from '../../generated/prisma/client.js';
import { toQuoteResponse } from './quote-response.dto.js';

const created = new Date('2026-09-22T10:00:00.000Z');
const quote = {
  id: '6f1c2b1e-8a4d-4c7e-9b3a-1d2e3f4a5b6c',
  status: 'QUOTE_GENERATED',
  age: 30,
  hasPreExistingConditions: false,
  currency: 'INR',
  basePremium: new Prisma.Decimal('10000.00'),
  ageLoading: new Prisma.Decimal('0.00'),
  conditionLoading: new Prisma.Decimal('0.00'),
  totalPremium: new Prisma.Decimal('10000.00'),
  createdAt: created,
  expiresAt: new Date(created.getTime() + 15 * 60_000),
} as Quote;

describe('toQuoteResponse — server-computed lock time', () => {
  it('reports the remaining lock in ms, measured on the server clock', () => {
    const now = new Date(created.getTime() + 60_000 + 250); // 1 min 0.25 s later
    const body = toQuoteResponse(quote, now);
    expect(body.remainingMs).toBe(14 * 60_000 - 250);
    expect(body.isExpired).toBe(false);
    expect(body).not.toHaveProperty('serverTime');
  });

  it('reports the full 15 minutes for a brand-new quote', () => {
    expect(toQuoteResponse(quote, created).remainingMs).toBe(900_000);
  });

  it('never reports negative time once the lock has passed', () => {
    const body = toQuoteResponse(
      quote,
      new Date(created.getTime() + 20 * 60_000),
    );
    expect(body.remainingMs).toBe(0);
    expect(body.isExpired).toBe(true);
  });

  it('reports 0 but not expired at the exact deadline (expiry is strictly after)', () => {
    const body = toQuoteResponse(quote, quote.expiresAt);
    expect(body.remainingMs).toBe(0);
    expect(body.isExpired).toBe(false);
  });
});
