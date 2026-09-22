import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PaymentSettlementService } from './payment-settlement.service.js';
import {
  type PaymentWebhookEvent,
  verifyWebhook,
  WEBHOOK_SIGNATURE_HEADER,
} from './webhook-signature.js';

const MONEY = /^\d{1,8}\.\d{2}$/;

/** Validates the shape of a (signature-verified) event before it is applied. */
function parseEvent(raw: string): PaymentWebhookEvent {
  let e: PaymentWebhookEvent;
  try {
    e = JSON.parse(raw) as PaymentWebhookEvent;
  } catch {
    throw new BadRequestException({
      statusCode: 400,
      error: 'InvalidEvent',
      message: 'Body is not JSON.',
    });
  }
  const d = e?.data;
  const ok =
    typeof e?.id === 'string' &&
    (e.type === 'charge.succeeded' || e.type === 'charge.failed') &&
    typeof d?.idempotencyKey === 'string' &&
    typeof d?.quoteId === 'string' &&
    /^[0-9a-f-]{36}$/i.test(d.quoteId) &&
    (e.type === 'charge.failed' ||
      (typeof d.reference === 'string' &&
        typeof d.amount === 'string' &&
        MONEY.test(d.amount) &&
        typeof d.currency === 'string' &&
        typeof d.capturedAt === 'string' &&
        !Number.isNaN(Date.parse(d.capturedAt))));
  if (!ok)
    throw new BadRequestException({
      statusCode: 400,
      error: 'InvalidEvent',
      message: 'Unrecognised webhook event.',
    });
  return e;
}

/**
 * Endpoints called by machines, not the website:
 *   POST /api/v1/payments/webhook    the payment provider reports a result
 *   GET  /api/v1/payments/reconcile  a scheduled job settles stuck payments
 */
@Controller('payments')
export class PaymentsController {
  constructor(private readonly settlement: PaymentSettlementService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Req() req: Request,
    @Headers(WEBHOOK_SIGNATURE_HEADER) signature: string | undefined,
  ) {
    const secret = process.env.PAYMENT_WEBHOOK_SECRET;
    if (!secret) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: 'WebhookNotConfigured',
        message: 'PAYMENT_WEBHOOK_SECRET is not set.',
      });
    }
    // configure-app.ts keeps this route's body as raw bytes: the signature is
    // over exactly what the provider sent, not a re-serialised object.
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    if (!verifyWebhook(secret, raw, signature)) {
      throw new UnauthorizedException({
        statusCode: 401,
        error: 'InvalidSignature',
        message: 'Webhook signature is missing, invalid or too old.',
      });
    }
    const event = parseEvent(raw);
    return { received: true, result: await this.settlement.applyEvent(event) };
  }

  /** For a scheduler (e.g. Vercel Cron), authenticated with `Authorization: Bearer $CRON_SECRET`. */
  @Get('reconcile')
  reconcile(@Headers('authorization') authorization: string | undefined) {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: 'ReconcileNotConfigured',
        message: 'CRON_SECRET is not set.',
      });
    }
    if (authorization !== `Bearer ${secret}`) {
      throw new UnauthorizedException({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Missing or wrong cron secret.',
      });
    }
    return this.settlement.reconcileStale();
  }
}
