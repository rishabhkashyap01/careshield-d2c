/**
 * Checkout without a long transaction (LLD risks 1 and 2):
 *  - the gateway is called with NO database transaction open;
 *  - PENDING_PAYMENT freezes the 15-minute clock, so a slow payment started in
 *    time still completes after expiry;
 *  - an unknown outcome returns 202 and is settled by a signed webhook, the
 *    status poll or the reconciler — once, and without double charging.
 */
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { CheckoutService } from '../src/insurance/checkout/checkout.service.js';
import { MockPaymentGateway } from '../src/insurance/checkout/mock-payment-gateway.js';
import { PaymentSettlementService } from '../src/insurance/checkout/payment-settlement.service.js';
import { signWebhook } from '../src/insurance/checkout/webhook-signature.js';

const declaration = {
  hasDiabetes: false,
  hasHypertension: false,
  hasHeartDisease: false,
  isSmoker: false,
  hadMajorSurgeryLast5Years: false,
  hasTerminalIllness: false,
  confirmsAccuracy: true,
};
const SECRET = process.env.PAYMENT_WEBHOOK_SECRET!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Payment lifecycle: PENDING_PAYMENT, webhooks, reconciliation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let gateway: MockPaymentGateway;
  let checkout: CheckoutService;
  let settlement: PaymentSettlementService;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.listen(0, '127.0.0.1'); // a real port, so the mock can call our webhook
    const { port } = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    prisma = app.get(PrismaService);
    gateway = app.get(MockPaymentGateway);
    checkout = app.get(CheckoutService);
    settlement = app.get(PaymentSettlementService);
  });

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE "idempotency_keys", "policies", "quotes" CASCADE`;
    gateway.latencyMs = 50;
    gateway.webhookUrl = undefined;
    gateway.webhookSecret = SECRET;
    checkout.gatewayTimeoutMs = 10_000;
    settlement.reconcileAfterMs = 5_000;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const pay = (quoteId: string, key: string, paymentToken = 'tok_visa_4242') =>
    http()
      .post('/api/v1/insurance/checkout')
      .set('Idempotency-Key', key)
      .send({ quoteId, paymentToken });
  const status = (quoteId: string) =>
    http().get(`/api/v1/insurance/quote/${quoteId}/payment`).expect(200);
  const quoteRow = (id: string) =>
    prisma.quote.findUniqueOrThrow({
      where: { id },
      include: { policy: true },
    });
  const trail = (quoteId: string) =>
    prisma.quoteStatusTransition.findMany({
      where: { quoteId },
      orderBy: { seq: 'asc' },
    });

  /** A declared quote whose lock ends `lockMs` from now. */
  async function declaredQuote(lockMs = 15 * 60_000) {
    const q = await prisma.quote.create({
      data: {
        age: 30,
        hasPreExistingConditions: false,
        basePremium: '10000.00',
        totalPremium: '10000.00',
        expiresAt: new Date(Date.now() + lockMs),
      },
    });
    await http()
      .post(`/api/v1/insurance/quote/${q.id}/medical-declaration`)
      .send(declaration)
      .expect(200);
    return q.id;
  }

  async function until(check: () => Promise<boolean>, timeoutMs = 5_000) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      if (await check()) return;
      await sleep(50);
    }
    throw new Error('condition not met in time');
  }

  function signedWebhook(event: object, secret = SECRET, timestamp?: number) {
    const body = JSON.stringify(event);
    return http()
      .post('/api/v1/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('Webhook-Signature', signWebhook(secret, body, timestamp))
      .send(body);
  }

  describe('risk 2 — no database transaction is open while the gateway works', () => {
    it('commits PENDING_PAYMENT first, holds no row lock and no connection in a transaction during the charge', async () => {
      const quoteId = await declaredQuote();
      gateway.latencyMs = 1_500;
      const inFlight = pay(quoteId, randomUUID()).then((r) => r);
      await sleep(600); // the gateway is now "working"

      // Visible from another connection → step 1 has COMMITTED.
      expect((await quoteRow(quoteId)).status).toBe('PENDING_PAYMENT');
      // Nobody holds the quote's row lock: NOWAIT would fail instantly if so.
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM quotes WHERE id = ${quoteId}::uuid FOR UPDATE NOWAIT`;
      });
      // No session of ours is parked "idle in transaction" waiting on the gateway.
      const [{ n }] = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM pg_stat_activity
        WHERE datname = current_database() AND pid <> pg_backend_pid()
          AND state IN ('idle in transaction', 'idle in transaction (aborted)')`;
      expect(Number(n)).toBe(0);

      const res = await inFlight;
      expect(res.status).toBe(201);
      expect((await quoteRow(quoteId)).status).toBe('POLICY_ISSUED');
    });
  });

  describe('risk 1 — the 15-minute expiry race', () => {
    it('a payment started at "14:59" completes even though the gateway answers after expiry', async () => {
      const quoteId = await declaredQuote(1_000); // 1 s of lock left
      gateway.latencyMs = 2_000; // gateway takes 2 s

      const res = await pay(quoteId, randomUUID()).expect(201);
      expect(res.body.status).toBe('POLICY_ISSUED');

      const q = await quoteRow(quoteId);
      const rows = await trail(quoteId);
      const started = rows.find((r) => r.toStatus === 'PENDING_PAYMENT')!;
      const paid = rows.find((r) => r.toStatus === 'PREMIUM_PAID')!;
      expect(started.occurredAt.getTime()).toBeLessThanOrEqual(
        q.expiresAt.getTime(),
      );
      expect(paid.occurredAt.getTime()).toBeGreaterThan(q.expiresAt.getTime());
    });

    it('but a payment cannot be STARTED after expiry (410, nobody charged)', async () => {
      const quoteId = await declaredQuote(200);
      await sleep(300);
      const charges = gateway.chargeCount;
      const res = await pay(quoteId, randomUUID()).expect(410);
      expect(res.body.error).toBe('QuoteExpired');
      expect(gateway.chargeCount).toBe(charges);
      expect((await quoteRow(quoteId)).status).toBe('MEDICAL_DECLARED');
    });

    it('a decline that arrives after expiry returns the quote; it must then be recalculated', async () => {
      const quoteId = await declaredQuote(500);
      gateway.latencyMs = 800;
      await pay(quoteId, randomUUID(), 'tok_card_declined').expect(402);
      expect((await quoteRow(quoteId)).status).toBe('MEDICAL_DECLARED');
      await pay(quoteId, randomUUID()).expect(410);
    });
  });

  describe('slow gateway → 202 processing', () => {
    it('answers 202 after the timeout, then the provider webhook settles it; the same key then replays the policy', async () => {
      const quoteId = await declaredQuote();
      const key = randomUUID();
      checkout.gatewayTimeoutMs = 300;
      gateway.latencyMs = 1_000;
      gateway.webhookUrl = `${baseUrl}/api/v1/payments/webhook`;
      const charges = gateway.chargeCount;

      const res = await pay(quoteId, key).expect(202);
      expect(res.body).toMatchObject({ status: 'PAYMENT_PROCESSING', quoteId });
      expect(res.headers['retry-after']).toBe('2');
      expect((await status(quoteId)).body.state).toBe('PROCESSING');

      await until(
        async () => (await quoteRow(quoteId)).status === 'POLICY_ISSUED',
      );
      const rows = await trail(quoteId);
      expect(rows.at(-2)!.triggerContext).toMatchObject({
        action: 'checkout.premium_paid',
        via: 'webhook',
      });

      const done = await status(quoteId);
      expect(done.body.state).toBe('ISSUED');
      const replay = await pay(quoteId, key).expect(201);
      expect(replay.headers['idempotent-replayed']).toBe('true');
      expect(replay.body.policyNumber).toBe(done.body.policy.policyNumber);
      expect(gateway.chargeCount - charges).toBe(1);
    });

    it('without any webhook, the status poll reconciles with the gateway', async () => {
      const quoteId = await declaredQuote();
      checkout.gatewayTimeoutMs = 200;
      gateway.latencyMs = 500;
      settlement.reconcileAfterMs = 0;

      await pay(quoteId, randomUUID()).expect(202);
      expect((await status(quoteId)).body.state).toBe('PROCESSING'); // gateway still working
      await sleep(500);
      const res = await status(quoteId);
      expect(res.body.state).toBe('ISSUED');
      expect((await trail(quoteId)).at(-2)!.triggerContext).toMatchObject({
        via: 'reconciler',
      });
    });

    it('retrying with the same key while the charge is still running resumes it — one charge, one policy', async () => {
      const quoteId = await declaredQuote();
      const key = randomUUID();
      checkout.gatewayTimeoutMs = 200;
      gateway.latencyMs = 700;
      const charges = gateway.chargeCount;

      await pay(quoteId, key).expect(202);
      checkout.gatewayTimeoutMs = 10_000;
      const retry = await pay(quoteId, key).expect(201);
      expect(retry.body.status).toBe('POLICY_ISSUED');
      expect(gateway.chargeCount - charges).toBe(1);
      expect((await quoteRow(quoteId)).policy).not.toBeNull();
    });

    it('another tab (different key) is told a payment is already in progress', async () => {
      const quoteId = await declaredQuote();
      checkout.gatewayTimeoutMs = 200;
      gateway.latencyMs = 1_000;
      await pay(quoteId, randomUUID()).expect(202);
      const other = await pay(quoteId, randomUUID()).expect(409);
      expect(other.body.error).toBe('PaymentInProgress');
    });
  });

  describe('webhook endpoint', () => {
    async function pendingQuote() {
      const quoteId = await declaredQuote();
      const key = randomUUID();
      checkout.gatewayTimeoutMs = 100;
      gateway.latencyMs = 60_000; // never answers during the test
      await pay(quoteId, key).expect(202);
      return { quoteId, key };
    }
    const succeeded = (
      quoteId: string,
      key: string,
      reference = 'pay_webhook0000001',
    ) => ({
      id: `evt_${randomUUID()}`,
      type: 'charge.succeeded',
      data: {
        idempotencyKey: key,
        quoteId,
        reference,
        amount: '10000.00',
        currency: 'INR',
        capturedAt: new Date().toISOString(),
      },
    });

    it('settles on a valid signed event, and a duplicate delivery is harmless', async () => {
      const { quoteId, key } = await pendingQuote();
      const event = succeeded(quoteId, key);
      const first = await signedWebhook(event).expect(200);
      expect(first.body).toEqual({ received: true, result: 'settled' });
      const again = await signedWebhook(event).expect(200);
      expect(again.body.result).toBe('settled');

      const q = await quoteRow(quoteId);
      expect(q.status).toBe('POLICY_ISSUED');
      expect(q.policy!.paymentReference).toBe('pay_webhook0000001');
      expect(await prisma.policy.count({ where: { quoteId } })).toBe(1);
    });

    it('a charge.failed event gives the quote back, and the status says why', async () => {
      const { quoteId, key } = await pendingQuote();
      await signedWebhook({
        id: `evt_${randomUUID()}`,
        type: 'charge.failed',
        data: { idempotencyKey: key, quoteId, reason: 'insufficient_funds' },
      }).expect(200);
      expect((await quoteRow(quoteId)).status).toBe('MEDICAL_DECLARED');
      expect((await status(quoteId)).body).toEqual({
        state: 'NOT_PAID',
        quoteId,
        lastFailure: 'insufficient_funds',
      });
    });

    it('refuses unsigned, wrongly signed and replayed-old events (401) and changes nothing', async () => {
      const { quoteId, key } = await pendingQuote();
      const event = succeeded(quoteId, key);
      await http()
        .post('/api/v1/payments/webhook')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(event))
        .expect(401);
      await signedWebhook(event, 'whsec_attacker').expect(401);
      await signedWebhook(
        event,
        SECRET,
        Math.floor(Date.now() / 1000) - 3600,
      ).expect(401);
      // The body is signed byte-for-byte: tampering after signing fails.
      const body = JSON.stringify(event);
      await http()
        .post('/api/v1/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('Webhook-Signature', signWebhook(SECRET, body))
        .send(body.replace('10000.00', '00001.00'))
        .expect(401);
      expect((await quoteRow(quoteId)).status).toBe('PENDING_PAYMENT');
    });

    it('acknowledges but ignores a capture that does not belong to the pending attempt', async () => {
      const { quoteId } = await pendingQuote();
      const res = await signedWebhook(
        succeeded(quoteId, 'some-other-attempt-key'),
      ).expect(200);
      expect(res.body.result).toBe('ignored');
      expect((await quoteRow(quoteId)).status).toBe('PENDING_PAYMENT');
    });

    it('rejects a malformed (but signed) event with 400', async () => {
      await signedWebhook({
        id: 'evt_1',
        type: 'charge.refunded',
        data: {},
      }).expect(400);
    });
  });

  describe('reconciliation job (GET /payments/reconcile)', () => {
    /** Make a pending payment look `ageMs` old (the lifecycle trigger forbids editing it, so bypass it here). */
    async function backdate(quoteId: string, ageMs: number) {
      await prisma.$transaction([
        prisma.$executeRaw`ALTER TABLE quotes DISABLE TRIGGER quotes_enforce_lifecycle`,
        prisma.$executeRaw`UPDATE quotes SET payment_started_at = now() - make_interval(secs => ${ageMs / 1000}) WHERE id = ${quoteId}::uuid`,
        prisma.$executeRaw`ALTER TABLE quotes ENABLE TRIGGER quotes_enforce_lifecycle`,
      ]);
    }

    it('needs CRON_SECRET, and settles payments stuck in PENDING_PAYMENT', async () => {
      const saved = process.env.CRON_SECRET;
      try {
        delete process.env.CRON_SECRET;
        await http().get('/api/v1/payments/reconcile').expect(503);
        process.env.CRON_SECRET = 'cron-test-secret';
        await http()
          .get('/api/v1/payments/reconcile')
          .set('Authorization', 'Bearer wrong')
          .expect(401);

        const quoteId = await declaredQuote();
        checkout.gatewayTimeoutMs = 100;
        gateway.latencyMs = 300;
        await pay(quoteId, randomUUID()).expect(202);
        await sleep(400); // the charge has now succeeded at the gateway
        await backdate(quoteId, 60_000);

        const res = await http()
          .get('/api/v1/payments/reconcile')
          .set('Authorization', 'Bearer cron-test-secret')
          .expect(200);
        expect(res.body).toEqual({
          checked: 1,
          results: { [quoteId]: 'settled' },
        });
        expect((await quoteRow(quoteId)).status).toBe('POLICY_ISSUED');
      } finally {
        if (saved === undefined) delete process.env.CRON_SECRET;
        else process.env.CRON_SECRET = saved;
      }
    });

    it('gives the quote back when the gateway never received the payment (request died after step 1)', async () => {
      const quoteId = await declaredQuote();
      // Simulate a crash between committing PENDING_PAYMENT and calling the gateway.
      await prisma.$executeRaw`
        UPDATE quotes SET status = 'PENDING_PAYMENT', payment_key = 'lost-attempt-0001', payment_started_at = now()
        WHERE id = ${quoteId}::uuid`;
      await backdate(quoteId, 5 * 60_000);

      const result = await settlement.reconcileStale();
      expect(result.results[quoteId]).toBe('failed');
      expect((await quoteRow(quoteId)).status).toBe('MEDICAL_DECLARED');
      expect((await status(quoteId)).body.lastFailure).toBe('abandoned');
    });
  });
});
