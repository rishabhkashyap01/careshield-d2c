import { IsDefined, IsIn, IsUUID } from 'class-validator';
import { MOCK_PAYMENT_TOKENS } from './mock-payment-gateway.js';

/** Body of POST /api/v1/insurance/checkout. */
export class CheckoutDto {
  @IsDefined({ message: 'quoteId is required' })
  @IsUUID('4', { message: 'quoteId must be a valid quote id' })
  quoteId!: string;

  @IsDefined({ message: 'paymentToken is required' })
  @IsIn(Object.keys(MOCK_PAYMENT_TOKENS), {
    message: 'paymentToken is not a recognised payment method',
  })
  paymentToken!: string;
}
