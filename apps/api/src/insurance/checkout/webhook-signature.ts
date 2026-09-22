import { createHmac, timingSafeEqual } from 'node:crypto';

/** Header carrying `t=<unix seconds>,v1=<hex HMAC-SHA256>` (Stripe-style). */
export const WEBHOOK_SIGNATURE_HEADER = 'webhook-signature';

/** Events older or newer than this are refused, so a captured one can't be replayed later. */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

/** Event the payment provider POSTs to /api/v1/payments/webhook. */
export interface PaymentWebhookEvent {
  id: string;
  type: 'charge.succeeded' | 'charge.failed';
  data: {
    idempotencyKey: string;
    quoteId: string;
    reference?: string;
    amount?: string;
    currency?: string;
    capturedAt?: string;
    reason?: string;
  };
}

const hmac = (secret: string, timestamp: number, payload: string) =>
  createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');

export function signWebhook(
  secret: string,
  payload: string,
  timestamp = Math.floor(Date.now() / 1000),
): string {
  return `t=${timestamp},v1=${hmac(secret, timestamp, payload)}`;
}

/** Checks the HMAC over the RAW body (constant-time) and the timestamp window. */
export function verifyWebhook(
  secret: string,
  payload: string,
  header: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(',').map((p) => p.trim().split('=', 2) as [string, string]),
  );
  const timestamp = Number(parts.t);
  const given = parts.v1;
  if (!Number.isInteger(timestamp) || !given || !/^[0-9a-f]{64}$/.test(given))
    return false;
  if (Math.abs(nowSeconds - timestamp) > WEBHOOK_TOLERANCE_SECONDS)
    return false;
  const expected = Buffer.from(hmac(secret, timestamp, payload), 'hex');
  return timingSafeEqual(expected, Buffer.from(given, 'hex'));
}
