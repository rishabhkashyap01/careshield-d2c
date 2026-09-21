import { Module } from '@nestjs/common';
import { QuotesRepository } from './quotes.repository.js';

// Controllers and services for /api/v1/insurance/* arrive in Phase 2.
@Module({
  providers: [QuotesRepository],
  exports: [QuotesRepository],
})
export class InsuranceModule {}
