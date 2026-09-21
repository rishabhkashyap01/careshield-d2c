import { Module } from '@nestjs/common';
import { InsuranceController } from './insurance.controller.js';
import { QuotesRepository } from './quotes.repository.js';
import { QuotesService } from './quotes.service.js';

@Module({
  controllers: [InsuranceController],
  providers: [QuotesRepository, QuotesService],
  exports: [QuotesRepository, QuotesService],
})
export class InsuranceModule {}
