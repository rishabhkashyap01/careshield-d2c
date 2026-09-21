import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { CheckoutNotAllowedError } from '../insurance/checkout/checkout.service.js';
import {
  IdempotencyInProgressError,
  IdempotencyKeyReusedError,
} from '../insurance/checkout/idempotency.service.js';
import { PaymentDeclinedError } from '../insurance/checkout/payment-gateway.js';
import { IneligibleApplicantError } from '../insurance/domain/eligibility.js';
import {
  InvalidQuoteTransitionError,
  QuoteExpiredError,
} from '../insurance/domain/quote-state-machine.js';

/** Maps domain errors to HTTP so services never import HTTP concerns. */
@Catch(
  InvalidQuoteTransitionError,
  QuoteExpiredError,
  IneligibleApplicantError,
  CheckoutNotAllowedError,
  PaymentDeclinedError,
  IdempotencyInProgressError,
  IdempotencyKeyReusedError,
)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(
    err:
      | InvalidQuoteTransitionError
      | QuoteExpiredError
      | IneligibleApplicantError
      | CheckoutNotAllowedError
      | PaymentDeclinedError
      | IdempotencyInProgressError
      | IdempotencyKeyReusedError,
    host: ArgumentsHost,
  ): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (err instanceof PaymentDeclinedError) {
      res.status(HttpStatus.PAYMENT_REQUIRED).json({
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        error: 'PaymentDeclined',
        message: 'Your payment was declined. You have not been charged.',
        reason: err.reason,
      });
      return;
    }
    if (err instanceof CheckoutNotAllowedError) {
      res.status(HttpStatus.CONFLICT).json({
        statusCode: HttpStatus.CONFLICT,
        error:
          err.reason === 'ALREADY_PAID' ? 'AlreadyPaid' : 'DeclarationRequired',
        message: err.message,
        quoteId: err.quoteId,
      });
      return;
    }
    if (err instanceof IdempotencyInProgressError) {
      res.setHeader('Retry-After', '1');
      res.status(HttpStatus.CONFLICT).json({
        statusCode: HttpStatus.CONFLICT,
        error: 'IdempotencyKeyInProgress',
        message:
          'Your payment is already being processed. Please wait a moment.',
      });
      return;
    }
    if (err instanceof IdempotencyKeyReusedError) {
      res.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        error: 'IdempotencyKeyReused',
        message: err.message,
      });
      return;
    }
    if (err instanceof IneligibleApplicantError) {
      res.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        error: 'NotEligible',
        message:
          'Based on your declaration we cannot issue this policy online.',
        quoteId: err.quoteId,
        reasons: err.result.reasons,
      });
      return;
    }
    if (err instanceof QuoteExpiredError) {
      res.status(HttpStatus.GONE).json({
        statusCode: HttpStatus.GONE,
        error: 'QuoteExpired',
        message: 'This quote has expired. Please recalculate your premium.',
        quoteId: err.quoteId,
        expiresAt: err.expiresAt.toISOString(),
      });
      return;
    }
    res.status(HttpStatus.CONFLICT).json({
      statusCode: HttpStatus.CONFLICT,
      error: 'InvalidQuoteTransition',
      message: err.message,
      from: err.from,
      to: err.to,
    });
  }
}
