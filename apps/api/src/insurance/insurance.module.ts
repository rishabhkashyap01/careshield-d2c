import { Module } from '@nestjs/common';
import { CheckoutController } from './checkout/checkout.controller.js';
import { CheckoutService } from './checkout/checkout.service.js';
import { IdempotencyService } from './checkout/idempotency.service.js';
import { MockPaymentGateway } from './checkout/mock-payment-gateway.js';
import { PAYMENT_GATEWAY } from './checkout/payment-gateway.js';
import { PolicyIssuer } from './checkout/policy-issuer.service.js';
import { InsuranceController } from './insurance.controller.js';
import { QuotesRepository } from './quotes.repository.js';
import { QuotesService } from './quotes.service.js';

@Module({
  controllers: [InsuranceController, CheckoutController],
  providers: [
    QuotesRepository,
    QuotesService,
    CheckoutService,
    IdempotencyService,
    PolicyIssuer,
    MockPaymentGateway,
    // Swap for a real provider in production; it must support idempotency keys.
    { provide: PAYMENT_GATEWAY, useExisting: MockPaymentGateway },
  ],
  exports: [QuotesRepository, QuotesService],
})
export class InsuranceModule {}
