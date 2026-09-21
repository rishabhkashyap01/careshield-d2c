/**
 * POST /api/v1/insurance/checkout — Phase 4 (atomic transactions & idempotency).
 * Real Nest app + real PostgreSQL; the only fake is the payment gateway.
 */
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { MockPaymentGateway } from '../src/insurance/checkout/mock-payment-gateway.js';
import { PolicyIssuer } from '../src/insurance/checkout/policy-issuer.service.js';
import { hashRequest } from '../src/insurance/checkout/idempotency.service.js';

const declaration = {
  hasDiabetes: false,
  hasHypertension: false,
  hasHeartDisease: false,
  isSmoker: false,
  hadMajorSurgeryLast5Years: false,
  hasTerminalIllness: false,
  confirmsAccuracy: true,
};

/** Wraps the real issuer so a test can make it blow up mid-transaction. */
class FaultyPolicyIssuer extends PolicyIssuer {
  failNext = 0;
  override async issue(...args: Parameters<PolicyIssuer['issue']>) {
    const policy = await super.issue(...args); // the INSERT really happens…
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error('Simulated crash after inserting the policy'); // …then we crash
    }
    return policy;
  }
}

describe('POST /api/v1/insurance/checkout (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let gateway: MockPaymentGateway;
  let issuer: FaultyPolicyIssuer;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PolicyIssuer)
      .useClass(FaultyPolicyIssuer)
      .compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    gateway = app.get(MockPaymentGateway);
    issuer = app.get(PolicyIssuer);
  });

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE "idempotency_keys", "policies", "quotes" CASCADE`;
    gateway.latencyMs = 50;
    issuer.failNext = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  async function declaredQuote(age = 52, hasPreExistingConditions = true) {
    const q = await http()
      .post('/api/v1/insurance/quote')
      .send({ age, hasPreExistingConditions })
      .expect(201);
    await http()
      .post(`/api/v1/insurance/quote/${q.body.quoteId}/medical-declaration`)
      .send(declaration)
      .expect(200);
    return q.body.quoteId as string;
  }

  const pay = (
    quoteId: string,
    key: string | null,
    paymentToken = 'tok_visa_4242',
  ) => {
    const r = http().post('/api/v1/insurance/checkout');
    if (key !== null) r.set('Idempotency-Key', key);
    return r.send({ quoteId, paymentToken });
  };

  const state = async (quoteId: string) => ({
    quote: (await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } }))
      .status,
    policies: await prisma.policy.count({ where: { quoteId } }),
  });

  describe('happy path', () => {
    it('charges once, issues the policy and advances the quote to POLICY_ISSUED', async () => {
      const quoteId = await declaredQuote();
      const charges = gateway.chargeCount;

      const res = await pay(quoteId, randomUUID()).expect(201);

      expect(res.body).toMatchObject({
        quoteId,
        status: 'POLICY_ISSUED',
        premiumPaid: '20000.00',
        currency: 'INR',
      });
      expect(res.body.policyNumber).toMatch(/^CSM-\d{4}-\d{6}$/);
      expect(res.body.paymentReference).toMatch(/^pay_[0-9a-f]{16}$/);
      const start = Date.parse(res.body.coverageStart);
      const end = new Date(res.body.coverageEnd);
      expect(end.getUTCFullYear() - new Date(start).getUTCFullYear()).toBe(1);

      expect(await state(quoteId)).toEqual({
        quote: 'POLICY_ISSUED',
        policies: 1,
      });
      expect(gateway.chargeCount - charges).toBe(1);
    });

    it('issues sequential, unique policy numbers', async () => {
      const a = await pay(await declaredQuote(), randomUUID()).expect(201);
      const b = await pay(await declaredQuote(30, false), randomUUID()).expect(
        201,
      );
      expect(a.body.policyNumber).not.toBe(b.body.policyNumber);
      expect(Number(b.body.policyNumber.slice(-6))).toBeGreaterThan(
        Number(a.body.policyNumber.slice(-6)),
      );
      expect(b.body.premiumPaid).toBe('10000.00');
    });
  });

  describe('Task 4.2 — idempotency', () => {
    it('replays the stored response for a repeated key — no second charge, no second policy', async () => {
      const quoteId = await declaredQuote();
      const key = randomUUID();
      const first = await pay(quoteId, key).expect(201);
      const charges = gateway.chargeCount;

      const again = await pay(quoteId, key).expect(201);
      expect(again.headers['idempotent-replayed']).toBe('true');
      expect(again.body).toEqual(first.body);
      expect(gateway.chargeCount).toBe(charges);
      expect(await state(quoteId)).toEqual({
        quote: 'POLICY_ISSUED',
        policies: 1,
      });
    });

    it('rapid repeated clicks with ONE key → one charge, one policy', async () => {
      gateway.latencyMs = 400; // keep the first request in flight
      const quoteId = await declaredQuote();
      const key = randomUUID();
      const charges = gateway.chargeCount;

      const results = await Promise.all(
        Array.from({ length: 5 }, () => pay(quoteId, key)),
      );
      const codes = results.map((r) => r.status).sort();

      expect(codes.filter((c) => c === 201).length).toBeGreaterThanOrEqual(1);
      expect(codes.every((c) => c === 201 || c === 409)).toBe(true);
      for (const r of results.filter((r) => r.status === 409)) {
        expect(r.body.error).toBe('IdempotencyKeyInProgress');
        expect(r.headers['retry-after']).toBe('1');
      }
      expect(gateway.chargeCount - charges).toBe(1);
      expect(await state(quoteId)).toEqual({
        quote: 'POLICY_ISSUED',
        policies: 1,
      });

      // Once finished, the same key replays the result.
      const later = await pay(quoteId, key).expect(201);
      expect(later.headers['idempotent-replayed']).toBe('true');
    });

    it('two tabs with DIFFERENT keys for the same quote → one charge, the other gets 409 AlreadyPaid', async () => {
      gateway.latencyMs = 300;
      const quoteId = await declaredQuote();
      const charges = gateway.chargeCount;

      const results = await Promise.all([
        pay(quoteId, randomUUID()),
        pay(quoteId, randomUUID()),
        pay(quoteId, randomUUID()),
      ]);
      const codes = results.map((r) => r.status).sort();

      expect(codes).toEqual([201, 409, 409]);
      for (const r of results.filter((r) => r.status === 409))
        expect(r.body.error).toBe('AlreadyPaid');
      expect(gateway.chargeCount - charges).toBe(1);
      expect(await state(quoteId)).toEqual({
        quote: 'POLICY_ISSUED',
        policies: 1,
      });
    });

    it('a key stuck IN_PROGRESS (e.g. DB dropped mid-checkout) is reclaimed once stale', async () => {
      const quoteId = await declaredQuote();
      const key = randomUUID();
      const hash = hashRequest({ quoteId, paymentToken: 'tok_visa_4242' });
      const insertStuck = (ageSeconds: number) => prisma.$executeRaw`
        INSERT INTO idempotency_keys (scope, key, request_hash, status, quote_id, created_at, updated_at, expires_at)
        VALUES ('checkout', ${key}, ${hash}, 'IN_PROGRESS', ${quoteId}::uuid,
                now() - make_interval(secs => ${ageSeconds}), now() - make_interval(secs => ${ageSeconds}),
                now() + interval '1 day')
        ON CONFLICT (scope, key) DO UPDATE SET updated_at = EXCLUDED.updated_at, status = 'IN_PROGRESS'`;

      await insertStuck(10); // recent → still treated as running
      expect((await pay(quoteId, key)).status).toBe(409);

      await insertStuck(120); // 2 minutes old → abandoned, safe to take over
      const res = await pay(quoteId, key).expect(201);
      expect(res.body.status).toBe('POLICY_ISSUED');
      expect(await state(quoteId)).toEqual({
        quote: 'POLICY_ISSUED',
        policies: 1,
      });
    });

    it('rejects reusing a key for a different request (422)', async () => {
      const key = randomUUID();
      await pay(await declaredQuote(), key).expect(201);
      const other = await declaredQuote(30, false);
      const res = await pay(other, key).expect(422);
      expect(res.body.error).toBe('IdempotencyKeyReused');
      expect(await state(other)).toEqual({
        quote: 'MEDICAL_DECLARED',
        policies: 0,
      });
    });

    it.each([
      ['missing', null, 'IdempotencyKeyRequired'],
      ['too short', 'abc', 'InvalidIdempotencyKey'],
      ['bad characters', 'key with spaces and !!!', 'InvalidIdempotencyKey'],
    ])('rejects a %s Idempotency-Key header (400)', async (_l, key, error) => {
      const quoteId = await declaredQuote();
      const res = await pay(quoteId, key).expect(400);
      expect(res.body.error).toBe(error);
      expect(await state(quoteId)).toEqual({
        quote: 'MEDICAL_DECLARED',
        policies: 0,
      });
    });
  });

  describe('Task 4.1 — atomic transaction & rollback', () => {
    it('a crash after the policy INSERT rolls everything back; a retry with the same key succeeds without a second charge', async () => {
      const quoteId = await declaredQuote();
      const key = randomUUID();
      const charges = gateway.chargeCount;
      issuer.failNext = 1;

      await pay(quoteId, key).expect(500);

      // Rolled back: no policy, quote still MEDICAL_DECLARED (not PREMIUM_PAID), key released.
      expect(await state(quoteId)).toEqual({
        quote: 'MEDICAL_DECLARED',
        policies: 0,
      });
      const rec = await prisma.idempotencyKey.findUniqueOrThrow({
        where: { scope_key: { scope: 'checkout', key } },
      });
      expect(rec.status).toBe('FAILED');
      expect(gateway.chargeCount - charges).toBe(1); // the gateway did capture once

      // Client retries with the SAME key → completes; gateway returns the original charge.
      const retry = await pay(quoteId, key).expect(201);
      expect(gateway.chargeCount - charges).toBe(1); // still one charge
      expect(await state(quoteId)).toEqual({
        quote: 'POLICY_ISSUED',
        policies: 1,
      });

      const policy = await prisma.policy.findFirstOrThrow({
        where: { quoteId },
      });
      expect(policy.paymentReference).toBe(retry.body.paymentReference);
    });

    it('a declined card changes nothing (402) and the customer can pay with another method', async () => {
      const quoteId = await declaredQuote();
      const res = await pay(quoteId, randomUUID(), 'tok_card_declined').expect(
        402,
      );
      expect(res.body.error).toBe('PaymentDeclined');
      expect(await state(quoteId)).toEqual({
        quote: 'MEDICAL_DECLARED',
        policies: 0,
      });

      await pay(quoteId, randomUUID(), 'tok_mastercard_4444').expect(201);
      expect(await state(quoteId)).toEqual({
        quote: 'POLICY_ISSUED',
        policies: 1,
      });
    });
  });

  describe('guards', () => {
    it('an expired quote cannot be paid (410) and nobody is charged', async () => {
      const quoteId = await declaredQuote();
      // Age the quote by rewriting timestamps directly — the lifecycle trigger
      // forbids this, so disable it for this one statement.
      await prisma.$transaction([
        prisma.$executeRaw`ALTER TABLE quotes DISABLE TRIGGER quotes_enforce_lifecycle`,
        prisma.$executeRaw`UPDATE quotes SET created_at = now() - interval '20 minutes', expires_at = now() - interval '5 minutes' WHERE id = ${quoteId}::uuid`,
        prisma.$executeRaw`ALTER TABLE quotes ENABLE TRIGGER quotes_enforce_lifecycle`,
      ]);
      const charges = gateway.chargeCount;
      const res = await pay(quoteId, randomUUID()).expect(410);
      expect(res.body.error).toBe('QuoteExpired');
      expect(gateway.chargeCount).toBe(charges);
      expect(await state(quoteId)).toEqual({
        quote: 'MEDICAL_DECLARED',
        policies: 0,
      });
    });

    it('requires the medical declaration first (409)', async () => {
      const q = await http()
        .post('/api/v1/insurance/quote')
        .send({ age: 30, hasPreExistingConditions: false })
        .expect(201);
      const res = await pay(q.body.quoteId, randomUUID()).expect(409);
      expect(res.body.error).toBe('DeclarationRequired');
    });

    it('unknown quote → 404', async () => {
      await pay('7b1e9a3c-1f2d-4e5a-9b6c-0d1e2f3a4b5c', randomUUID()).expect(
        404,
      );
    });

    it.each([
      [
        'unknown payment token',
        { quoteId: randomUUID(), paymentToken: 'tok_free_money' },
        'paymentToken',
      ],
      [
        'bad quote id',
        { quoteId: 'nope', paymentToken: 'tok_visa_4242' },
        'quoteId',
      ],
      [
        'client-supplied amount',
        {
          quoteId: randomUUID(),
          paymentToken: 'tok_visa_4242',
          amount: '1.00',
        },
        'amount',
      ],
    ])('rejects %s (400)', async (_l, body, field) => {
      const res = await http()
        .post('/api/v1/insurance/checkout')
        .set('Idempotency-Key', randomUUID())
        .send(body)
        .expect(400);
      expect(res.body.details.map((d: { field: string }) => d.field)).toEqual([
        field,
      ]);
    });
  });
});
