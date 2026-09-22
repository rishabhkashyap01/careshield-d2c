/**
 * Model-based generated tests against the real PostgreSQL database.
 *
 * fast-check invents random sequences of operations on a quote: status
 * changes (legal and illegal, sent as raw SQL so ONLY the database's triggers
 * and constraints stand in the way), policy inserts with right and wrong
 * amounts, and audit-trail tampering. A small in-memory model says what the
 * rules allow. After every step the database must agree with the model, and
 * at the end the audit trail must equal exactly the changes that happened.
 */
import type { ConfigService } from '@nestjs/config';
import fc from 'fast-check';
import { QuoteStatus } from '../../src/generated/prisma/enums.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';

const S = QuoteStatus;
type Status = QuoteStatus;
const ALL: Status[] = Object.values(S);
const LEGAL = new Set([
  'QUOTE_GENERATED>MEDICAL_DECLARED',
  'MEDICAL_DECLARED>PENDING_PAYMENT',
  'PENDING_PAYMENT>PREMIUM_PAID',
  'PENDING_PAYMENT>MEDICAL_DECLARED',
  'PREMIUM_PAID>POLICY_ISSUED',
]);
/**
 * Each case here hits the real database, so give fast-check room: Vitest's
 * default 5 s per test is too short (a timed-out run keeps going in the
 * background and collides with the next test).
 */
const TIMEOUT = 10 * 60_000;
const RUNS = Number(process.env.FC_NUM_RUNS) || 40;

let prisma: PrismaService;

beforeAll(async () => {
  const config = {
    getOrThrow: () => process.env.DATABASE_URL!,
    get: () => undefined,
  } as unknown as ConfigService;
  prisma = new PrismaService(config);
  await prisma.$connect();
});
beforeEach(async () => {
  await prisma.$executeRaw`TRUNCATE "policies", "quotes" CASCADE`;
});
afterAll(async () => {
  await prisma.$disconnect();
});

/** Run one statement; true if the database accepted it. */
async function accepted(run: () => Promise<unknown>): Promise<boolean> {
  try {
    await run();
    return true;
  } catch {
    return false;
  }
}

type Op =
  | { kind: 'move'; to: Status }
  | { kind: 'policy'; amountOff: 0 | 1 }
  | { kind: 'tamperAudit' }
  | { kind: 'repriceQuote' };

const op: fc.Arbitrary<Op> = fc.oneof(
  {
    weight: 6,
    arbitrary: fc
      .constantFrom(...ALL)
      .map((to) => ({ kind: 'move' as const, to })),
  },
  {
    weight: 2,
    arbitrary: fc
      .constantFrom<0 | 1>(0, 1)
      .map((amountOff) => ({ kind: 'policy' as const, amountOff })),
  },
  { weight: 1, arbitrary: fc.constant({ kind: 'tamperAudit' as const }) },
  { weight: 1, arbitrary: fc.constant({ kind: 'repriceQuote' as const }) },
);

describe('quote lifecycle vs. an independent model (generated, real PostgreSQL)', () => {
  it(
    'the database accepts exactly what the rules allow, and the audit trail records exactly what happened',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(op, { minLength: 1, maxLength: 14 }),
          async (ops) => {
            await prisma.$executeRaw`TRUNCATE "policies", "quotes" CASCADE`;
            const q = await prisma.quote.create({
              data: {
                age: 50,
                hasPreExistingConditions: true,
                basePremium: '10000.00',
                ageLoading: '5000.00',
                conditionLoading: '5000.00',
                totalPremium: '20000.00',
                expiresAt: new Date(Date.now() + 15 * 60_000),
              },
            });
            const id = q.id;

            // The model.
            let status: Status = S.QUOTE_GENERATED;
            let hasPolicy = false;
            const history: [Status | null, Status][] = [
              [null, S.QUOTE_GENERATED],
            ];
            let n = 0;

            for (const o of ops) {
              n++;
              if (o.kind === 'move') {
                const legal = LEGAL.has(`${status}>${o.to}`);
                const needsPolicy = o.to === S.POLICY_ISSUED;
                const expectOk = legal && (!needsPolicy || hasPolicy);
                // Send what a careful caller would send with this change, so only
                // the transition rule itself decides.
                const ok = await accepted(() => {
                  if (
                    o.to === S.MEDICAL_DECLARED &&
                    status === S.QUOTE_GENERATED
                  )
                    return prisma.$executeRaw`UPDATE quotes SET status = 'MEDICAL_DECLARED', medical_declaration = '{}'::jsonb, medical_declared_at = now() WHERE id = ${id}::uuid`;
                  if (o.to === S.PENDING_PAYMENT)
                    return prisma.$executeRaw`UPDATE quotes SET status = 'PENDING_PAYMENT', payment_key = ${'k-' + n}, payment_started_at = now() WHERE id = ${id}::uuid`;
                  if (
                    o.to === S.MEDICAL_DECLARED &&
                    status === S.PENDING_PAYMENT
                  )
                    return prisma.$executeRaw`UPDATE quotes SET status = 'MEDICAL_DECLARED', payment_key = NULL, payment_started_at = NULL WHERE id = ${id}::uuid`;
                  return prisma.$executeRawUnsafe(
                    `UPDATE quotes SET status = $1::"QuoteStatus" WHERE id = $2::uuid`,
                    o.to,
                    id,
                  );
                });
                // Re-sending the same status is a harmless no-op — except "start a
                // payment" while one is pending: that would swap the in-flight
                // attempt's key, which the database must refuse.
                const expected =
                  o.to === status ? o.to !== S.PENDING_PAYMENT : expectOk;
                expect({ step: n, op: o, from: status, ok }).toEqual({
                  step: n,
                  op: o,
                  from: status,
                  ok: expected,
                });
                if (ok && o.to !== status) {
                  history.push([status, o.to]);
                  status = o.to;
                }
              } else if (o.kind === 'policy') {
                const expectOk =
                  status === S.PREMIUM_PAID && !hasPolicy && o.amountOff === 0;
                const ok = await accepted(() =>
                  prisma.policy.create({
                    data: {
                      quoteId: id,
                      policyNumber: `CSM-PROP-${n}-${Math.random().toString(36).slice(2, 8)}`,
                      premiumPaid: o.amountOff ? '19999.99' : '20000.00',
                      paymentReference: `pay_prop_${n}_${Math.random().toString(36).slice(2, 10)}`,
                      coverageStart: new Date(),
                      coverageEnd: new Date(Date.now() + 365 * 86_400_000),
                    },
                  }),
                );
                expect({ step: n, op: o, from: status, ok }).toEqual({
                  step: n,
                  op: o,
                  from: status,
                  ok: expectOk,
                });
                if (ok) hasPolicy = true;
              } else if (o.kind === 'tamperAudit') {
                const ok = await accepted(
                  () =>
                    prisma.$executeRaw`UPDATE quote_status_transitions SET to_status = 'POLICY_ISSUED' WHERE quote_id = ${id}::uuid`,
                );
                const deleted = await accepted(
                  () =>
                    prisma.$executeRaw`DELETE FROM quote_status_transitions WHERE quote_id = ${id}::uuid`,
                );
                expect([ok, deleted]).toEqual([false, false]); // the trail is append-only
              } else {
                const ok = await accepted(
                  () =>
                    prisma.$executeRaw`UPDATE quotes SET base_premium = 1, age_loading = 0, condition_loading = 0, total_premium = 1 WHERE id = ${id}::uuid`,
                );
                expect(ok).toBe(false); // a locked price never changes
              }

              // After every step: the stored status is the model's status.
              const row = await prisma.quote.findUniqueOrThrow({
                where: { id },
              });
              expect(row.status).toBe(status);
              expect(row.totalPremium.toFixed(2)).toBe('20000.00');
            }

            // At the end: the audit trail is exactly the model's history, numbered 1..n.
            const trail = await prisma.quoteStatusTransition.findMany({
              where: { quoteId: id },
              orderBy: { seq: 'asc' },
            });
            expect(trail.map((t) => [t.fromStatus, t.toStatus])).toEqual(
              history,
            );
            expect(trail.map((t) => t.seq)).toEqual(
              history.map((_, i) => i + 1),
            );
          },
        ),
        { numRuns: RUNS },
      );
    },
    TIMEOUT,
  );

  it(
    'the 15-minute lock: for any time left and any change, only declaring and starting a payment are blocked after expiry',
    async () => {
      const start: Record<string, () => string> = {
        MEDICAL_DECLARED: () =>
          `UPDATE quotes SET status = 'MEDICAL_DECLARED', medical_declaration = '{}'::jsonb, medical_declared_at = now() WHERE id = $1::uuid`,
        PENDING_PAYMENT: () =>
          `UPDATE quotes SET status = 'PENDING_PAYMENT', payment_key = 'k-lock', payment_started_at = now() WHERE id = $1::uuid`,
        PREMIUM_PAID: () =>
          `UPDATE quotes SET status = 'PREMIUM_PAID' WHERE id = $1::uuid`,
        BACK: () =>
          `UPDATE quotes SET status = 'MEDICAL_DECLARED', payment_key = NULL, payment_started_at = NULL WHERE id = $1::uuid`,
      };
      // Which state to set up first (with the lock still valid), then which change to try.
      const scenario = fc.constantFrom(
        {
          from: 'QUOTE_GENERATED',
          setup: [],
          change: 'MEDICAL_DECLARED',
          guarded: true,
        },
        {
          from: 'MEDICAL_DECLARED',
          setup: ['MEDICAL_DECLARED'],
          change: 'PENDING_PAYMENT',
          guarded: true,
        },
        {
          from: 'PENDING_PAYMENT',
          setup: ['MEDICAL_DECLARED', 'PENDING_PAYMENT'],
          change: 'PREMIUM_PAID',
          guarded: false,
        },
        {
          from: 'PENDING_PAYMENT',
          setup: ['MEDICAL_DECLARED', 'PENDING_PAYMENT'],
          change: 'BACK',
          guarded: false,
        },
      );
      await fc.assert(
        fc.asyncProperty(
          scenario,
          fc.integer({ min: -600, max: 600 }),
          async (sc, secondsLeft) => {
            fc.pre(Math.abs(secondsLeft) >= 2); // stay clear of the exact boundary (clock resolution)
            await prisma.$executeRaw`TRUNCATE "policies", "quotes" CASCADE`;
            const q = await prisma.quote.create({
              data: {
                age: 30,
                hasPreExistingConditions: false,
                basePremium: '10000.00',
                totalPremium: '10000.00',
                expiresAt: new Date(Date.now() + 15 * 60_000),
              },
            });
            for (const step of sc.setup)
              await prisma.$executeRawUnsafe(start[step](), q.id);
            // Now move the clock: make the lock end `secondsLeft` from now (bypassing
            // the "pricing is immutable" rule, which is exactly what we're not testing).
            await prisma.$transaction([
              prisma.$executeRaw`ALTER TABLE quotes DISABLE TRIGGER quotes_enforce_lifecycle`,
              prisma.$executeRaw`UPDATE quotes SET created_at = now() - interval '20 minutes', expires_at = now() + make_interval(secs => ${secondsLeft}) WHERE id = ${q.id}::uuid`,
              prisma.$executeRaw`ALTER TABLE quotes ENABLE TRIGGER quotes_enforce_lifecycle`,
            ]);
            const ok = await accepted(() =>
              prisma.$executeRawUnsafe(start[sc.change](), q.id),
            );
            const expired = secondsLeft < 0;
            expect({ ...sc, secondsLeft, ok }).toEqual({
              ...sc,
              secondsLeft,
              ok: !(sc.guarded && expired),
            });
          },
        ),
        { numRuns: RUNS },
      );
    },
    TIMEOUT,
  );
});
