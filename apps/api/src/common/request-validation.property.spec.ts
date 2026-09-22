/**
 * Generated tests for request validation: fast-check throws random JSON
 * bodies (wrong types, strings that look like numbers, floats, nulls, arrays,
 * nested objects, extra fields) at the real global ValidationPipe and each
 * DTO. An independent "oracle" says what should be accepted; the pipe must agree
 * on every body, and every rejection must be a clean 400 naming real fields.
 */
import { BadRequestException, type ArgumentMetadata } from '@nestjs/common';
import fc from 'fast-check';
import { CheckoutDto } from '../insurance/checkout/checkout.dto.js';
import { MOCK_PAYMENT_TOKENS } from '../insurance/checkout/mock-payment-gateway.js';
import { CreateQuoteDto } from '../insurance/dto/create-quote.dto.js';
import { MedicalDeclarationDto } from '../insurance/dto/medical-declaration.dto.js';
import { strictValidationPipe } from './validation.js';

const pipe = strictValidationPipe();
const meta = (metatype: ArgumentMetadata['metatype']): ArgumentMetadata => ({
  type: 'body',
  metatype,
});

type Outcome =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; fields: string[] };

async function validate(
  metatype: ArgumentMetadata['metatype'],
  body: unknown,
): Promise<Outcome> {
  try {
    return { ok: true, value: await pipe.transform(body, meta(metatype)) };
  } catch (err) {
    expect(err).toBeInstanceOf(BadRequestException); // never a 500
    const res = (err as BadRequestException).getResponse() as {
      statusCode: number;
      error: string;
      details: { field: string; errors: string[] }[];
    };
    expect(res.statusCode).toBe(400);
    expect(res.error).toBe('ValidationError');
    for (const d of res.details) expect(d.errors.length).toBeGreaterThan(0);
    return { ok: false, fields: res.details.map((d) => d.field) };
  }
}

/** Values of every JSON type, biased toward the tricky ones. */
const jsonValue = fc.oneof(
  fc.integer({ min: -1000, max: 1000 }),
  fc.integer({ min: 0, max: 130 }), // plausible ages, weighted in
  fc.constantFrom(17, 18, 99, 100, -0, 18.5, 98.999), // the edges of 18–99
  fc.double({ noNaN: true, noDefaultInfinity: true }),
  fc.boolean(),
  fc.constant(null),
  fc.constantFrom('30', 'true', 'false', '', ' 45 ', '1e2', 'yes', '18.0'),
  fc.string(),
  fc.array(fc.integer(), { maxLength: 3 }),
  fc.dictionary(fc.string({ maxLength: 5 }), fc.integer(), { maxKeys: 2 }),
);

/** A body built from the DTO's own keys (each maybe missing), plus maybe some unknown keys. */
function bodyOf<K extends string>(
  keys: readonly K[],
  value: fc.Arbitrary<unknown> = jsonValue,
) {
  const reserved = new Set<string>([
    '__proto__',
    'constructor',
    'prototype',
    ...keys,
  ]);
  return fc
    .record({
      known: fc.record(
        Object.fromEntries(keys.map((k) => [k, value])) as Record<
          K,
          fc.Arbitrary<unknown>
        >,
        { requiredKeys: [] },
      ),
      extra: fc.dictionary(
        fc
          .string({ minLength: 1, maxLength: 8 })
          .filter((k) => !reserved.has(k)),
        jsonValue,
        { maxKeys: 2 },
      ),
      includeExtra: fc.boolean(),
    })
    .map(({ known, extra, includeExtra }) => ({
      body: { ...known, ...(includeExtra ? extra : {}) } as Record<
        string,
        unknown
      >,
      extraKeys: includeExtra ? Object.keys(extra) : [],
    }));
}

const isAge = (v: unknown) =>
  typeof v === 'number' && Number.isInteger(v) && v >= 18 && v <= 99;

describe('POST /insurance/quote body (generated)', () => {
  it('accepts a body exactly when age is a whole number 18–99, the flag is a real boolean, and nothing else is sent', async () => {
    await fc.assert(
      fc.asyncProperty(
        bodyOf(['age', 'hasPreExistingConditions'] as const),
        async ({ body, extraKeys }) => {
          const expectOk =
            isAge(body.age) &&
            typeof body.hasPreExistingConditions === 'boolean' &&
            extraKeys.length === 0;
          const r = await validate(CreateQuoteDto, body);
          expect(r.ok).toBe(expectOk);
          if (r.ok) {
            // Accepted values arrive unchanged — no silent coercion.
            expect(r.value.age).toBe(body.age);
            expect(r.value.hasPreExistingConditions).toBe(
              body.hasPreExistingConditions,
            );
          } else {
            // Every error names a field that really was wrong.
            for (const f of r.fields)
              expect([
                'age',
                'hasPreExistingConditions',
                ...extraKeys,
              ]).toContain(f);
            if (!isAge(body.age)) expect(r.fields).toContain('age');
          }
        },
      ),
    );
  });

  it('never accepts a string, even one that looks like a valid age', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 18, max: 99 }),
        fc.boolean(),
        async (age, pec) => {
          const r = await validate(CreateQuoteDto, {
            age: String(age),
            hasPreExistingConditions: pec,
          });
          expect(r).toEqual({ ok: false, fields: ['age'] });
        },
      ),
    );
  });
});

const ANSWERS = [
  'hasDiabetes',
  'hasHypertension',
  'hasHeartDisease',
  'isSmoker',
  'hadMajorSurgeryLast5Years',
  'hasTerminalIllness',
] as const;

describe('POST /insurance/quote/:id/medical-declaration body (generated)', () => {
  const answerValue = fc.oneof(
    { weight: 4, arbitrary: fc.boolean() },
    { weight: 1, arbitrary: jsonValue },
  );

  it('accepts exactly six real booleans plus confirmsAccuracy === true, and nothing else', async () => {
    await fc.assert(
      fc.asyncProperty(
        bodyOf([...ANSWERS, 'confirmsAccuracy'] as const, answerValue),
        async ({ body, extraKeys }) => {
          const expectOk =
            ANSWERS.every((k) => typeof body[k] === 'boolean') &&
            body.confirmsAccuracy === true &&
            extraKeys.length === 0;
          const r = await validate(MedicalDeclarationDto, body);
          expect(r.ok).toBe(expectOk);
          if (!r.ok) {
            for (const k of ANSWERS)
              if (typeof body[k] !== 'boolean') expect(r.fields).toContain(k);
            if (body.confirmsAccuracy !== true)
              expect(r.fields).toContain('confirmsAccuracy');
          }
        },
      ),
    );
  });
});

describe('POST /insurance/checkout body (generated)', () => {
  const TOKENS = Object.keys(MOCK_PAYMENT_TOKENS);
  const UUID_V4 =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const idValue = fc.oneof(fc.uuid({ version: 4 }), fc.uuid(), jsonValue);
  const tokenValue = fc.oneof(fc.constantFrom(...TOKENS), jsonValue);

  it('accepts exactly a v4 quote id and a known payment token — never a client-chosen amount', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record(
          { quoteId: idValue, paymentToken: tokenValue, amount: jsonValue },
          { requiredKeys: [] },
        ),
        async (body) => {
          const expectOk =
            typeof body.quoteId === 'string' &&
            UUID_V4.test(body.quoteId) &&
            typeof body.paymentToken === 'string' &&
            TOKENS.includes(body.paymentToken) &&
            !('amount' in body);
          const r = await validate(CheckoutDto, body);
          expect(r.ok).toBe(expectOk);
          if ('amount' in body && !r.ok) expect(r.fields).toContain('amount');
        },
      ),
    );
  });
});
