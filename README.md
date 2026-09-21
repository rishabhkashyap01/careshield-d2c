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

`npm test` runs every API suite: unit, database and end-to-end. They need the database running.

**Deploying:** see [DEPLOY.md](DEPLOY.md). It covers GitHub, Neon and two Vercel projects, one for the API and one for the website.

## Where each task is implemented

| Task | What | Where |
| ---- | ---- | ----- |
| 1.1 | `quotes` ↔ `policies`, state machine `QUOTE_GENERATED → MEDICAL_DECLARED → PREMIUM_PAID → POLICY_ISSUED` | `apps/api/prisma/schema.prisma`, `src/insurance/domain/quote-state-machine.ts` |
| 1.2 | `NUMERIC(10,2)` money, `created_at` / `expires_at` | `apps/api/prisma/migrations/` |
| 2.1 | `POST /api/v1/insurance/quote` with strict validation | `src/insurance/insurance.controller.ts`, `dto/create-quote.dto.ts` |
| 2.2 | ₹10,000 base, +50% if age > 45, +₹5,000 for pre-existing conditions | `src/insurance/domain/premium-calculator.ts` |
| 2.3 | `expires_at` = exactly 15 minutes after creation | `src/insurance/quotes.service.ts` |
| 3.1 | Accessible Tailwind UI that posts through Server Actions | `apps/web/src/app/actions.ts`, `components/flow/` |
| 3.2 | Countdown from the server's `expires_at`; payment disabled at 0; recalculate | `apps/web/src/hooks/useCountdown.ts`, `components/flow/ExpiredPanel.tsx` |
| 3.3 | `useActionState` / `useTransition` loading state that prevents double-clicks | `apps/web/src/components/flow/PaymentStep.tsx` |
| 4.1 | Atomic checkout transaction with rollback | `apps/api/src/insurance/checkout/checkout.service.ts` |
| 4.2 | `Idempotency-Key`: no double charges | `apps/api/src/insurance/checkout/idempotency.service.ts` |

Details are in [apps/api/README.md](apps/api/README.md) and [apps/web/README.md](apps/web/README.md).

## Design decisions

- **Rules are enforced in the database as well as the API.** CHECK constraints and triggers guard the state machine, the 15-minute lock, fixed prices, and "a policy only for a paid quote, at the quoted amount". The app gives friendly errors; the database is the final guarantee.
- **A quote is a fixed offer.** Its price and expiry never change. New details mean a new quote, and an abandoned quote simply expires.
- **The browser never calls the API directly.** Server Actions do, so the API address stays server-side.
- **Money is exact.** It's `NUMERIC(10,2)` in the database, `Decimal` in the API, and 2-decimal strings in JSON.

## Assumptions

- Cover is available from age 18 to 99.
- The medical eligibility rules are placeholders: a terminal illness can't be covered online, and a condition the quote wasn't priced for requires a recalculation.
- Payment uses a mock gateway (test tokens, no real money) that is idempotent like real providers.
