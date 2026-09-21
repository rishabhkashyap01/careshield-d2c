/**
 * POST /api/v1/insurance/quote — Phase 2 end-to-end tests.
 * Boots the real Nest app against a migrated PostgreSQL (DATABASE_URL).
 */
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const QUOTE = '/api/v1/insurance/quote';

describe('POST /api/v1/insurance/quote (e2e)', () => {
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
    await prisma.$executeRaw`TRUNCATE "policies", "quotes" CASCADE`;
  });

  afterAll(async () => {
    await app.close();
  });

  const post = (body: unknown) =>
    request(app.getHttpServer())
      .post(QUOTE)
      .send(body as object);

  describe('pricing (Task 2.2)', () => {
    it.each([
      [30, false, '0.00', '0.00', '10000.00'],
      [30, true, '0.00', '5000.00', '15000.00'],
      [45, false, '0.00', '0.00', '10000.00'],
      [46, false, '5000.00', '0.00', '15000.00'],
      [60, true, '5000.00', '5000.00', '20000.00'],
    ])(
      'age %i, preExisting=%s → total %s',
      async (
        age,
        hasPreExistingConditions,
        ageLoading,
        conditionLoading,
        total,
      ) => {
        const res = await post({ age, hasPreExistingConditions }).expect(201);
        expect(res.body.premium).toEqual({
          currency: 'INR',
          base: '10000.00',
          ageLoading,
          conditionLoading,
          total,
        });
      },
    );
  });

  describe('persistence & quote lock (Task 2.3)', () => {
    it('saves the quote and locks it for exactly 15 minutes', async () => {
      const before = Date.now();
      const res = await post({
        age: 50,
        hasPreExistingConditions: true,
      }).expect(201);
      const after = Date.now();

      expect(res.body).toMatchObject({
        status: 'QUOTE_GENERATED',
        applicant: { age: 50, hasPreExistingConditions: true },
        lockDurationSeconds: 900,
        isExpired: false,
      });
      expect(res.body.quoteId).toMatch(/^[0-9a-f-]{36}$/);

      const createdAt = Date.parse(res.body.createdAt);
      const expiresAt = Date.parse(res.body.expiresAt);
      expect(expiresAt - createdAt).toBe(15 * 60 * 1000); // exact, to the ms
      expect(createdAt).toBeGreaterThanOrEqual(before);
      expect(createdAt).toBeLessThanOrEqual(after);

      const row = await prisma.quote.findUniqueOrThrow({
        where: { id: res.body.quoteId },
      });
      expect(row.totalPremium.toFixed(2)).toBe('20000.00');
      expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBe(900_000);
      expect(row.status).toBe('QUOTE_GENERATED');
    });

    it('serialises money as strings, never floats', async () => {
      const res = await post({
        age: 30,
        hasPreExistingConditions: false,
      }).expect(201);
      for (const v of Object.values(res.body.premium)) {
        expect(typeof v).toBe('string');
      }
    });
  });

  describe('strict validation (Task 2.1)', () => {
    it.each([
      ['empty body', {}, ['age', 'hasPreExistingConditions']],
      ['missing age', { hasPreExistingConditions: true }, ['age']],
      ['missing flag', { age: 30 }, ['hasPreExistingConditions']],
      ['age as string', { age: '30', hasPreExistingConditions: true }, ['age']],
      [
        'fractional age',
        { age: 30.5, hasPreExistingConditions: true },
        ['age'],
      ],
      ['negative age', { age: -1, hasPreExistingConditions: true }, ['age']],
      ['under 18', { age: 17, hasPreExistingConditions: true }, ['age']],
      ['over 99', { age: 100, hasPreExistingConditions: true }, ['age']],
      ['null age', { age: null, hasPreExistingConditions: true }, ['age']],
      [
        'flag as string',
        { age: 30, hasPreExistingConditions: 'true' },
        ['hasPreExistingConditions'],
      ],
      [
        'flag as number',
        { age: 30, hasPreExistingConditions: 1 },
        ['hasPreExistingConditions'],
      ],
      [
        'unknown field',
        { age: 30, hasPreExistingConditions: true, totalPremium: 1 },
        ['totalPremium'],
      ],
    ])('rejects %s', async (_label, body, fields) => {
      const res = await post(body).expect(400);
      expect(res.body.error).toBe('ValidationError');
      expect(
        res.body.details.map((d: { field: string }) => d.field).sort(),
      ).toEqual([...fields].sort());
      expect(await prisma.quote.count()).toBe(0);
    });

    it('gives one clear message per field', async () => {
      const res = await post({
        age: '52',
        hasPreExistingConditions: 'yes',
      }).expect(400);
      expect(res.body.details).toEqual([
        { field: 'age', errors: ['age must be a whole number'] },
        {
          field: 'hasPreExistingConditions',
          errors: ['hasPreExistingConditions must be true or false'],
        },
      ]);
    });

    it('rejects malformed JSON', async () => {
      await request(app.getHttpServer())
        .post(QUOTE)
        .set('Content-Type', 'application/json')
        .send('{"age": 30,')
        .expect(400);
    });

    it('a client cannot inject its own price or expiry', async () => {
      await post({
        age: 30,
        hasPreExistingConditions: false,
        expiresAt: '2099-01-01T00:00:00Z',
      }).expect(400);
    });
  });
});
