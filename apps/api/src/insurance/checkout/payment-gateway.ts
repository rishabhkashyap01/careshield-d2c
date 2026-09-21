import type { Prisma } from '../../generated/prisma/client.js';

/** DI token so the real gateway (Razorpay, Stripe…) can replace the mock. */
export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export interface ChargeRequest {
  /** Mock card/UPI token collected by the frontend. */
  paymentToken: string;
  amount: Prisma.Decimal;
  currency: string;
  /**
   * Forwarded to the gateway so the CHARGE itself is idempotent: if our DB
   * transaction rolls back after a successful charge, a retry with the same
   * key gets the original charge back instead of taking money twice.
   */
  idempotencyKey: string;
  description: string;
}

export interface ChargeResult {
  reference: string;
  amount: Prisma.Decimal;
  currency: string;
  capturedAt: Date;
}

export interface PaymentGateway {
  charge(req: ChargeRequest): Promise<ChargeResult>;
}

export class PaymentDeclinedError extends Error {
  constructor(readonly reason: string) {
    super(`Payment declined: ${reason}`);
    this.name = 'PaymentDeclinedError';
  }
}
