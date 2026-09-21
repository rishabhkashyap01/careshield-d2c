import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  InvalidQuoteTransitionError,
  QuoteExpiredError,
} from '../insurance/domain/quote-state-machine.js';

/** Maps domain errors to HTTP so services never import HTTP concerns. */
@Catch(InvalidQuoteTransitionError, QuoteExpiredError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(
    err: InvalidQuoteTransitionError | QuoteExpiredError,
    host: ArgumentsHost,
  ): void {
    const res = host.switchToHttp().getResponse<Response>();
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
