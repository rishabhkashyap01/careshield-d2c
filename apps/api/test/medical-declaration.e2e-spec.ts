/** POST /api/v1/insurance/quote/:id/medical-declaration — journey step 2. */
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const clean = {
  hasDiabetes: false,
  hasHypertension: false,
  hasHeartDisease: false,
  isSmoker: false,
  hadMajorSurgeryLast5Years: false,
  hasTerminalIllness: false,
  confirmsAccuracy: true,
};

describe('medical declaration (e2e)', () => {
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

  const http = () => request(app.getHttpServer());
  const newQuote = async (hasPreExistingConditions = false) =>
    (
      await http()
        .post('/api/v1/insurance/quote')
        .send({ age: 40, hasPreExistingConditions })
        .expect(201)
    ).body.quoteId as string;
  const declare = (id: string, body: object) =>
    http().post(`/api/v1/insurance/quote/${id}/medical-declaration`).send(body);

  it('accepts a declaration and advances to MEDICAL_DECLARED', async () => {
    const id = await newQuote();
    const res = await declare(id, clean).expect(200);
    expect(res.body.status).toBe('MEDICAL_DECLARED');

    const row = await prisma.quote.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('MEDICAL_DECLARED');
    expect(row.medicalDeclaration).toMatchObject({
      answers: { hasDiabetes: false, isSmoker: false },
      eligibility: { eligible: true },
    });
  });

  it('cannot declare twice (409)', async () => {
    const id = await newQuote();
    await declare(id, clean).expect(200);
    const res = await declare(id, clean).expect(409);
    expect(res.body.error).toBe('InvalidQuoteTransition');
  });

  it('rejects an undeclared pre-existing condition (422) and leaves the quote alone', async () => {
    const id = await newQuote(false);
    const res = await declare(id, { ...clean, hasDiabetes: true }).expect(422);
    expect(res.body.error).toBe('NotEligible');
    expect(res.body.reasons[0].code).toBe('UNDECLARED_PRE_EXISTING_CONDITION');
    const row = await prisma.quote.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('QUOTE_GENERATED');
  });

  it('allows the condition when the quote was priced for it', async () => {
    const id = await newQuote(true);
    await declare(id, { ...clean, hasDiabetes: true }).expect(200);
  });

  it('terminal illness is not eligible (422)', async () => {
    const id = await newQuote(true);
    const res = await declare(id, {
      ...clean,
      hasTerminalIllness: true,
    }).expect(422);
    expect(res.body.reasons[0].code).toBe('TERMINAL_ILLNESS');
  });

  it('an expired quote cannot be declared (410)', async () => {
    const created = new Date(Date.now() - 20 * 60_000);
    const q = await prisma.quote.create({
      data: {
        age: 30,
        hasPreExistingConditions: false,
        basePremium: '10000.00',
        totalPremium: '10000.00',
        createdAt: created,
        expiresAt: new Date(created.getTime() + 15 * 60_000),
      },
    });
    const res = await declare(q.id, clean).expect(410);
    expect(res.body.error).toBe('QuoteExpired');
  });

  it('returns the lock time still left, computed by the server (remainingMs)', async () => {
    const created = new Date(Date.now() - 5 * 60_000); // quoted 5 minutes ago
    const q = await prisma.quote.create({
      data: {
        age: 30,
        hasPreExistingConditions: false,
        basePremium: '10000.00',
        totalPremium: '10000.00',
        createdAt: created,
        expiresAt: new Date(created.getTime() + 15 * 60_000),
      },
    });
    const before = Date.now();
    const res = await declare(q.id, clean).expect(200);
    const after = Date.now();
    const deadline = created.getTime() + 15 * 60_000;
    expect(res.body.remainingMs).toBeLessThanOrEqual(deadline - before);
    expect(res.body.remainingMs).toBeGreaterThanOrEqual(deadline - after);
  });

  it.each([
    [
      'missing confirmation',
      { ...clean, confirmsAccuracy: undefined },
      'confirmsAccuracy',
    ],
    [
      'confirmation false',
      { ...clean, confirmsAccuracy: false },
      'confirmsAccuracy',
    ],
    ['string boolean', { ...clean, isSmoker: 'no' }, 'isSmoker'],
    ['missing answer', { ...clean, hasDiabetes: undefined }, 'hasDiabetes'],
    ['unknown field', { ...clean, bmi: 22 }, 'bmi'],
  ])('rejects %s (400)', async (_l, body, field) => {
    const id = await newQuote();
    const res = await declare(id, body).expect(400);
    expect(res.body.details.map((d: { field: string }) => d.field)).toEqual([
      field,
    ]);
  });

  it('unknown quote → 404', async () => {
    await declare('7b1e9a3c-1f2d-4e5a-9b6c-0d1e2f3a4b5c', clean).expect(404);
  });
});
