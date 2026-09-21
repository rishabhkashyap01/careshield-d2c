/**
 * What the API does when PostgreSQL is unavailable. The app is booted with its
 * PrismaService pointed at (a) a port nothing listens on — "refused", and
 * (b) a non-routable address — "black hole", the case that used to hang.
 */
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { MockPaymentGateway } from '../src/insurance/checkout/mock-payment-gateway.js';

async function bootWithDatabase(url: string) {
  const config = {
    getOrThrow: () => url,
    get: (k: string) =>
      ({ DB_CONNECT_TIMEOUT_MS: 800, HEALTH_DB_TIMEOUT_MS: 500 })[k],
  } as unknown as ConfigService;
  process.env.HEALTH_DB_TIMEOUT_MS = '500';
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(new PrismaService(config))
    .compile();
  const app = configureApp(moduleRef.createNestApplication());
  await app.init(); // must NOT throw: the API starts even with the DB down
  return app;
}

describe('database unavailable — connection refused (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await bootWithDatabase(
      'postgresql://careshield:careshield@127.0.0.1:5439/careshield',
    );
  });
  afterAll(async () => {
    await app.close();
    delete process.env.HEALTH_DB_TIMEOUT_MS;
  });
  const http = () => request(app.getHttpServer());

  it('liveness stays 200 (the process is fine — do not restart it)', async () => {
    await http().get('/api/v1/health/live').expect(200);
  });

  it.each(['/api/v1/health/ready', '/api/v1/health'])(
    '%s → 503 database down',
    async (path) => {
      const res = await http().get(path).expect(503);
      expect(res.body).toMatchObject({ status: 'error', database: 'down' });
    },
  );

  it('a quote request → 503 ServiceUnavailable with Retry-After (not a bare 500)', async () => {
    const res = await http()
      .post('/api/v1/insurance/quote')
      .send({ age: 30, hasPreExistingConditions: false })
      .expect(503);
    expect(res.body.error).toBe('ServiceUnavailable');
    expect(res.headers['retry-after']).toBe('5');
  });

  it('checkout → 503 and nobody is charged', async () => {
    const gateway = app.get(MockPaymentGateway);
    const before = gateway.chargeCount;
    await http()
      .post('/api/v1/insurance/checkout')
      .set('Idempotency-Key', randomUUID())
      .send({ quoteId: randomUUID(), paymentToken: 'tok_visa_4242' })
      .expect(503);
    expect(gateway.chargeCount).toBe(before);
  });

  it('requests that never need the DB still behave normally (validation 400)', async () => {
    const res = await http()
      .post('/api/v1/insurance/quote')
      .send({ age: 'x' })
      .expect(400);
    expect(res.body.error).toBe('ValidationError');
  });
});

describe('database unreachable — packets dropped (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await bootWithDatabase(
      'postgresql://careshield:careshield@10.255.255.1:5432/careshield',
    );
  });
  afterAll(async () => {
    await app.close();
    delete process.env.HEALTH_DB_TIMEOUT_MS;
  });

  it('readiness answers 503 timeout within the health timeout instead of hanging', async () => {
    const started = Date.now();
    const res = await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(503);
    expect(res.body).toMatchObject({ status: 'error', database: 'timeout' });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('a normal request fails fast with 503 once the connect timeout hits', async () => {
    const started = Date.now();
    await request(app.getHttpServer())
      .post('/api/v1/insurance/quote')
      .send({ age: 30, hasPreExistingConditions: false })
      .expect(503);
    expect(Date.now() - started).toBeLessThan(3000);
  });
});
