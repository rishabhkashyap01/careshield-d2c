import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Quote } from '../../generated/prisma/client.js';
import { QuoteStatus } from '../../generated/prisma/enums.js';
import type { RequestMeta } from '../../common/request-meta.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { isQuoteExpired } from '../domain/quote-lock.js';
import { QuoteExpiredError } from '../domain/quote-state-machine.js';
import { QuotesRepository } from '../quotes.repository.js';
import type { CheckoutDto } from './checkout.dto.js';
import { hashRequest, IdempotencyService } from './idempotency.service.js';
import {
  type ChargeResult,
  PAYMENT_GATEWAY,
  PaymentDeclinedError,
  type PaymentGateway,
  withTimeout,
} from './payment-gateway.js';
import {
  CHECKOUT_SCOPE,
  PaymentSettlementService,
} from './payment-settlement.service.js';
import type { PolicyResponse } from './policy-response.js';

export type CheckoutBlockReason = 'DECLARATION_REQUIRED' | 'ALREADY_PAID';

export class CheckoutNotAllowedError extends Error {
  constructor(
    readonly quoteId: string,
    readonly reason: CheckoutBlockReason,
  ) {
    super(
      reason === 'ALREADY_PAID'
        ? 'This quote has already been paid for.'
        : 'Complete the medical declaration before paying.',
    );
    this.name = 'CheckoutNotAllowedError';
  }
}

/** Another payment attempt (different Idempotency-Key) for this quote is in flight. */
export class PaymentInProgressError extends Error {
  constructor(readonly quoteId: string) {
    super('A payment for this quote is already being processed.');
    this.name = 'PaymentInProgressError';
  }
}

export interface ProcessingResponse {
  status: 'PAYMENT_PROCESSING';
  quoteId: string;
  message: string;
}

export interface CheckoutOutcome {
  status: 201 | 202;
  body: PolicyResponse | ProcessingResponse;
  replayed: boolean;
}

/**
 * POST /api/v1/insurance/checkout — journey step 3.
 *
 * The payment gateway is NEVER called inside a database transaction (a slow
 * provider would hold a pooled connection and the quote's row lock). Instead:
 *
 *   1. begin   — short transaction: lock the quote, check it is declared and
 *                NOT expired, MEDICAL_DECLARED → PENDING_PAYMENT. COMMIT.
 *                The 15-minute clock is now frozen for this attempt.
 *   2. charge  — call the gateway with no transaction open, with a timeout.
 *   3. settle  — short transaction: PENDING_PAYMENT → PREMIUM_PAID → policy →
 *                POLICY_ISSUED (allowed after expiry), or back to
 *                MEDICAL_DECLARED if the card was declined.
 *
 * If the gateway times out or step 3 fails after the money was captured, the
 * customer gets 202 "processing" (never a false "failed"), and the provider's
 * webhook, the status poll or the scheduled reconciler settles it later —
 * all through PaymentSettlementService, idempotently.
 *
 * The Idempotency-Key (Task 4.2) is claimed first: a repeat of a finished
 * request replays its response; a repeat after 202 resumes the same attempt,
 * and the gateway's own idempotency returns the original charge, so the
 * customer is never charged twice.
 */
@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);
  /** How long a checkout request waits for the gateway before answering 202. */
  gatewayTimeoutMs = Number(process.env.GATEWAY_TIMEOUT_MS ?? 10_000);

  constructor(
    private readonly prisma: PrismaService,
    private readonly quotes: QuotesRepository,
    private readonly idempotency: IdempotencyService,
    private readonly settlement: PaymentSettlementService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
  ) {}

  async checkout(
    idempotencyKey: string,
    dto: CheckoutDto,
    meta?: RequestMeta,
  ): Promise<CheckoutOutcome> {
    const requestHash = hashRequest({
      quoteId: dto.quoteId,
      paymentToken: dto.paymentToken,
    });
    const claim = await this.idempotency.claim(
      CHECKOUT_SCOPE,
      idempotencyKey,
      requestHash,
      dto.quoteId,
    );
    if (claim.kind === 'replay') {
      this.logger.log(`Replaying checkout for key ${idempotencyKey}`);
      return {
        status: 201,
        body: claim.body as unknown as PolicyResponse,
        replayed: true,
      };
    }

    try {
      // 1. begin
      const quote = await this.begin(idempotencyKey, dto.quoteId, meta);

      // 2. charge — no transaction open
      let charge: ChargeResult;
      try {
        charge = await withTimeout(
          this.gateway.charge({
            paymentToken: dto.paymentToken,
            amount: quote.totalPremium,
            currency: quote.currency,
            idempotencyKey,
            quoteId: quote.id,
            description: `CareShield Max premium for quote ${quote.id}`,
          }),
          this.gatewayTimeoutMs,
        );
      } catch (err) {
        if (err instanceof PaymentDeclinedError) {
          await this.settlement.fail(
            quote.id,
            idempotencyKey,
            err.reason,
            'request',
            meta,
          );
          throw err; // 402; the key is released below, so another try can run
        }
        this.logger.warn(
          `Payment outcome for quote ${quote.id} unknown (${(err as Error).message}); awaiting webhook/reconciliation`,
        );
        return this.processing(idempotencyKey, quote.id);
      }

      // 3. settle
      try {
        const body = await this.settlement.settle(
          quote.id,
          idempotencyKey,
          charge,
          'request',
          meta,
        );
        return { status: 201, body, replayed: false };
      } catch (err) {
        // Money captured, but recording it failed (crash, DB blip). The quote
        // stays PENDING_PAYMENT and will be settled; don't report a failure.
        this.logger.error(
          `Captured ${charge.reference} but could not settle quote ${quote.id}`,
          err as Error,
        );
        return this.processing(idempotencyKey, quote.id);
      }
    } catch (err) {
      await this.releaseKey(idempotencyKey);
      throw err;
    }
  }

  /** Step 1, one short transaction. Returns the quote in PENDING_PAYMENT for this key. */
  private begin(key: string, quoteId: string, meta?: RequestMeta) {
    return this.prisma.$transaction(
      async (tx) => {
        const now = new Date();
        const quote = await this.settlement.lockQuote(tx, quoteId);
        switch (quote.status) {
          case QuoteStatus.QUOTE_GENERATED:
            throw new CheckoutNotAllowedError(quoteId, 'DECLARATION_REQUIRED');
          case QuoteStatus.PREMIUM_PAID:
          case QuoteStatus.POLICY_ISSUED:
            throw new CheckoutNotAllowedError(quoteId, 'ALREADY_PAID');
          case QuoteStatus.PENDING_PAYMENT:
            // Same key = a retry of this attempt: resume it. Another key = a
            // second tab or device: one payment per quote at a time.
            if (quote.paymentKey === key) return quote;
            throw new PaymentInProgressError(quoteId);
          case QuoteStatus.MEDICAL_DECLARED:
            if (isQuoteExpired(quote, now))
              throw new QuoteExpiredError(quote.id, quote.expiresAt);
            await this.quotes.setAuditContext(tx, {
              action: 'checkout.payment_started',
              ...meta,
              idempotencyKey: key,
            });
            return this.quotes.transition(
              quoteId,
              QuoteStatus.MEDICAL_DECLARED,
              QuoteStatus.PENDING_PAYMENT,
              { paymentKey: key, paymentStartedAt: now },
              tx,
              now,
            );
        }
      },
      { timeout: 10_000, maxWait: 5_000 },
    ) as Promise<Quote>;
  }

  private async processing(
    key: string,
    quoteId: string,
  ): Promise<CheckoutOutcome> {
    // Not COMPLETED: a retry with this key resumes the same attempt.
    await this.releaseKey(key);
    return {
      status: 202,
      body: {
        status: 'PAYMENT_PROCESSING',
        quoteId,
        message:
          'Your payment is being confirmed. You will not be charged twice.',
      },
      replayed: false,
    };
  }

  private async releaseKey(key: string) {
    await this.idempotency
      .release(CHECKOUT_SCOPE, key)
      .catch((e) =>
        this.logger.error(`Could not release idempotency key ${key}`, e),
      );
  }
}
