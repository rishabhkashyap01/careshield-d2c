import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, type Quote } from '../../generated/prisma/client.js';
import { QuoteStatus } from '../../generated/prisma/enums.js';
import type { RequestMeta } from '../../common/request-meta.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { QuotesRepository } from '../quotes.repository.js';
import { IdempotencyService } from './idempotency.service.js';
import {
  type ChargeResult,
  PAYMENT_GATEWAY,
  type PaymentGateway,
} from './payment-gateway.js';
import { PolicyIssuer } from './policy-issuer.service.js';
import { type PolicyResponse, toPolicyResponse } from './policy-response.js';
import type { PaymentWebhookEvent } from './webhook-signature.js';

export const CHECKOUT_SCOPE = 'checkout';

/** Who settled a payment — recorded in the audit trail. */
export type SettledVia = 'request' | 'webhook' | 'reconciler';

/**
 * A capture that cannot be applied to its quote (it was already paid by
 * another charge, the attempt was abandoned, or the amount differs). Nothing
 * is changed; the money must be refunded by an operator.
 */
export class PaymentSettlementConflictError extends Error {
  constructor(
    readonly quoteId: string,
    readonly detail: string,
  ) {
    super(`Payment for quote ${quoteId} cannot be applied: ${detail}`);
    this.name = 'PaymentSettlementConflictError';
  }
}

export type PaymentStatus =
  | { state: 'ISSUED'; quoteId: string; policy: PolicyResponse }
  | { state: 'PROCESSING'; quoteId: string }
  | { state: 'NOT_PAID'; quoteId: string; lastFailure?: string };

/** Poll-time reconciliation only asks the gateway once a payment is this old. */
export const RECONCILE_AFTER_MS = 5_000;
/** A payment the gateway has never heard of is given up after this long. */
export const ABANDON_AFTER_MS = 2 * 60_000;

const SHORT_TX = { timeout: 10_000, maxWait: 5_000 };

/**
 * Step 3 of checkout: apply a payment result to the quote, in ONE SHORT
 * transaction. Used by the checkout request itself, by the payment
 * provider's webhook and by reconciliation — whichever gets there first wins,
 * and the others become no-ops (every method is idempotent).
 */
@Injectable()
export class PaymentSettlementService {
  private readonly logger = new Logger(PaymentSettlementService.name);
  /** A pending payment is reconciled on poll once it is this old. */
  reconcileAfterMs = RECONCILE_AFTER_MS;

  constructor(
    private readonly prisma: PrismaService,
    private readonly quotes: QuotesRepository,
    private readonly idempotency: IdempotencyService,
    private readonly issuer: PolicyIssuer,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
  ) {}

  /** PENDING_PAYMENT → PREMIUM_PAID → policy → POLICY_ISSUED. No expiry check: the clock was frozen. */
  settle(
    quoteId: string,
    key: string,
    charge: ChargeResult,
    via: SettledVia,
    meta?: RequestMeta,
  ): Promise<PolicyResponse> {
    return this.prisma.$transaction(async (tx) => {
      const quote = await this.lockQuote(tx, quoteId);

      if (quote.status === QuoteStatus.POLICY_ISSUED) {
        const policy = await tx.policy.findUniqueOrThrow({
          where: { quoteId },
        });
        if (policy.paymentReference !== charge.reference) {
          throw new PaymentSettlementConflictError(
            quoteId,
            `already paid by ${policy.paymentReference}; refund ${charge.reference}`,
          );
        }
        const body = toPolicyResponse(policy); // already settled — idempotent
        await this.idempotency.complete(tx, CHECKOUT_SCOPE, key, 201, {
          ...body,
        });
        return body;
      }
      if (
        quote.status !== QuoteStatus.PENDING_PAYMENT ||
        quote.paymentKey !== key
      ) {
        throw new PaymentSettlementConflictError(
          quoteId,
          `quote is ${quote.status} (attempt ${quote.paymentKey ?? 'none'}); refund ${charge.reference}`,
        );
      }
      if (
        !charge.amount.equals(quote.totalPremium) ||
        charge.currency !== quote.currency
      ) {
        throw new PaymentSettlementConflictError(
          quoteId,
          `captured ${charge.currency} ${charge.amount.toFixed(2)} but quoted ${quote.currency} ${quote.totalPremium.toFixed(2)}`,
        );
      }

      const now = new Date();
      await this.quotes.setAuditContext(tx, {
        action: 'checkout.premium_paid',
        ...meta,
        via,
        idempotencyKey: key,
        paymentReference: charge.reference,
      });
      await this.quotes.transition(
        quoteId,
        QuoteStatus.PENDING_PAYMENT,
        QuoteStatus.PREMIUM_PAID,
        {},
        tx,
        now,
      );
      const policy = await this.issuer.issue(tx, quote, charge, now);
      await this.quotes.setAuditContext(tx, {
        action: 'checkout.policy_issued',
        ...meta,
        via,
        idempotencyKey: key,
        policyNumber: policy.policyNumber,
      });
      await this.quotes.transition(
        quoteId,
        QuoteStatus.PREMIUM_PAID,
        QuoteStatus.POLICY_ISSUED,
        {},
        tx,
        now,
      );

      const body = toPolicyResponse(policy);
      // Same transaction: a later retry of this checkout replays the policy.
      await this.idempotency.complete(tx, CHECKOUT_SCOPE, key, 201, {
        ...body,
      });
      this.logger.log(
        `Issued ${body.policyNumber} for quote ${quoteId} (via ${via})`,
      );
      return body;
    }, SHORT_TX);
  }

  /** PENDING_PAYMENT → MEDICAL_DECLARED when the payment definitively failed. Returns false if there was nothing to fail. */
  fail(
    quoteId: string,
    key: string,
    reason: string,
    via: SettledVia,
    meta?: RequestMeta,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const quote = await this.lockQuote(tx, quoteId);
      if (
        quote.status !== QuoteStatus.PENDING_PAYMENT ||
        quote.paymentKey !== key
      ) {
        return false;
      }
      await this.quotes.setAuditContext(tx, {
        action: 'checkout.payment_failed',
        ...meta,
        via,
        idempotencyKey: key,
        reason,
      });
      await this.quotes.transition(
        quoteId,
        QuoteStatus.PENDING_PAYMENT,
        QuoteStatus.MEDICAL_DECLARED,
        { paymentKey: null, paymentStartedAt: null },
        tx,
      );
      this.logger.log(
        `Payment for quote ${quoteId} failed (${reason}, via ${via})`,
      );
      return true;
    }, SHORT_TX);
  }

  /** Apply a verified webhook event. */
  async applyEvent(
    event: PaymentWebhookEvent,
  ): Promise<'settled' | 'failed' | 'ignored'> {
    const { quoteId, idempotencyKey: key } = event.data;
    try {
      if (event.type === 'charge.failed') {
        const changed = await this.fail(
          quoteId,
          key,
          event.data.reason ?? 'failed',
          'webhook',
        );
        return changed ? 'failed' : 'ignored';
      }
      await this.settle(
        quoteId,
        key,
        {
          reference: event.data.reference!,
          amount: new Prisma.Decimal(event.data.amount!),
          currency: event.data.currency!,
          capturedAt: new Date(event.data.capturedAt!),
        },
        'webhook',
      );
      return 'settled';
    } catch (err) {
      if (
        err instanceof PaymentSettlementConflictError ||
        err instanceof NotFoundException
      ) {
        // Acknowledge (so the provider stops retrying) but flag for a human.
        this.logger.error(`Webhook ${event.id} ignored: ${err.message}`);
        return 'ignored';
      }
      throw err; // e.g. database down → 5xx → the provider retries later
    }
  }

  /** Ask the gateway what happened to a payment we never heard back about. */
  async reconcile(
    quote: Quote,
  ): Promise<'settled' | 'failed' | 'pending' | 'skipped'> {
    if (quote.status !== QuoteStatus.PENDING_PAYMENT || !quote.paymentKey)
      return 'skipped';
    const key = quote.paymentKey;
    const found = await this.gateway.retrieve(key);
    switch (found.status) {
      case 'succeeded':
        await this.settle(quote.id, key, found.charge, 'reconciler');
        return 'settled';
      case 'failed':
        await this.fail(quote.id, key, found.reason, 'reconciler');
        return 'failed';
      case 'pending':
        return 'pending';
      case 'not_found': {
        // The request died between committing PENDING_PAYMENT and reaching the
        // gateway, so no money moved. Give the quote back after a while.
        const age = Date.now() - (quote.paymentStartedAt?.getTime() ?? 0);
        if (age < ABANDON_AFTER_MS) return 'pending';
        await this.fail(quote.id, key, 'abandoned', 'reconciler');
        return 'failed';
      }
    }
  }

  /** Reconcile every payment stuck in PENDING_PAYMENT (run from a scheduled job). */
  async reconcileStale(olderThanMs = 30_000, limit = 50) {
    const stuck = await this.prisma.quote.findMany({
      where: {
        status: QuoteStatus.PENDING_PAYMENT,
        paymentStartedAt: { lt: new Date(Date.now() - olderThanMs) },
      },
      orderBy: { paymentStartedAt: 'asc' },
      take: limit,
    });
    const results: Record<string, string> = {};
    for (const quote of stuck) {
      try {
        results[quote.id] = await this.reconcile(quote);
      } catch (err) {
        results[quote.id] = 'error';
        this.logger.error(`Reconciling quote ${quote.id} failed`, err as Error);
      }
    }
    return { checked: stuck.length, results };
  }

  /**
   * GET /insurance/quote/:id/payment — what the page polls while a payment is
   * processing. A payment silent for a few seconds is reconciled on the spot,
   * so the journey completes even without webhooks or a scheduled job.
   */
  async status(quoteId: string): Promise<PaymentStatus> {
    let quote = await this.quotes.findByIdOrThrow(quoteId);
    if (
      quote.status === QuoteStatus.PENDING_PAYMENT &&
      Date.now() - (quote.paymentStartedAt?.getTime() ?? 0) >=
        this.reconcileAfterMs
    ) {
      await this.reconcile(quote).catch((err) =>
        this.logger.warn(`Reconcile on poll failed: ${(err as Error).message}`),
      );
      quote = await this.quotes.findByIdOrThrow(quoteId);
    }

    switch (quote.status) {
      case QuoteStatus.POLICY_ISSUED: {
        const policy = await this.prisma.policy.findUniqueOrThrow({
          where: { quoteId },
        });
        return { state: 'ISSUED', quoteId, policy: toPolicyResponse(policy) };
      }
      case QuoteStatus.PENDING_PAYMENT:
      case QuoteStatus.PREMIUM_PAID:
        return { state: 'PROCESSING', quoteId };
      default: {
        // The audit trail knows why the last payment failed, if one did.
        const last = await this.prisma.quoteStatusTransition.findFirst({
          where: { quoteId },
          orderBy: { seq: 'desc' },
        });
        const failed =
          last?.fromStatus === QuoteStatus.PENDING_PAYMENT &&
          last.toStatus === QuoteStatus.MEDICAL_DECLARED;
        const reason = (last?.triggerContext as { reason?: string } | null)
          ?.reason;
        return failed && reason
          ? { state: 'NOT_PAID', quoteId, lastFailure: reason }
          : { state: 'NOT_PAID', quoteId };
      }
    }
  }

  /** SELECT … FOR UPDATE: serialises everything that touches one quote's payment. */
  async lockQuote(
    tx: Prisma.TransactionClient,
    quoteId: string,
  ): Promise<Quote> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM quotes WHERE id = ${quoteId}::uuid FOR UPDATE`;
    if (locked.length === 0)
      throw new NotFoundException(`Quote ${quoteId} not found`);
    return tx.quote.findUniqueOrThrow({ where: { id: quoteId } });
  }
}
