-- Hand-written migration: database-level guarantees that Prisma's schema
-- language cannot express. Application code enforces the same rules; these
-- are the last line of defence against bugs, races, and manual SQL.
--
-- Note: DECIMAL(10,2) and NUMERIC(10,2) are the same type in PostgreSQL.

-- ---------------------------------------------------------------------------
-- 1. CHECK constraints — financial precision & sane values
-- ---------------------------------------------------------------------------
ALTER TABLE "quotes"
  ADD CONSTRAINT "quotes_age_range_chk"
    CHECK ("age" BETWEEN 0 AND 120),
  ADD CONSTRAINT "quotes_premiums_non_negative_chk"
    CHECK ("base_premium" >= 0 AND "age_loading" >= 0 AND "condition_loading" >= 0),
  ADD CONSTRAINT "quotes_total_premium_matches_breakdown_chk"
    CHECK ("total_premium" = "base_premium" + "age_loading" + "condition_loading"),
  ADD CONSTRAINT "quotes_currency_iso4217_chk"
    CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "quotes_expires_after_created_chk"
    CHECK ("expires_at" > "created_at"),
  -- Once past QUOTE_GENERATED, a medical declaration must be on file.
  ADD CONSTRAINT "quotes_declaration_present_chk"
    CHECK (
      "status" = 'QUOTE_GENERATED'
      OR ("medical_declaration" IS NOT NULL AND "medical_declared_at" IS NOT NULL)
    );

ALTER TABLE "policies"
  ADD CONSTRAINT "policies_premium_positive_chk"
    CHECK ("premium_paid" > 0),
  ADD CONSTRAINT "policies_currency_iso4217_chk"
    CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "policies_coverage_window_chk"
    CHECK ("coverage_end" > "coverage_start");

-- ---------------------------------------------------------------------------
-- 2. Quote state machine trigger
--    QUOTE_GENERATED → MEDICAL_DECLARED → PREMIUM_PAID → POLICY_ISSUED
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "enforce_quote_lifecycle"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  allowed_next "QuoteStatus";
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'QUOTE_GENERATED' THEN
      RAISE EXCEPTION 'New quotes must start in QUOTE_GENERATED (got %)', NEW."status"
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
    RETURN NEW;
  END IF;

  allowed_next := CASE OLD."status"
    WHEN 'QUOTE_GENERATED'  THEN 'MEDICAL_DECLARED'::"QuoteStatus"
    WHEN 'MEDICAL_DECLARED' THEN 'PREMIUM_PAID'::"QuoteStatus"
    WHEN 'PREMIUM_PAID'     THEN 'POLICY_ISSUED'::"QuoteStatus"
    ELSE NULL
  END;

  IF allowed_next IS NULL OR NEW."status" <> allowed_next THEN
    RAISE EXCEPTION 'Illegal quote transition % -> % for quote %', OLD."status", NEW."status", OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;

  -- The 15-minute lock: declaring and paying must happen before expiry.
  IF NEW."status" IN ('MEDICAL_DECLARED', 'PREMIUM_PAID') AND now() > OLD."expires_at" THEN
    RAISE EXCEPTION 'Quote % expired at %; recalculate the premium', OLD."id", OLD."expires_at"
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

CREATE TRIGGER "quotes_enforce_lifecycle"
  BEFORE INSERT OR UPDATE ON "quotes"
  FOR EACH ROW EXECUTE FUNCTION "enforce_quote_lifecycle"();

-- ---------------------------------------------------------------------------
-- 3. A policy can only be created from a paid quote, for the exact amount.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "enforce_policy_from_paid_quote"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  q RECORD;
BEGIN
  SELECT "status", "total_premium", "currency" INTO q
    FROM "quotes" WHERE "id" = NEW."quote_id"
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW; -- the foreign key reports the missing quote
  END IF;

  IF q."status" <> 'PREMIUM_PAID' THEN
    RAISE EXCEPTION 'Policy requires quote % to be PREMIUM_PAID (is %)', NEW."quote_id", q."status"
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."premium_paid" <> q."total_premium" OR NEW."currency" <> q."currency" THEN
    RAISE EXCEPTION 'Policy premium % % does not match quoted % %',
      NEW."premium_paid", NEW."currency", q."total_premium", q."currency"
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "policies_enforce_paid_quote"
  BEFORE INSERT ON "policies"
  FOR EACH ROW EXECUTE FUNCTION "enforce_policy_from_paid_quote"();
