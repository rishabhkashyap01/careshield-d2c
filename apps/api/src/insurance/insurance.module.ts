import { Module } from '@nestjs/common';
import { CheckoutController } from './checkout/checkout.controller.js';
import { CheckoutService } from './checkout/checkout.service.js';
import { IdempotencyService } from './checkout/idempotency.service.js';
import { MockPaymentGateway } from './checkout/mock-payment-gateway.js';
import { PAYMENT_GATEWAY } from './checkout/payment-gateway.js';
import { PaymentSettlementService } from './checkout/payment-settlement.service.js';
import { PaymentsController } from './checkout/payments.controller.js';
import { PolicyIssuer } from './checkout/policy-issuer.service.js';
import { InsuranceController } from './insurance.controller.js';
import { QuotesRepository } from './quotes.repository.js';
import { QuotesService } from './quotes.service.js';

@Module({
  controllers: [InsuranceController, CheckoutController, PaymentsController],
  providers: [
    QuotesRepository,
    QuotesService,
    CheckoutService,
    PaymentSettlementService,
    IdempotencyService,
    PolicyIssuer,
    MockPaymentGateway,
    // Swap for a real provider in production; it must support idempotency keys.
    { provide: PAYMENT_GATEWAY, useExisting: MockPaymentGateway },
  ],
  exports: [QuotesRepository, QuotesService],
})
export class InsuranceModule {}
