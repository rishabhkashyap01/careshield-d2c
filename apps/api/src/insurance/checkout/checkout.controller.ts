import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Meta, type RequestMeta } from '../../common/request-meta.js';
import { CheckoutDto } from './checkout.dto.js';
import {
  CheckoutService,
  type ProcessingResponse,
} from './checkout.service.js';
import {
  PaymentSettlementService,
  type PaymentStatus,
} from './payment-settlement.service.js';
import type { PolicyResponse } from './policy-response.js';

/** Printable, 16–255 chars (a UUID from the browser is the normal case). */
const KEY_FORMAT = /^[A-Za-z0-9_\-:.]{16,255}$/;

@Controller('insurance')
export class CheckoutController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly settlement: PaymentSettlementService,
  ) {}

  /**
   * POST /api/v1/insurance/checkout — pay, bind and issue the policy.
   * 201 policy · 202 payment still processing (poll the status endpoint).
   */
  @Post('checkout')
  async pay(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CheckoutDto,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PolicyResponse | ProcessingResponse> {
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

    const outcome = await this.checkout.checkout(idempotencyKey, dto, meta);
    res.status(outcome.status);
    res.setHeader('Idempotency-Key', idempotencyKey);
    if (outcome.replayed) res.setHeader('Idempotent-Replayed', 'true');
    if (outcome.status === 202) res.setHeader('Retry-After', '2');
    return outcome.body;
  }

  /** GET /api/v1/insurance/quote/:id/payment — polled while a payment is processing. */
  @Get('quote/:id/payment')
  paymentStatus(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<PaymentStatus> {
    return this.settlement.status(id);
  }
}
