import type { Quote } from '../../generated/prisma/client.js';
import { isQuoteExpired, QUOTE_LOCK_MS } from '../domain/quote-lock.js';

/**
 * Public shape of a quote. Money is serialised as fixed-2dp strings
 * ("15000.00") so no JSON consumer ever turns it into a float.
 */
export interface QuoteResponse {
  quoteId: string;
  status: Quote['status'];
  applicant: { age: number; hasPreExistingConditions: boolean };
  premium: {
    currency: string;
    base: string;
    ageLoading: string;
    conditionLoading: string;
    total: string;
  };
  createdAt: string;
  /** Quote lock deadline (for display and records — clients must not count down to it). */
  expiresAt: string;
  lockDurationSeconds: number;
  /**
   * Milliseconds of lock left, measured on the SERVER clock when this response
   * was built. The countdown runs off this relative value, so a wrong or
   * changed device clock cannot make the timer early or late.
   */
  remainingMs: number;
  isExpired: boolean;
}

export function toQuoteResponse(quote: Quote, now = new Date()): QuoteResponse {
  return {
    quoteId: quote.id,
    status: quote.status,
    applicant: {
      age: quote.age,
      hasPreExistingConditions: quote.hasPreExistingConditions,
    },
    premium: {
      currency: quote.currency,
      base: quote.basePremium.toFixed(2),
      ageLoading: quote.ageLoading.toFixed(2),
      conditionLoading: quote.conditionLoading.toFixed(2),
      total: quote.totalPremium.toFixed(2),
    },
    createdAt: quote.createdAt.toISOString(),
    expiresAt: quote.expiresAt.toISOString(),
    lockDurationSeconds: QUOTE_LOCK_MS / 1000,
    remainingMs: Math.max(0, quote.expiresAt.getTime() - now.getTime()),
    isExpired: isQuoteExpired(quote, now),
  };
}
