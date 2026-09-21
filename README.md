# CareShield D2C

Direct-to-consumer purchase journey for the **CareShield Max** enterprise health insurance plan.

A consumer gets a quote, declares their medical history, pays, and is issued a policy — online, in one flow.

## Purchase journey

1. **Premium Calculation & Quote Lock** — collect age and pre-existing conditions, compute a deterministic premium, lock it for 15 minutes.
2. **Medical Declaration** — submit structured health disclosures to evaluate eligibility.
3. **Instant Bind & Issue** — take a mock payment token, process payment, advance state, issue a policy contract ID.

Quote lifecycle (finite state machine):

```
QUOTE_GENERATED → MEDICAL_DECLARED → PREMIUM_PAID → POLICY_ISSUED
```

## Stack

| Layer    | Tech                                        |
| -------- | ------------------------------------------- |
| API      | NestJS (controllers, services, validation pipes) |
| Database | PostgreSQL + Prisma                         |
| Web      | Next.js (App Router, RSC / Server Actions) + Tailwind CSS |

## Repo layout

```
careshield-d2c/
├── apps/
│   ├── api/        # NestJS REST API  (/api/v1/insurance/*)
│   └── web/        # Next.js frontend
├── docs/           # design notes (idempotency, transactions)
└── docker-compose.yml   # local PostgreSQL
```

## Roadmap

- [ ] **Phase 1 — Schema & state:** `quotes` ↔ `policies` tables, status enum FSM, `NUMERIC(10,2)` money columns, `created_at` / `expires_at`.
- [ ] **Phase 2 — Quote API:** `POST /api/v1/insurance/quote` with strict validation (`age`, `hasPreExistingConditions`).
  Pricing: base ₹10,000; +50% if `age > 45`; +₹5,000 flat if pre-existing conditions. Save with `expires_at = now + 15 min`.
- [ ] **Phase 3 — Frontend:** accessible Tailwind UI, countdown driven by server `expires_at` (disables payment at zero and prompts a recalculation), `useTransition` / `useActionState` pending state to block double-clicks.
- [ ] **Phase 4 — Checkout:** `POST /api/v1/insurance/checkout` — quote conversion + policy creation in one atomic DB transaction with rollback; `Idempotency-Key` header to prevent double charges.

## Local development

```bash
docker compose up -d   # starts PostgreSQL on :5432
```

App-level setup instructions will be added as each phase lands.
