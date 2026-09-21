import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  type ChargeRequest,
  type ChargeResult,
  PaymentDeclinedError,
  type PaymentGateway,
} from './payment-gateway.js';

/** Tokens the mock accepts. Anything else is rejected by validation first. */
export const MOCK_PAYMENT_TOKENS = {
  tok_visa_4242: 'approve',
  tok_mastercard_4444: 'approve',
  tok_upi_success: 'approve',
  tok_card_declined: 'decline',
} as const;

export type MockPaymentToken = keyof typeof MOCK_PAYMENT_TOKENS;

/**
 * In-memory stand-in for a real payment provider. Like Stripe/Razorpay it is
 * idempotent on `idempotencyKey`: charging twice with the same key returns the
 * first charge. `chargeCount` lets tests prove nobody is charged twice.
 */
@Injectable()
export class MockPaymentGateway implements PaymentGateway {
  private readonly logger = new Logger(MockPaymentGateway.name);
  private readonly charges = new Map<string, ChargeResult>();
  /** Simulated network latency (ms). */
  latencyMs = Number(process.env.MOCK_PAYMENT_LATENCY_MS ?? 400);

  get chargeCount(): number {
    return this.charges.size;
  }

  async charge(req: ChargeRequest): Promise<ChargeResult> {
    const existing = this.charges.get(req.idempotencyKey);
    if (existing) {
      this.logger.log(
        `Replayed charge ${existing.reference} for key ${req.idempotencyKey}`,
      );
      return existing;
    }

    if (this.latencyMs > 0)
      await new Promise((r) => setTimeout(r, this.latencyMs));

    const outcome = MOCK_PAYMENT_TOKENS[req.paymentToken as MockPaymentToken];
    if (outcome !== 'approve') {
      throw new PaymentDeclinedError(
        outcome === 'decline' ? 'card_declined' : 'invalid_token',
      );
    }

    const result: ChargeResult = {
      reference: `pay_${randomBytes(8).toString('hex')}`,
      amount: req.amount,
      currency: req.currency,
      capturedAt: new Date(),
    };
    this.charges.set(req.idempotencyKey, result);
    this.logger.log(
      `Captured ${req.currency} ${req.amount.toFixed(2)} as ${result.reference}`,
    );
    return result;
  }
}
