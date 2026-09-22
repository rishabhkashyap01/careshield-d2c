/**
 * Generated end-to-end tests: fast-check invents applicants and medical
 * declarations and sends them to the real API over HTTP (real Nest app, real
 * PostgreSQL). Each response must match an independent model of the brief:
 * the price, the 15-minute lock, validation, and eligibility.
 */
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import fc from 'fast-check';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * Each case here hits the real database, so give fast-check room: Vitest's
 * default 5 s per test is too short (a timed-out run keeps going in the
 * background and collides with the next test).
 */
const TIMEOUT = 10 * 60_000;
const RUNS = Number(process.env.FC_NUM_RUNS) || 60;

/** The brief's price in whole rupees. */
const price = (age: number, pec: boolean) =>
  10_000 + (age > 45 ? 5_000 : 0) + (pec ? 5_000 : 0);

describe('purchase journey over HTTP (generated)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
  });
  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE "idempotency_keys", "policies", "quotes" CASCADE`;
  });
  afterAll(async () => {
    await app.close();
  });
  const http = () => request(app.getHttpServer());

  it(
    'POST /quote: any integer age gets 201 with the brief\'s price and a 15-minute lock if 18–99, otherwise a 400 on "age"',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: -20, max: 200 }),
          fc.boolean(),
          async (age, pec) => {
            const before = Date.now();
            const res = await http()
              .post('/api/v1/insurance/quote')
              .send({ age, hasPreExistingConditions: pec });
            const after = Date.now();

            if (age < 18 || age > 99) {
              expect(res.status).toBe(400);
              expect(
                res.body.details.map((d: { field: string }) => d.field),
              ).toEqual(['age']);
              return;
            }
            expect(res.status).toBe(201);
            expect(res.body.premium.total).toBe(price(age, pec).toFixed(2));
            expect(res.body.status).toBe('QUOTE_GENERATED');
            expect(
              Date.parse(res.body.expiresAt) - Date.parse(res.body.createdAt),
            ).toBe(900_000);
            expect(res.body.remainingMs).toBeLessThanOrEqual(900_000);
            expect(res.body.remainingMs).toBeGreaterThanOrEqual(
              900_000 - (after - before) - 5,
            );

            // What was stored is what was returned.
            const row = await prisma.quote.findUniqueOrThrow({
              where: { id: res.body.quoteId },
            });
            expect(row.totalPremium.toFixed(2)).toBe(res.body.premium.total);
          },
        ),
        { numRuns: RUNS },
      );
    },
    TIMEOUT,
  );

  it(
    'POST /quote: any non-integer or wrongly-typed age is a 400, and nothing is stored',
    async () => {
      const badAge = fc.oneof(
        fc
          .double({ min: 18, max: 99, noNaN: true })
          .filter((n) => !Number.isInteger(n)),
        fc.integer({ min: 18, max: 99 }).map(String),
        fc.constantFrom(null, true, [], {}, '', 'thirty'),
      );
      await fc.assert(
        fc.asyncProperty(badAge, fc.boolean(), async (age, pec) => {
          const res = await http()
            .post('/api/v1/insurance/quote')
            .send({ age, hasPreExistingConditions: pec });
          expect(res.status).toBe(400);
          expect(res.body.error).toBe('ValidationError');
          expect(await prisma.quote.count()).toBe(0);
        }),
        { numRuns: RUNS },
      );
    },
    TIMEOUT,
  );

  it(
    'medical declaration: for any answers, 200 → MEDICAL_DECLARED exactly when eligible, otherwise 422 with the right reasons and no change',
    async () => {
      const answers = fc.record({
        hasDiabetes: fc.boolean(),
        hasHypertension: fc.boolean(),
        hasHeartDisease: fc.boolean(),
        isSmoker: fc.boolean(),
        hadMajorSurgeryLast5Years: fc.boolean(),
        hasTerminalIllness: fc.boolean(),
      });
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 18, max: 99 }),
          fc.boolean(),
          answers,
          async (age, pec, a) => {
            const quote = await http()
              .post('/api/v1/insurance/quote')
              .send({ age, hasPreExistingConditions: pec })
              .expect(201);
            const id = quote.body.quoteId as string;
            const res = await http()
              .post(`/api/v1/insurance/quote/${id}/medical-declaration`)
              .send({ ...a, confirmsAccuracy: true });

            const condition =
              a.hasDiabetes || a.hasHypertension || a.hasHeartDisease;
            const expectedReasons = [
              ...(a.hasTerminalIllness ? ['TERMINAL_ILLNESS'] : []),
              ...(!pec && condition
                ? ['UNDECLARED_PRE_EXISTING_CONDITION']
                : []),
            ];
            const row = await prisma.quote.findUniqueOrThrow({ where: { id } });
            if (expectedReasons.length === 0) {
              expect(res.status).toBe(200);
              expect(res.body.status).toBe('MEDICAL_DECLARED');
              expect(row.status).toBe('MEDICAL_DECLARED');
              expect(res.body.premium.total).toBe(quote.body.premium.total); // price unchanged
            } else {
              expect(res.status).toBe(422);
              expect(
                res.body.reasons.map((r: { code: string }) => r.code).sort(),
              ).toEqual([...expectedReasons].sort());
              expect(row.status).toBe('QUOTE_GENERATED');
            }
          },
        ),
        { numRuns: RUNS },
      );
    },
    TIMEOUT,
  );
});
