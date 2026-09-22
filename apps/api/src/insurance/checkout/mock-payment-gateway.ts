import { Injectable, Logger } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  type ChargeLookup,
  type ChargeRequest,
  type ChargeResult,
  PaymentDeclinedError,
  type PaymentGateway,
} from './payment-gateway.js';
import { type PaymentWebhookEvent, signWebhook } from './webhook-signature.js';

/** Tokens the mock accepts. Anything else is rejected by validation first. */
export const MOCK_PAYMENT_TOKENS = {
  tok_visa_4242: 'approve',
  tok_mastercard_4444: 'approve',
  tok_upi_success: 'approve',
  tok_card_declined: 'decline',
} as const;

export type MockPaymentToken = keyof typeof MOCK_PAYMENT_TOKENS;

type ChargeRecord =
  | { status: 'pending'; done: Promise<ChargeResult> }
  | { status: 'succeeded'; charge: ChargeResult }
  | { status: 'failed'; reason: string };

/**
 * In-memory stand-in for a real payment provider. Like Stripe/Razorpay it is
 * idempotent on `idempotencyKey` (charging again returns the first result),
 * can be asked what happened to a charge (`retrieve`), and reports every
 * result to our webhook, signed with PAYMENT_WEBHOOK_SECRET.
 *
 * Note: its memory is per process. On serverless, a later request may land on
 * another instance that has never seen the charge — a real provider has no
 * such limit.
 */
@Injectable()
export class MockPaymentGateway implements PaymentGateway {
  private readonly logger = new Logger(MockPaymentGateway.name);
  private readonly records = new Map<string, ChargeRecord>();
  /** Simulated network latency (ms). */
  latencyMs = Number(process.env.MOCK_PAYMENT_LATENCY_MS ?? 400);
  /** Where to send webhooks (unset = don't send). */
  webhookUrl: string | undefined = process.env.MOCK_GATEWAY_WEBHOOK_URL;
  webhookSecret: string | undefined = process.env.PAYMENT_WEBHOOK_SECRET;

  /** Successful captures — lets tests prove nobody is charged twice. */
  get chargeCount(): number {
    let n = 0;
    for (const r of this.records.values()) if (r.status === 'succeeded') n++;
    return n;
  }

  charge(req: ChargeRequest): Promise<ChargeResult> {
    const existing = this.records.get(req.idempotencyKey);
    if (existing?.status === 'pending') return existing.done;
    if (existing?.status === 'succeeded') {
      this.logger.log(`Replayed charge ${existing.charge.reference}`);
      return Promise.resolve(existing.charge);
    }
    if (existing?.status === 'failed')
      return Promise.reject(new PaymentDeclinedError(existing.reason));

    const done = this.process(req);
    this.records.set(req.idempotencyKey, { status: 'pending', done });
    return done;
  }

  async retrieve(idempotencyKey: string): Promise<ChargeLookup> {
    const r = this.records.get(idempotencyKey);
    if (!r) return { status: 'not_found' };
    if (r.status === 'pending') return { status: 'pending' };
    if (r.status === 'failed') return { status: 'failed', reason: r.reason };
    return { status: 'succeeded', charge: r.charge };
  }

  private async process(req: ChargeRequest): Promise<ChargeResult> {
    if (this.latencyMs > 0)
      await new Promise((r) => setTimeout(r, this.latencyMs));

    const outcome = MOCK_PAYMENT_TOKENS[req.paymentToken as MockPaymentToken];
    if (outcome !== 'approve') {
      const reason = outcome === 'decline' ? 'card_declined' : 'invalid_token';
      this.records.set(req.idempotencyKey, { status: 'failed', reason });
      void this.notify(req, { type: 'charge.failed', reason });
      throw new PaymentDeclinedError(reason);
    }

    const charge: ChargeResult = {
      reference: `pay_${randomBytes(8).toString('hex')}`,
      amount: req.amount,
      currency: req.currency,
      capturedAt: new Date(),
    };
    this.records.set(req.idempotencyKey, { status: 'succeeded', charge });
    this.logger.log(
      `Captured ${req.currency} ${req.amount.toFixed(2)} as ${charge.reference}`,
    );
    void this.notify(req, { type: 'charge.succeeded', charge });
    return charge;
  }

  /** Fire-and-forget, like a provider: our API must cope if it never arrives. */
  private async notify(
    req: ChargeRequest,
    result:
      | { type: 'charge.succeeded'; charge: ChargeResult }
      | { type: 'charge.failed'; reason: string },
  ): Promise<void> {
    if (!this.webhookUrl || !this.webhookSecret) return;
    const event: PaymentWebhookEvent = {
      id: `evt_${randomUUID()}`,
      type: result.type,
      data:
        result.type === 'charge.succeeded'
          ? {
              idempotencyKey: req.idempotencyKey,
              quoteId: req.quoteId,
              reference: result.charge.reference,
              amount: result.charge.amount.toFixed(2),
              currency: result.charge.currency,
              capturedAt: result.charge.capturedAt.toISOString(),
            }
          : {
              idempotencyKey: req.idempotencyKey,
              quoteId: req.quoteId,
              reason: result.reason,
            },
    };
    const body = JSON.stringify(event);
    try {
      await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Webhook-Signature': signWebhook(this.webhookSecret, body),
        },
        body,
        signal: AbortSignal.timeout(5_000),
      });
    } catch (err) {
      this.logger.warn(
        `Webhook ${event.id} not delivered (${(err as Error).message}); reconciliation will pick it up`,
      );
    }
  }
}
