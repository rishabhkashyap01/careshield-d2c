# CareShield D2C

Buy the **CareShield Max** health plan online in three steps: get a locked price, declare your health, and pay. A policy is issued instantly.

**Stack:** NestJS 12 · PostgreSQL 16 + Prisma 7 · Next.js 16 (App Router, Server Actions) · Tailwind CSS 4

```
careshield-d2c/
├── apps/api/            NestJS REST API + database (schema, migrations, tests)
├── apps/web/            Next.js website
└── docker-compose.yml   local PostgreSQL
```

## Run it

You need Node 22 or later and Docker Desktop.

```bash
npm install
docker compose up -d                      # PostgreSQL on :5432
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
npm run db:migrate

npm run api:dev                           # terminal 1 → http://localhost:4000/api/v1/health
npm run web:dev                           # terminal 2 → http://localhost:3000
```

### Tests

219 tests in four suites. `npm test` runs them all, in about 45 s; the API suites need the database running.

**Visual report:** `npm run test:report` runs every suite and writes `reports/test-report.html`, a single page you open in any browser (add `-- --open` to open it for you). It shows pass/fail at a glance, every test as a square, the purchase journey, the generated tests and their random-case counts, the slowest files, and a searchable list. Failures come first, with fast-check's shrunk counterexample and seed. The script is `scripts/test-report/run.mjs` and the page is `scripts/test-report/template.html`.

| Suite | Command | What it covers |
| --- | --- | --- |
| API unit | `npm run api:test` | Pricing, lock, state machine, eligibility, validation, webhooks (no database) |
| Database | `npm run api:test:db` | CHECK constraints, triggers and the audit trail, run against real PostgreSQL |
| API end-to-end | `npm run api:test:e2e` | The whole API over HTTP: checkout, idempotency, slow payments, outages |
| Website | `npm run web:test` | Countdown maths |

**Generated tests.** 42 of them are property-based, written with [fast-check](https://fast-check.dev) in files named `*.property.*`. Each one states a rule, such as "the total always equals base + loadings" or "the database accepts exactly the legal transitions, and the audit trail records exactly what happened". fast-check then invents the inputs: about 10,000 random cases per run, with the boundary values always included. When a rule breaks, it shrinks the failure to the smallest example that still fails and prints a seed so the failure can be replayed:

```bash
FC_NUM_RUNS=5000 npm test     # try harder: 5,000 cases per rule
FC_SEED=<seed> npm test       # replay a failure, using the seed it printed
```

**Deploying:** see [DEPLOY.md](DEPLOY.md). It covers GitHub, Neon and two Vercel projects, one for the API and one for the website.

## Where each task is implemented

| Task | What | Where |
| ---- | ---- | ----- |
| 1.1 | `quotes` ↔ `policies`, state machine `QUOTE_GENERATED → MEDICAL_DECLARED → (PENDING_PAYMENT) → PREMIUM_PAID → POLICY_ISSUED` | `apps/api/prisma/schema.prisma`, `src/insurance/domain/quote-state-machine.ts` |
| 1.2 | `NUMERIC(10,2)` money, `created_at` / `expires_at` | `apps/api/prisma/migrations/` |
| 2.1 | `POST /api/v1/insurance/quote` with strict validation | `src/insurance/insurance.controller.ts`, `dto/create-quote.dto.ts` |
| 2.2 | ₹10,000 base, +50% if age > 45, +₹5,000 for pre-existing conditions | `src/insurance/domain/premium-calculator.ts` |
| 2.3 | `expires_at` = exactly 15 minutes after creation | `src/insurance/quotes.service.ts` |
| 3.1 | Accessible Tailwind UI that posts through Server Actions | `apps/web/src/app/actions.ts`, `components/flow/` |
| 3.2 | Countdown from the server-computed `remainingMs` (device clock never trusted); payment disabled at 0; recalculate | `apps/web/src/lib/lock-clock.ts`, `hooks/useCountdown.ts`, `components/flow/ExpiredPanel.tsx` |
| 3.3 | `useActionState` / `useTransition` loading state that prevents double-clicks | `apps/web/src/components/flow/PaymentStep.tsx` |
| 4.1 | Atomic checkout with rollback, in short transactions: the payment gateway is never called inside one | `apps/api/src/insurance/checkout/checkout.service.ts`, `payment-settlement.service.ts` |
| 4.2 | `Idempotency-Key`: no double charges | `apps/api/src/insurance/checkout/idempotency.service.ts` |
| + | `PENDING_PAYMENT` freezes the 15-minute lock while a payment is processing; late results settle through a signed webhook, a status poll or a reconciler | `apps/api/prisma/migrations/20260923000100_checkout_payment_lifecycle/`, `src/insurance/checkout/` |
| + | Immutable, sequential audit trail of every status change (`quote_id, from, to, time, context`) | `apps/api/prisma/migrations/20260922100000_quote_status_audit/`, `src/insurance/quotes.repository.ts` |

Details are in [apps/api/README.md](apps/api/README.md) and [apps/web/README.md](apps/web/README.md).

## Design decisions

- **Rules are enforced in the database as well as the API.** CHECK constraints and triggers guard the state machine, the 15-minute lock, fixed prices, and "a policy only for a paid quote, at the quoted amount". The app gives friendly errors; the database is the final guarantee.
- **Every status change is audited by the database.** A trigger writes an append-only row to `quote_status_transitions` for each change, with why it happened (action, request id, idempotency key, payment reference) and who (database user, transaction). A rolled-back change leaves no row; manual SQL is recorded too.
- **The countdown never trusts the device clock.** The API sends the lock time left, measured on its own clock; the browser only measures elapsed time from when that answer arrived.
- **No slow network call inside a database transaction.** Checkout records `PENDING_PAYMENT` and commits, calls the payment gateway with no transaction open, then settles in a second short transaction. A payment started before the 15-minute deadline may finish after it, because the clock is frozen for it. If the gateway is slow, the customer sees "processing" and the result is applied by the provider's webhook, the status poll or a scheduled reconciler, exactly once.
- **A quote is a fixed offer.** Its price and expiry never change. New details mean a new quote, and an abandoned quote simply expires.
- **The browser never calls the API directly.** Server Actions do, so the API address stays server-side.
- **Money is exact.** It's `NUMERIC(10,2)` in the database, `Decimal` in the API, and 2-decimal strings in JSON.

## Assumptions

- Cover is available from age 18 to 99.
- The medical eligibility rules are placeholders: a terminal illness can't be covered online, and a condition the quote wasn't priced for requires a recalculation.
- Payment uses a mock gateway (test tokens, no real money) that is idempotent like real providers.
