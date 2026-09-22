import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Quote } from '../generated/prisma/client.js';
import { QuoteStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  assertTransition,
  QuoteExpiredError,
  InvalidQuoteTransitionError,
  requiresValidLock,
} from './domain/quote-state-machine.js';
import { isQuoteExpired } from './domain/quote-lock.js';

/** Either the root client or an interactive-transaction client. */
export type Db = PrismaService | Prisma.TransactionClient;

/** Why a status change happened — stored in quote_status_transitions.trigger_context. */
export type AuditAction =
  | 'quote.created'
  | 'quote.medical_declared'
  | 'checkout.payment_started'
  | 'checkout.payment_failed'
  | 'checkout.premium_paid'
  | 'checkout.policy_issued';

export interface AuditContext {
  action: AuditAction;
  requestId?: string;
  callerIp?: string;
  userAgent?: string;
  idempotencyKey?: string;
  paymentReference?: string;
  policyNumber?: string;
  /** Which path settled the payment: the checkout request, a webhook or reconciliation. */
  via?: 'request' | 'webhook' | 'reconciler';
  /** Why a payment failed (card_declined, abandoned, …). */
  reason?: string;
}

/**
 * Data-access layer for quotes. All status changes go through `transition`,
 * which performs a compare-and-set (`WHERE id = ? AND status = <from>`) so two
 * concurrent requests can never both advance the same quote.
 */
@Injectable()
export class QuotesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByIdOrThrow(id: string, db: Db = this.prisma): Promise<Quote> {
    const quote = await db.quote.findUnique({ where: { id } });
    if (!quote) throw new NotFoundException(`Quote ${id} not found`);
    return quote;
  }

  create(data: Prisma.QuoteCreateInput, db: Db = this.prisma): Promise<Quote> {
    return db.quote.create({ data });
  }

  /**
   * Tell the audit trigger WHY the next status change in this transaction
   * happens. `set_config(..., true)` is transaction-scoped, so the context can
   * never leak to another request sharing the pooled connection — which is
   * also why this only accepts a transaction client. Changes made without it
   * are still recorded, as {"source": "database"}.
   */
  async setAuditContext(
    tx: Prisma.TransactionClient,
    context: AuditContext,
  ): Promise<void> {
    const json = JSON.stringify({ source: 'api', ...context });
    await tx.$executeRaw`SELECT set_config('app.audit_context', ${json}, true)`;
  }

  /**
   * Atomically move a quote from `from` to `to`, optionally writing extra
   * columns (e.g. the medical declaration) in the same UPDATE.
   */
  async transition(
    id: string,
    from: QuoteStatus,
    to: QuoteStatus,
    extra: Omit<Prisma.QuoteUpdateManyMutationInput, 'status'> = {},
    db: Db = this.prisma,
    now: Date = new Date(),
  ): Promise<Quote> {
    assertTransition(from, to);

    const where: Prisma.QuoteWhereInput = { id, status: from };
    if (requiresValidLock(from, to)) where.expiresAt = { gte: now };

    const { count } = await db.quote.updateMany({
      where,
      data: { ...extra, status: to },
    });

    const quote = await this.findByIdOrThrow(id, db);
    if (count === 1) return quote;

    // Nothing updated: explain why.
    if (quote.status !== from) {
      throw new InvalidQuoteTransitionError(quote.status, to);
    }
    if (requiresValidLock(from, to) && isQuoteExpired(quote, now)) {
      throw new QuoteExpiredError(quote.id, quote.expiresAt);
    }
    throw new InvalidQuoteTransitionError(from, to);
  }
}
