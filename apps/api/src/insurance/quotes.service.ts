import { Injectable, Logger } from '@nestjs/common';
import type { Prisma, Quote } from '../generated/prisma/client.js';
import { QuoteStatus } from '../generated/prisma/enums.js';
import {
  evaluateEligibility,
  IneligibleApplicantError,
} from './domain/eligibility.js';
import { calculatePremium } from './domain/premium-calculator.js';
import { computeExpiresAt } from './domain/quote-lock.js';
import type { CreateQuoteDto } from './dto/create-quote.dto.js';
import type { MedicalDeclarationDto } from './dto/medical-declaration.dto.js';
import type { RequestMeta } from '../common/request-meta.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { QuotesRepository } from './quotes.repository.js';

@Injectable()
export class QuotesService {
  private readonly logger = new Logger(QuotesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly quotes: QuotesRepository,
  ) {}

  /**
   * Price the applicant and persist a locked quote (Tasks 2.2 + 2.3).
   * `created_at` and `expires_at` are both set explicitly from ONE server
   * timestamp, so the lock is exactly 15 minutes — never skewed by DB/app
   * clock differences or by the client.
   * The INSERT runs in a transaction so the audit trail records who created it.
   */
  async createQuote(
    dto: CreateQuoteDto,
    meta?: RequestMeta,
    now = new Date(),
  ): Promise<Quote> {
    const premium = calculatePremium(dto);

    const quote = await this.prisma.$transaction(async (tx) => {
      await this.quotes.setAuditContext(tx, {
        action: 'quote.created',
        ...meta,
      });
      return this.quotes.create(
        {
          age: dto.age,
          hasPreExistingConditions: dto.hasPreExistingConditions,
          currency: premium.currency,
          basePremium: premium.basePremium,
          ageLoading: premium.ageLoading,
          conditionLoading: premium.conditionLoading,
          totalPremium: premium.totalPremium,
          createdAt: now,
          expiresAt: computeExpiresAt(now),
        },
        tx,
      );
    });

    this.logger.log(
      `Quote ${quote.id} created: ₹${quote.totalPremium.toFixed(2)}, locked until ${quote.expiresAt.toISOString()}`,
    );
    return quote;
  }

  /**
   * Journey step 2: record the medical declaration and advance the quote
   * QUOTE_GENERATED → MEDICAL_DECLARED. Only allowed while the quote lock is
   * valid (QuoteExpiredError → 410) and only once (InvalidQuoteTransition → 409).
   * An ineligible applicant is rejected (422) and the quote does not move.
   */
  async declareMedicalHistory(
    id: string,
    dto: MedicalDeclarationDto,
    meta?: RequestMeta,
    now = new Date(),
  ): Promise<Quote> {
    const quote = await this.quotes.findByIdOrThrow(id);
    const { confirmsAccuracy: _confirmed, ...answers } = dto;
    const eligibility = evaluateEligibility(answers, quote);
    if (!eligibility.eligible) {
      throw new IneligibleApplicantError(id, eligibility);
    }

    const medicalDeclaration: Prisma.InputJsonObject = {
      answers: { ...answers },
      confirmedAccuracyAt: now.toISOString(),
      eligibility: { eligible: true, reasons: [] },
    };

    return this.prisma.$transaction(async (tx) => {
      await this.quotes.setAuditContext(tx, {
        action: 'quote.medical_declared',
        ...meta,
      });
      return this.quotes.transition(
        id,
        QuoteStatus.QUOTE_GENERATED,
        QuoteStatus.MEDICAL_DECLARED,
        { medicalDeclaration, medicalDeclaredAt: now },
        tx,
        now,
      );
    });
  }
}
