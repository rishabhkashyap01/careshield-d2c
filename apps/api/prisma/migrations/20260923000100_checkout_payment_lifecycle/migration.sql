-- Checkout in three short steps instead of one long transaction:
--   1. MEDICAL_DECLARED → PENDING_PAYMENT   (must happen before expires_at; commits)
--   2. call the payment gateway              (no database transaction open)
--   3. PENDING_PAYMENT → PREMIUM_PAID → POLICY_ISSUED, or back to
--      MEDICAL_DECLARED if the payment definitively failed
-- Once PENDING_PAYMENT, the 15-minute clock is frozen: a payment that was
-- started in time may settle after expires_at (slow gateway, webhook later).

-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "payment_key" VARCHAR(255),
ADD COLUMN     "payment_started_at" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "quotes_status_payment_started_at_idx" ON "quotes"("status", "payment_started_at");

-- A payment in flight must say which attempt it is (the Idempotency-Key, which
-- the gateway and its webhooks also carry) and when it started.
ALTER TABLE "quotes"
  ADD CONSTRAINT "quotes_pending_payment_attempt_chk"
    CHECK ("status" <> 'PENDING_PAYMENT' OR ("payment_key" IS NOT NULL AND "payment_started_at" IS NOT NULL));

-- ---------------------------------------------------------------------------
-- Quote state machine trigger, now with PENDING_PAYMENT:
--
--   QUOTE_GENERATED → MEDICAL_DECLARED → PENDING_PAYMENT → PREMIUM_PAID → POLICY_ISSUED
--                            ↑                  │
--                            └── payment failed ┘
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "enforce_quote_lifecycle"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'QUOTE_GENERATED' THEN
      RAISE EXCEPTION 'New quotes must start in QUOTE_GENERATED (got %)', NEW."status"
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW."payment_key" IS NOT NULL OR NEW."payment_started_at" IS NOT NULL THEN
      RAISE EXCEPTION 'New quotes cannot carry a payment attempt'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- A locked quote is deterministic: its pricing inputs and outputs are immutable.
  IF (NEW."age", NEW."has_pre_existing_conditions", NEW."base_premium", NEW."age_loading",
      NEW."condition_loading", NEW."total_premium", NEW."currency", NEW."created_at", NEW."expires_at")
     IS DISTINCT FROM
     (OLD."age", OLD."has_pre_existing_conditions", OLD."base_premium", OLD."age_loading",
      OLD."condition_loading", OLD."total_premium", OLD."currency", OLD."created_at", OLD."expires_at")
  THEN
    RAISE EXCEPTION 'Quote % is locked: pricing fields cannot be modified', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."status" = OLD."status" THEN
    -- The payment attempt can't be swapped mid-flight.
    IF (NEW."payment_key", NEW."payment_started_at") IS DISTINCT FROM (OLD."payment_key", OLD."payment_started_at") THEN
      RAISE EXCEPTION 'Quote %: the payment attempt can only change together with the status', OLD."id"
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF (OLD."status"::text, NEW."status"::text) NOT IN (
       ('QUOTE_GENERATED',  'MEDICAL_DECLARED'),
       ('MEDICAL_DECLARED', 'PENDING_PAYMENT'),
       ('PENDING_PAYMENT',  'PREMIUM_PAID'),
       ('PENDING_PAYMENT',  'MEDICAL_DECLARED'),   -- the payment failed
       ('PREMIUM_PAID',     'POLICY_ISSUED'))
  THEN
    RAISE EXCEPTION 'Illegal quote transition % -> % for quote %', OLD."status", NEW."status", OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;

  -- The 15-minute lock: declaring and STARTING a payment must happen before
  -- expiry. Settling a payment that was started in time is not time-limited.
  IF (NEW."status" = 'PENDING_PAYMENT'
      OR (OLD."status" = 'QUOTE_GENERATED' AND NEW."status" = 'MEDICAL_DECLARED'))
     AND now() > OLD."expires_at" THEN
    RAISE EXCEPTION 'Quote % expired at %; recalculate the premium', OLD."id", OLD."expires_at"
      USING ERRCODE = 'check_violation';
  END IF;

  -- Payment attempt bookkeeping: set on entering PENDING_PAYMENT (see the CHECK),
  -- cleared when the payment fails, otherwise carried forward unchanged.
  IF OLD."status" = 'PENDING_PAYMENT' AND NEW."status" = 'MEDICAL_DECLARED' THEN
    IF NEW."payment_key" IS NOT NULL OR NEW."payment_started_at" IS NOT NULL THEN
      RAISE EXCEPTION 'Quote %: a failed payment must clear the payment attempt', OLD."id"
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW."status" <> 'PENDING_PAYMENT'
        AND (NEW."payment_key", NEW."payment_started_at") IS DISTINCT FROM (OLD."payment_key", OLD."payment_started_at") THEN
    RAISE EXCEPTION 'Quote %: the payment attempt can only change when a payment starts or fails', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;

  -- Issuing requires the policy row to exist (inserted in the same transaction).
  IF NEW."status" = 'POLICY_ISSUED'
     AND NOT EXISTS (SELECT 1 FROM "policies" p WHERE p."quote_id" = NEW."id") THEN
    RAISE EXCEPTION 'Quote % cannot be POLICY_ISSUED without a policy row', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
