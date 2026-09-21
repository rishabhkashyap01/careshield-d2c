import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { IneligibleApplicantError } from '../insurance/domain/eligibility.js';
import {
  InvalidQuoteTransitionError,
  QuoteExpiredError,
} from '../insurance/domain/quote-state-machine.js';

/** Maps domain errors to HTTP so services never import HTTP concerns. */
@Catch(InvalidQuoteTransitionError, QuoteExpiredError, IneligibleApplicantError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(
    err:
      | InvalidQuoteTransitionError
      | QuoteExpiredError
      | IneligibleApplicantError,
    host: ArgumentsHost,
  ): void {
    const res = host.switchToHttp().getResponse<Response>();
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
