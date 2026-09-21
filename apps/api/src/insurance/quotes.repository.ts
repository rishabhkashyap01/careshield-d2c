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
    if (requiresValidLock(to)) where.expiresAt = { gte: now };

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
    if (requiresValidLock(to) && isQuoteExpired(quote, now)) {
      throw new QuoteExpiredError(quote.id, quote.expiresAt);
    }
    throw new InvalidQuoteTransitionError(from, to);
  }
}
