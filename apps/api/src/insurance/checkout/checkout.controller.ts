import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CheckoutDto } from './checkout.dto.js';
import { CheckoutService } from './checkout.service.js';
import type { PolicyResponse } from './policy-response.js';

/** Printable, 16–255 chars (a UUID from the browser is the normal case). */
const KEY_FORMAT = /^[A-Za-z0-9_\-:.]{16,255}$/;

@Controller('insurance')
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  /** POST /api/v1/insurance/checkout — pay, bind and issue the policy. */
  @Post('checkout')
  async pay(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CheckoutDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PolicyResponse> {
    if (!idempotencyKey) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'IdempotencyKeyRequired',
        message: 'The Idempotency-Key header is required for checkout.',
      });
    }
    if (!KEY_FORMAT.test(idempotencyKey)) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'InvalidIdempotencyKey',
        message:
          'Idempotency-Key must be 16–255 characters (letters, digits, - _ : .).',
      });
    }

    const outcome = await this.checkout.checkout(idempotencyKey, dto);
    res.status(outcome.status);
    res.setHeader('Idempotency-Key', idempotencyKey);
    if (outcome.replayed) res.setHeader('Idempotent-Replayed', 'true');
    return outcome.body;
  }
}
