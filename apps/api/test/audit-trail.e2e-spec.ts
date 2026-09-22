/**
 * State-machine audit trail, end to end: every status change made through the
 * API leaves one immutable row in quote_status_transitions that says what
 * happened, in which request, and why.
 */
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { MockPaymentGateway } from '../src/insurance/checkout/mock-payment-gateway.js';

const declaration = {
  hasDiabetes: false,
  hasHypertension: false,
  hasHeartDisease: false,
  isSmoker: false,
  hadMajorSurgeryLast5Years: false,
  hasTerminalIllness: false,
  confirmsAccuracy: true,
};

type Context = Record<string, unknown>;

describe('Quote status audit trail (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    app.get(MockPaymentGateway).latencyMs = 0;
    app.get(MockPaymentGateway).webhookUrl = undefined;
  });

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE "idempotency_keys", "policies", "quotes" CASCADE`;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const trail = (quoteId: string) =>
    prisma.quoteStatusTransition.findMany({
      where: { quoteId },
      orderBy: { seq: 'asc' },
    });

  it('records the whole journey with the action, request and payment details', async () => {
    const quote = await http()
      .post('/api/v1/insurance/quote')
      .set('User-Agent', 'audit-test/1.0')
      .send({ age: 30, hasPreExistingConditions: false })
      .expect(201);
    const id = quote.body.quoteId as string;
    const declared = await http()
      .post(`/api/v1/insurance/quote/${id}/medical-declaration`)
      .send(declaration)
      .expect(200);
    const key = randomUUID();
    const paid = await http()
      .post('/api/v1/insurance/checkout')
      .set('Idempotency-Key', key)
      .send({ quoteId: id, paymentToken: 'tok_visa_4242' })
      .expect(201);

    const rows = await trail(id);
    expect(rows.map((r) => [r.seq, r.fromStatus, r.toStatus])).toEqual([
      [1, null, 'QUOTE_GENERATED'],
      [2, 'QUOTE_GENERATED', 'MEDICAL_DECLARED'],
      [3, 'MEDICAL_DECLARED', 'PENDING_PAYMENT'],
      [4, 'PENDING_PAYMENT', 'PREMIUM_PAID'],
      [5, 'PREMIUM_PAID', 'POLICY_ISSUED'],
    ]);
    const ctx = rows.map((r) => r.triggerContext as Context);

    expect(ctx[0]).toMatchObject({
      source: 'api',
      action: 'quote.created',
      requestId: quote.headers['x-request-id'],
      userAgent: 'audit-test/1.0',
    });
    expect(ctx[0].callerIp).toBeTruthy();
    expect(ctx[1]).toMatchObject({
      action: 'quote.medical_declared',
      requestId: declared.headers['x-request-id'],
    });
    expect(ctx[2]).toMatchObject({
      action: 'checkout.payment_started',
      idempotencyKey: key,
      requestId: paid.headers['x-request-id'],
    });
    expect(ctx[3]).toMatchObject({
      action: 'checkout.premium_paid',
      via: 'request',
      idempotencyKey: key,
      paymentReference: paid.body.paymentReference,
      requestId: paid.headers['x-request-id'],
    });
    expect(ctx[4]).toMatchObject({
      action: 'checkout.policy_issued',
      idempotencyKey: key,
      policyNumber: paid.body.policyNumber,
    });
    // Starting the payment committed on its own (before the gateway was
    // called); paying and issuing were then one transaction.
    expect(ctx[2].txid).not.toBe(ctx[3].txid);
    expect(ctx[3].txid).toBe(ctx[4].txid);
  });

  it('uses a well-formed incoming X-Request-Id, and replaces a malformed one', async () => {
    const good = await http()
      .post('/api/v1/insurance/quote')
      .set('X-Request-Id', 'trace-abc-12345')
      .send({ age: 30, hasPreExistingConditions: false })
      .expect(201);
    expect(good.headers['x-request-id']).toBe('trace-abc-12345');
    const [row] = await trail(good.body.quoteId);
    expect(row.triggerContext).toMatchObject({ requestId: 'trace-abc-12345' });

    const bad = await http()
      .post('/api/v1/insurance/quote')
      .set('X-Request-Id', 'bad id; drop table')
      .send({ age: 30, hasPreExistingConditions: false })
      .expect(201);
    expect(bad.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('records a declined payment as a round trip, and nothing for requests that change nothing', async () => {
    const quote = await http()
      .post('/api/v1/insurance/quote')
      .send({ age: 30, hasPreExistingConditions: false })
      .expect(201);
    const id = quote.body.quoteId as string;

    // Ineligible declaration → 422, quote does not move.
    await http()
      .post(`/api/v1/insurance/quote/${id}/medical-declaration`)
      .send({ ...declaration, hasTerminalIllness: true })
      .expect(422);
    await http()
      .post(`/api/v1/insurance/quote/${id}/medical-declaration`)
      .send(declaration)
      .expect(200);

    expect(await trail(id)).toHaveLength(2); // the 422 left nothing

    // Declined card → 402: the attempt started, then failed back.
    await http()
      .post('/api/v1/insurance/checkout')
      .set('Idempotency-Key', randomUUID())
      .send({ quoteId: id, paymentToken: 'tok_card_declined' })
      .expect(402);
    const afterDecline = await trail(id);
    expect(afterDecline.map((r) => r.toStatus)).toEqual([
      'QUOTE_GENERATED',
      'MEDICAL_DECLARED',
      'PENDING_PAYMENT',
      'MEDICAL_DECLARED',
    ]);
    expect(afterDecline[3].triggerContext).toMatchObject({
      action: 'checkout.payment_failed',
      reason: 'card_declined',
      via: 'request',
    });

    // Paying, then replaying the same request, records the payment once.
    const key = randomUUID();
    for (let i = 0; i < 2; i++) {
      await http()
        .post('/api/v1/insurance/checkout')
        .set('Idempotency-Key', key)
        .send({ quoteId: id, paymentToken: 'tok_visa_4242' })
        .expect(201);
    }
    expect((await trail(id)).map((r) => r.toStatus)).toEqual([
      'QUOTE_GENERATED',
      'MEDICAL_DECLARED',
      'PENDING_PAYMENT',
      'MEDICAL_DECLARED',
      'PENDING_PAYMENT',
      'PREMIUM_PAID',
      'POLICY_ISSUED',
    ]);
  });
});
