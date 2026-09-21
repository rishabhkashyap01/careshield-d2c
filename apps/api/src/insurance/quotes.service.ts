import { Injectable, Logger } from '@nestjs/common';
import type { Quote } from '../generated/prisma/client.js';
import { calculatePremium } from './domain/premium-calculator.js';
import { computeExpiresAt } from './domain/quote-lock.js';
import type { CreateQuoteDto } from './dto/create-quote.dto.js';
import { QuotesRepository } from './quotes.repository.js';

@Injectable()
export class QuotesService {
  private readonly logger = new Logger(QuotesService.name);

  constructor(private readonly quotes: QuotesRepository) {}

  /**
   * Price the applicant and persist a locked quote (Tasks 2.2 + 2.3).
   * `created_at` and `expires_at` are both set explicitly from ONE server
   * timestamp, so the lock is exactly 15 minutes — never skewed by DB/app
   * clock differences or by the client.
   */
  async createQuote(dto: CreateQuoteDto, now = new Date()): Promise<Quote> {
    const premium = calculatePremium(dto);

    const quote = await this.quotes.create({
      age: dto.age,
      hasPreExistingConditions: dto.hasPreExistingConditions,
      currency: premium.currency,
      basePremium: premium.basePremium,
      ageLoading: premium.ageLoading,
      conditionLoading: premium.conditionLoading,
      totalPremium: premium.totalPremium,
      createdAt: now,
      expiresAt: computeExpiresAt(now),
    });

    this.logger.log(
      `Quote ${quote.id} created: ₹${quote.totalPremium.toFixed(2)}, locked until ${quote.expiresAt.toISOString()}`,
    );
    return quote;
  }

  getQuote(id: string): Promise<Quote> {
    return this.quotes.findByIdOrThrow(id);
  }
}
