import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, type Quote } from '../../generated/prisma/client.js';
import { QuoteStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { isQuoteExpired } from '../domain/quote-lock.js';
import { QuoteExpiredError } from '../domain/quote-state-machine.js';
import { QuotesRepository } from '../quotes.repository.js';
import type { CheckoutDto } from './checkout.dto.js';
import { hashRequest, IdempotencyService } from './idempotency.service.js';
import { PAYMENT_GATEWAY, type PaymentGateway } from './payment-gateway.js';
import { PolicyIssuer } from './policy-issuer.service.js';
import { type PolicyResponse, toPolicyResponse } from './policy-response.js';

const SCOPE = 'checkout';

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

export interface CheckoutOutcome {
  status: number;
  body: PolicyResponse;
  replayed: boolean;
}

/**
 * POST /api/v1/insurance/checkout — journey step 3 (Phase 4).
 *
 * Task 4.1 — everything that changes our database happens in ONE interactive
 * transaction; any error rolls ALL of it back:
 *
 *   BEGIN
 *     SELECT … FROM quotes WHERE id = $1 FOR UPDATE   ← serialises checkouts per quote
 *     check: declared, not expired, not already paid
 *     charge payment gateway (idempotent on the same key)
 *     quotes: MEDICAL_DECLARED → PREMIUM_PAID
 *     policies: INSERT
 *     quotes: PREMIUM_PAID → POLICY_ISSUED
 *     idempotency_keys: COMPLETED + stored response
 *   COMMIT
 *
 * Task 4.2 — the Idempotency-Key is claimed before the transaction. A repeat
 * of a finished request replays the stored response without touching the
 * gateway; a repeat of a running request gets 409; a repeat after a rollback
 * runs again, and the gateway's own idempotency returns the original charge,
 * so the customer is never charged twice.
 */
@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly quotes: QuotesRepository,
    private readonly idempotency: IdempotencyService,
    private readonly issuer: PolicyIssuer,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
  ) {}

  async checkout(
    idempotencyKey: string,
    dto: CheckoutDto,
  ): Promise<CheckoutOutcome> {
    const requestHash = hashRequest({
      quoteId: dto.quoteId,
      paymentToken: dto.paymentToken,
    });
    const claim = await this.idempotency.claim(
      SCOPE,
      idempotencyKey,
      requestHash,
      dto.quoteId,
    );
    if (claim.kind === 'replay') {
      this.logger.log(`Replaying checkout for key ${idempotencyKey}`);
      return {
        status: claim.status,
        body: claim.body as unknown as PolicyResponse,
        replayed: true,
      };
    }

    try {
      const body = await this.prisma.$transaction(
        (tx) => this.bindAndIssue(tx, idempotencyKey, dto),
        { timeout: 20_000, maxWait: 5_000 },
      );
      this.logger.log(`Issued ${body.policyNumber} for quote ${dto.quoteId}`);
      return { status: 201, body, replayed: false };
    } catch (err) {
      // The transaction rolled back (quote, policy and key record untouched),
      // so free the key: retrying with it is safe and will run again.
      await this.idempotency
        .release(SCOPE, idempotencyKey)
        .catch((e) =>
          this.logger.error(
            `Could not release idempotency key ${idempotencyKey}`,
            e,
          ),
        );
      throw err;
    }
  }

  private async bindAndIssue(
    tx: Prisma.TransactionClient,
    idempotencyKey: string,
    dto: CheckoutDto,
  ): Promise<PolicyResponse> {
    const now = new Date();

    // Row lock: a second checkout for the same quote (e.g. another tab with a
    // different key) waits here, then sees ALREADY_PAID.
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM quotes WHERE id = ${dto.quoteId}::uuid FOR UPDATE`;
    if (locked.length === 0)
      throw new NotFoundException(`Quote ${dto.quoteId} not found`);
    const quote = await tx.quote.findUniqueOrThrow({
      where: { id: dto.quoteId },
    });

    this.assertPayable(quote, now);

    const charge = await this.gateway.charge({
      paymentToken: dto.paymentToken,
      amount: quote.totalPremium,
      currency: quote.currency,
      idempotencyKey,
      description: `CareShield Max premium for quote ${quote.id}`,
    });

    await this.quotes.transition(
      quote.id,
      QuoteStatus.MEDICAL_DECLARED,
      QuoteStatus.PREMIUM_PAID,
      {},
      tx,
      now,
    );
    const policy = await this.issuer.issue(tx, quote, charge, now);
    await this.quotes.transition(
      quote.id,
      QuoteStatus.PREMIUM_PAID,
      QuoteStatus.POLICY_ISSUED,
      {},
      tx,
      now,
    );

    const body = toPolicyResponse(policy);
    await this.idempotency.complete(tx, SCOPE, idempotencyKey, 201, {
      ...body,
    });
    return body;
  }

  private assertPayable(quote: Quote, now: Date): void {
    switch (quote.status) {
      case QuoteStatus.QUOTE_GENERATED:
        throw new CheckoutNotAllowedError(quote.id, 'DECLARATION_REQUIRED');
      case QuoteStatus.PREMIUM_PAID:
      case QuoteStatus.POLICY_ISSUED:
        throw new CheckoutNotAllowedError(quote.id, 'ALREADY_PAID');
      case QuoteStatus.MEDICAL_DECLARED:
        if (isQuoteExpired(quote, now))
          throw new QuoteExpiredError(quote.id, quote.expiresAt);
    }
  }
}
