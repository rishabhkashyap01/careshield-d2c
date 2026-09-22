/**
 * Database integration tests for Phase 1. They run against a real PostgreSQL
 * (DATABASE_URL) with the migrations applied:
 *
 *   docker compose up -d && npm run db:migrate && npm run test:db
 */
import type { ConfigService } from '@nestjs/config';
import { Prisma } from '../../src/generated/prisma/client.js';
import { QuoteStatus } from '../../src/generated/prisma/enums.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { QuotesRepository } from '../../src/insurance/quotes.repository.js';
import { computeExpiresAt } from '../../src/insurance/domain/quote-lock.js';
import {
  InvalidQuoteTransitionError,
  QuoteExpiredError,
} from '../../src/insurance/domain/quote-state-machine.js';

const { QUOTE_GENERATED, MEDICAL_DECLARED, PREMIUM_PAID, POLICY_ISSUED } =
  QuoteStatus;
const D = (v: string | number) => new Prisma.Decimal(v);

let prisma: PrismaService;
let repo: QuotesRepository;

const declaration = {
  hasDiabetes: false,
  hasHypertension: true,
  smoker: false,
  surgeriesLast5Years: 0,
};

function quoteInput(
  overrides: Partial<Prisma.QuoteCreateInput> = {},
): Prisma.QuoteCreateInput {
  return {
    age: 50,
    hasPreExistingConditions: true,
    basePremium: D('10000.00'),
    ageLoading: D('5000.00'),
    conditionLoading: D('5000.00'),
    totalPremium: D('20000.00'),
    expiresAt: computeExpiresAt(),
    ...overrides,
  };
}

function policyInput(quoteId: string, overrides: Record<string, unknown> = {}) {
  const start = new Date();
  return {
    quoteId,
    policyNumber: `CSM-TEST-${Math.random().toString(36).slice(2, 10)}`,
    premiumPaid: D('20000.00'),
    paymentReference: `pay_${Math.random().toString(36).slice(2, 12)}`,
    coverageStart: start,
    coverageEnd: new Date(start.getTime() + 365 * 24 * 3600 * 1000),
    ...overrides,
  };
}

async function toPaid(id: string) {
  await repo.transition(id, QUOTE_GENERATED, MEDICAL_DECLARED, {
    medicalDeclaration: declaration,
    medicalDeclaredAt: new Date(),
  });
  return repo.transition(id, MEDICAL_DECLARED, PREMIUM_PAID);
}

beforeAll(async () => {
  const config = {
    getOrThrow: () => process.env.DATABASE_URL!,
    get: () => undefined,
  } as unknown as ConfigService;
  prisma = new PrismaService(config);
  await prisma.$connect();
  repo = new QuotesRepository(prisma);
});

beforeEach(async () => {
  await prisma.$executeRaw`TRUNCATE "policies", "quotes" CASCADE`;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Task 1.2 — financial precision (NUMERIC(10,2))', () => {
  it('stores money exactly, with no floating-point drift', async () => {
    // 0.1 + 0.2 !== 0.3 in IEEE-754; NUMERIC must get it right.
    const q = await repo.create(
      quoteInput({
        basePremium: D('10000.10'),
        ageLoading: D('0.20'),
        conditionLoading: D('0'),
        totalPremium: D('10000.30'),
      }),
    );
    const row = await prisma.quote.findUniqueOrThrow({ where: { id: q.id } });
    expect(row.totalPremium).toBeInstanceOf(Prisma.Decimal);
    expect(row.totalPremium.toFixed(2)).toBe('10000.30');

    const [{ sum }] = await prisma.$queryRaw<{ sum: string }[]>`
      SELECT (base_premium + age_loading)::text AS sum FROM quotes WHERE id = ${q.id}::uuid`;
    expect(sum).toBe('10000.30');
  });

  it('uses numeric(10,2) columns for every money field', async () => {
    const cols = await prisma.$queryRaw<
      {
        table_name: string;
        column_name: string;
        precision: number;
        scale: number;
      }[]
    >`
      SELECT table_name, column_name,
             numeric_precision::int AS precision, numeric_scale::int AS scale
      FROM information_schema.columns
      WHERE table_schema = 'public' AND data_type = 'numeric'
      ORDER BY table_name, column_name`;
    expect(cols.map((c) => `${c.table_name}.${c.column_name}`)).toEqual([
      'policies.premium_paid',
      'quotes.age_loading',
      'quotes.base_premium',
      'quotes.condition_loading',
      'quotes.total_premium',
    ]);
    for (const c of cols) expect([c.precision, c.scale]).toEqual([10, 2]);
  });

  it('rejects values that overflow NUMERIC(10,2)', async () => {
    await expect(
      repo.create(
        quoteInput({
          basePremium: D('100000000.00'),
          ageLoading: D(0),
          conditionLoading: D(0),
          totalPremium: D('100000000.00'),
        }),
      ),
    ).rejects.toThrow();
  });

  it('rejects a total that does not equal base + loadings', async () => {
    await expect(
      repo.create(quoteInput({ totalPremium: D('19999.99') })),
    ).rejects.toThrow(/total_premium_matches_breakdown/);
  });

  it('tracks created_at and expires_at 15 minutes apart', async () => {
    const before = Date.now();
    const q = await repo.create(quoteInput());
    expect(q.createdAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    const lockMs = q.expiresAt.getTime() - q.createdAt.getTime();
    expect(Math.abs(lockMs - 15 * 60_000)).toBeLessThan(2000);
  });
});

describe('Task 1.1 — quote state machine', () => {
  it('runs the full lifecycle and links the policy', async () => {
    const q = await repo.create(quoteInput());
    expect(q.status).toBe(QUOTE_GENERATED);

    await toPaid(q.id);
    const issued = await prisma.$transaction(async (tx) => {
      await tx.policy.create({ data: policyInput(q.id) });
      return repo.transition(q.id, PREMIUM_PAID, POLICY_ISSUED, {}, tx);
    });
    expect(issued.status).toBe(POLICY_ISSUED);

    const withPolicy = await prisma.quote.findUniqueOrThrow({
      where: { id: q.id },
      include: { policy: true },
    });
    expect(withPolicy.policy?.premiumPaid.toFixed(2)).toBe('20000.00');
    expect(withPolicy.policy?.status).toBe('ACTIVE');
  });

  it('new quotes must start in QUOTE_GENERATED', async () => {
    await expect(
      repo.create(quoteInput({ status: PREMIUM_PAID })),
    ).rejects.toThrow(/must start in QUOTE_GENERATED/);
  });

  it('app layer refuses to skip a step', async () => {
    const q = await repo.create(quoteInput());
    await expect(
      repo.transition(q.id, QUOTE_GENERATED, PREMIUM_PAID),
    ).rejects.toThrow(InvalidQuoteTransitionError);
  });

  it('DB trigger refuses skips and reversals even via raw SQL', async () => {
    const q = await repo.create(quoteInput());
    await expect(
      prisma.$executeRaw`UPDATE quotes SET status = 'PREMIUM_PAID' WHERE id = ${q.id}::uuid`,
    ).rejects.toThrow(/Illegal quote transition/);

    await toPaid(q.id);
    await expect(
      prisma.$executeRaw`UPDATE quotes SET status = 'QUOTE_GENERATED' WHERE id = ${q.id}::uuid`,
    ).rejects.toThrow(/Illegal quote transition/);
  });

  it('requires a medical declaration before leaving QUOTE_GENERATED', async () => {
    const q = await repo.create(quoteInput());
    await expect(
      repo.transition(q.id, QUOTE_GENERATED, MEDICAL_DECLARED),
    ).rejects.toThrow(/declaration_present/);
  });

  it('stale "from" state loses (compare-and-set)', async () => {
    const q = await repo.create(quoteInput());
    await toPaid(q.id);
    await expect(
      repo.transition(q.id, QUOTE_GENERATED, MEDICAL_DECLARED, {
        medicalDeclaration: declaration,
        medicalDeclaredAt: new Date(),
      }),
    ).rejects.toThrow(InvalidQuoteTransitionError);
  });

  it('only one of two concurrent transitions wins', async () => {
    const q = await repo.create(quoteInput());
    await repo.transition(q.id, QUOTE_GENERATED, MEDICAL_DECLARED, {
      medicalDeclaration: declaration,
      medicalDeclaredAt: new Date(),
    });
    const results = await Promise.allSettled([
      repo.transition(q.id, MEDICAL_DECLARED, PREMIUM_PAID),
      repo.transition(q.id, MEDICAL_DECLARED, PREMIUM_PAID),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });

  it('cannot be POLICY_ISSUED without a policy row', async () => {
    const q = await repo.create(quoteInput());
    await toPaid(q.id);
    await expect(
      repo.transition(q.id, PREMIUM_PAID, POLICY_ISSUED),
    ).rejects.toThrow(/without a policy row/);
  });
});

describe('Quote lock (15 minutes)', () => {
  async function expiredQuote() {
    // Created 20 min ago, expired 5 min ago.
    const created = new Date(Date.now() - 20 * 60_000);
    return repo.create(
      quoteInput({ createdAt: created, expiresAt: computeExpiresAt(created) }),
    );
  }

  it('app layer rejects declaring on an expired quote', async () => {
    const q = await expiredQuote();
    await expect(
      repo.transition(q.id, QUOTE_GENERATED, MEDICAL_DECLARED, {
        medicalDeclaration: declaration,
        medicalDeclaredAt: new Date(),
      }),
    ).rejects.toThrow(QuoteExpiredError);
  });

  it('DB trigger rejects it too, even via raw SQL', async () => {
    const q = await expiredQuote();
    await expect(
      prisma.$executeRaw`
        UPDATE quotes SET status = 'MEDICAL_DECLARED',
          medical_declaration = '{}'::jsonb, medical_declared_at = now()
        WHERE id = ${q.id}::uuid`,
    ).rejects.toThrow(/expired/);
  });

  it('pricing and expiry are immutable once quoted', async () => {
    const q = await repo.create(quoteInput());
    await expect(
      prisma.quote.update({
        where: { id: q.id },
        data: { expiresAt: new Date(Date.now() + 24 * 3600_000) },
      }),
    ).rejects.toThrow(/locked/);
    await expect(
      prisma.quote.update({
        where: { id: q.id },
        data: {
          basePremium: D('1.00'),
          ageLoading: D(0),
          conditionLoading: D(0),
          totalPremium: D('1.00'),
        },
      }),
    ).rejects.toThrow(/locked/);
  });
});

describe('policies', () => {
  it('can only be created from a PREMIUM_PAID quote', async () => {
    const q = await repo.create(quoteInput());
    await expect(
      prisma.policy.create({ data: policyInput(q.id) }),
    ).rejects.toThrow(/requires quote .* PREMIUM_PAID/);
  });

  it('must match the quoted premium exactly', async () => {
    const q = await repo.create(quoteInput());
    await toPaid(q.id);
    await expect(
      prisma.policy.create({
        data: policyInput(q.id, { premiumPaid: D('19999.99') }),
      }),
    ).rejects.toThrow(/does not match quoted/);
  });

  it('one quote → at most one policy; one payment → at most one policy', async () => {
    const q = await repo.create(quoteInput());
    await toPaid(q.id);
    const p = await prisma.policy.create({ data: policyInput(q.id) });

    await expect(
      prisma.policy.create({ data: policyInput(q.id) }),
    ).rejects.toMatchObject({ code: 'P2002' });

    const q2 = await repo.create(quoteInput());
    await toPaid(q2.id);
    await expect(
      prisma.policy.create({
        data: policyInput(q2.id, { paymentReference: p.paymentReference }),
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('a quote with a policy cannot be deleted', async () => {
    const q = await repo.create(quoteInput());
    await toPaid(q.id);
    await prisma.policy.create({ data: policyInput(q.id) });
    await expect(
      prisma.quote.delete({ where: { id: q.id } }),
    ).rejects.toThrow();
  });

  it('rolls back the policy insert if issuing fails mid-transaction', async () => {
    const q = await repo.create(quoteInput());
    await toPaid(q.id);
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.policy.create({ data: policyInput(q.id) });
        throw new Error('payment processor timeout');
      }),
    ).rejects.toThrow('payment processor timeout');
    expect(await prisma.policy.count({ where: { quoteId: q.id } })).toBe(0);
    expect((await repo.findByIdOrThrow(q.id)).status).toBe(PREMIUM_PAID);
  });
});

describe('State-machine audit trail (quote_status_transitions)', () => {
  const trail = (quoteId: string) =>
    prisma.quoteStatusTransition.findMany({
      where: { quoteId },
      orderBy: { seq: 'asc' },
    });

  it('records every status change as a sequential row, starting at creation', async () => {
    const q = await repo.create(quoteInput());
    await toPaid(q.id);
    await prisma.$transaction(async (tx) => {
      await tx.policy.create({ data: policyInput(q.id) });
      await repo.transition(q.id, PREMIUM_PAID, POLICY_ISSUED, {}, tx);
    });

    const rows = await trail(q.id);
    expect(rows.map((r) => [r.seq, r.fromStatus, r.toStatus])).toEqual([
      [1, null, QUOTE_GENERATED],
      [2, QUOTE_GENERATED, MEDICAL_DECLARED],
      [3, MEDICAL_DECLARED, PREMIUM_PAID],
      [4, PREMIUM_PAID, POLICY_ISSUED],
    ]);
    const times = rows.map((r) => r.occurredAt.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('records the application context, and the database adds dbUser and txid itself', async () => {
    const q = await prisma.$transaction(async (tx) => {
      await repo.setAuditContext(tx, {
        action: 'quote.created',
        requestId: 'req-123',
        // A caller cannot impersonate another database user:
        ...({ dbUser: 'someone-else' } as object),
      });
      return repo.create(quoteInput(), tx);
    });
    const [row] = await trail(q.id);
    expect(row.triggerContext).toMatchObject({
      source: 'api',
      action: 'quote.created',
      requestId: 'req-123',
      dbUser: 'careshield',
    });
    expect((row.triggerContext as { txid: string }).txid).toMatch(/^\d+$/);
  });

  it('still records changes made without context (manual SQL), as source "database"', async () => {
    const q = await repo.create(quoteInput());
    const [row] = await trail(q.id);
    expect(row.triggerContext).toMatchObject({ source: 'database' });
    expect(row.triggerContext).not.toHaveProperty('action');
  });

  it('does not leak context to the next transaction on the same pool', async () => {
    await prisma.$transaction(async (tx) => {
      await repo.setAuditContext(tx, { action: 'quote.created' });
      await repo.create(quoteInput(), tx);
    });
    const later = await repo.create(quoteInput());
    const [row] = await trail(later.id);
    expect(row.triggerContext).toMatchObject({ source: 'database' });
  });

  it('never loses a status change because of bad context', async () => {
    const q = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.audit_context', 'not json', true)`;
      return repo.create(quoteInput(), tx);
    });
    const [row] = await trail(q.id);
    expect(row.triggerContext).toMatchObject({
      source: 'database',
      invalidAppContext: true,
    });
  });

  it('leaves no row for a transition that was rolled back or refused', async () => {
    const q = await repo.create(quoteInput());
    await toPaid(q.id);
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.policy.create({ data: policyInput(q.id) });
        await repo.transition(q.id, PREMIUM_PAID, POLICY_ISSUED, {}, tx);
        throw new Error('crash after issuing');
      }),
    ).rejects.toThrow('crash after issuing');
    await expect(
      prisma.$executeRaw`UPDATE quotes SET status = 'QUOTE_GENERATED' WHERE id = ${q.id}::uuid`,
    ).rejects.toThrow(/Illegal quote transition/);

    expect((await trail(q.id)).map((r) => r.toStatus)).toEqual([
      QUOTE_GENERATED,
      MEDICAL_DECLARED,
      PREMIUM_PAID,
    ]);
  });

  it('does not log updates that leave the status unchanged', async () => {
    const q = await repo.create(quoteInput());
    await prisma.quote.update({
      where: { id: q.id },
      data: { medicalDeclaredAt: new Date() },
    });
    expect(await trail(q.id)).toHaveLength(1);
  });

  it('is append-only: rows cannot be updated or deleted, and audited quotes cannot be deleted', async () => {
    const q = await repo.create(quoteInput());
    await expect(
      prisma.$executeRaw`UPDATE quote_status_transitions SET to_status = 'POLICY_ISSUED' WHERE quote_id = ${q.id}::uuid`,
    ).rejects.toThrow(/append-only: UPDATE/);
    await expect(
      prisma.$executeRaw`DELETE FROM quote_status_transitions WHERE quote_id = ${q.id}::uuid`,
    ).rejects.toThrow(/append-only: DELETE/);
    await expect(
      prisma.quote.delete({ where: { id: q.id } }),
    ).rejects.toThrow();
    expect(await trail(q.id)).toHaveLength(1);
  });

  it('gives concurrent changes to one quote distinct, gap-free sequence numbers', async () => {
    const q = await repo.create(quoteInput());
    await repo.transition(q.id, QUOTE_GENERATED, MEDICAL_DECLARED, {
      medicalDeclaration: declaration,
      medicalDeclaredAt: new Date(),
    });
    // Two racing payments: exactly one wins, and the trail stays 1, 2, 3.
    const results = await Promise.allSettled([
      repo.transition(q.id, MEDICAL_DECLARED, PREMIUM_PAID),
      repo.transition(q.id, MEDICAL_DECLARED, PREMIUM_PAID),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await trail(q.id)).map((r) => r.seq)).toEqual([1, 2, 3]);
  });
});
