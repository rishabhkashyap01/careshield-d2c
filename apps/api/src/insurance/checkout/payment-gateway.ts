import type { Prisma } from '../../generated/prisma/client.js';

/** DI token so the real gateway (Razorpay, Stripe…) can replace the mock. */
export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export interface ChargeRequest {
  /** Mock card/UPI token collected by the frontend. */
  paymentToken: string;
  amount: Prisma.Decimal;
  currency: string;
  /**
   * Forwarded to the gateway so the CHARGE itself is idempotent: charging
   * again with the same key returns the original charge (or failure) instead
   * of taking money twice. The gateway's webhooks and lookups carry it too,
   * which is how a late result is matched to its quote.
   */
  idempotencyKey: string;
  /** Metadata echoed back in webhooks (like Stripe `metadata`). */
  quoteId: string;
  description: string;
}

export interface ChargeResult {
  reference: string;
  amount: Prisma.Decimal;
  currency: string;
  capturedAt: Date;
}

/** What the gateway knows about a charge, looked up by its idempotency key. */
export type ChargeLookup =
  | { status: 'succeeded'; charge: ChargeResult }
  | { status: 'failed'; reason: string }
  | { status: 'pending' }
  | { status: 'not_found' };

export interface PaymentGateway {
  /**
   * Resolves when the money is captured. Throws PaymentDeclinedError when the
   * payment definitively failed; any other error means the outcome is UNKNOWN
   * (the charge may still succeed) and must be settled later.
   */
  charge(req: ChargeRequest): Promise<ChargeResult>;
  /** Used by reconciliation when a result never arrived. */
  retrieve(idempotencyKey: string): Promise<ChargeLookup>;
}

export class PaymentDeclinedError extends Error {
  constructor(readonly reason: string) {
    super(`Payment declined: ${reason}`);
    this.name = 'PaymentDeclinedError';
  }
}

/** We stopped waiting; the charge itself may still complete. */
export class GatewayTimeoutError extends Error {
  constructor(readonly afterMs: number) {
    super(`Payment gateway did not answer within ${afterMs} ms`);
    this.name = 'GatewayTimeoutError';
  }
}

export function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new GatewayTimeoutError(ms)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}
