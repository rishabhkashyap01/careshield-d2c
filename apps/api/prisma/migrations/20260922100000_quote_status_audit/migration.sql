-- State-machine audit trail: one immutable, sequential row per quote status
-- change. Written by a database trigger, so no code path (including manual
-- SQL) can change a quote's status without leaving a record, and a rolled-back
-- transaction leaves no record either.

-- CreateTable
CREATE TABLE "quote_status_transitions" (
    "id" BIGSERIAL NOT NULL,
    "quote_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "from_status" "QuoteStatus",
    "to_status" "QuoteStatus" NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trigger_context" JSONB NOT NULL,

    CONSTRAINT "quote_status_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quote_status_transitions_quote_id_seq_key" ON "quote_status_transitions"("quote_id", "seq");

-- AddForeignKey
ALTER TABLE "quote_status_transitions" ADD CONSTRAINT "quote_status_transitions_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ---------------------------------------------------------------------------
-- 1. Shape rules
-- ---------------------------------------------------------------------------
ALTER TABLE "quote_status_transitions"
  ADD CONSTRAINT "quote_status_transitions_seq_positive_chk"
    CHECK ("seq" >= 1),
  -- The first entry is the quote's creation (no previous state); every later
  -- entry has one.
  ADD CONSTRAINT "quote_status_transitions_first_entry_chk"
    CHECK (("seq" = 1) = ("from_status" IS NULL)),
  ADD CONSTRAINT "quote_status_transitions_changes_state_chk"
    CHECK ("from_status" IS DISTINCT FROM "to_status"),
  ADD CONSTRAINT "quote_status_transitions_context_object_chk"
    CHECK (jsonb_typeof("trigger_context") = 'object');

-- ---------------------------------------------------------------------------
-- 2. Backfill quotes that existed before this migration, reconstructed from
--    the timestamps already stored on quotes and policies.
-- ---------------------------------------------------------------------------
INSERT INTO "quote_status_transitions" ("quote_id", "seq", "from_status", "to_status", "occurred_at", "trigger_context")
SELECT t."quote_id",
       row_number() OVER (PARTITION BY t."quote_id" ORDER BY t."step"),
       t."from_status", t."to_status", t."occurred_at",
       jsonb_build_object('source', 'backfill', 'reconstructedFrom', t."reconstructed_from")
FROM (
  SELECT q."id" AS "quote_id", 1 AS "step", NULL::"QuoteStatus" AS "from_status",
         'QUOTE_GENERATED'::"QuoteStatus" AS "to_status", q."created_at" AS "occurred_at",
         'quotes.created_at' AS "reconstructed_from"
    FROM "quotes" q
  UNION ALL
  SELECT q."id", 2, 'QUOTE_GENERATED', 'MEDICAL_DECLARED',
         COALESCE(q."medical_declared_at", q."updated_at"), 'quotes.medical_declared_at'
    FROM "quotes" q WHERE q."status" <> 'QUOTE_GENERATED'
  UNION ALL
  SELECT q."id", 3, 'MEDICAL_DECLARED', 'PREMIUM_PAID',
         COALESCE(p."issued_at", q."updated_at"), 'policies.issued_at'
    FROM "quotes" q LEFT JOIN "policies" p ON p."quote_id" = q."id"
   WHERE q."status" IN ('PREMIUM_PAID', 'POLICY_ISSUED')
  UNION ALL
  SELECT q."id", 4, 'PREMIUM_PAID', 'POLICY_ISSUED',
         COALESCE(p."issued_at", q."updated_at"), 'policies.issued_at'
    FROM "quotes" q LEFT JOIN "policies" p ON p."quote_id" = q."id"
   WHERE q."status" = 'POLICY_ISSUED'
) t;

-- ---------------------------------------------------------------------------
-- 3. Record every status change.
--    The application describes WHY a change happened by calling
--      SELECT set_config('app.audit_context', '<json object>', true)
--    in the same transaction (transaction-scoped, so it cannot leak to another
--    request on a pooled connection). Anything else — manual SQL, a script —
--    is still recorded, as {"source": "database"}. The database adds who
--    (db_user) and which transaction (txid) itself, so callers cannot fake them.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "record_quote_status_transition"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  raw_context TEXT := current_setting('app.audit_context', true);
  context     JSONB;
  next_seq    INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."status" IS NOT DISTINCT FROM OLD."status" THEN
    RETURN NULL;
  END IF;

  BEGIN
    context := NULLIF(raw_context, '')::jsonb;
  EXCEPTION WHEN others THEN
    context := jsonb_build_object('source', 'database', 'invalidAppContext', true);
  END;
  IF context IS NULL OR jsonb_typeof(context) <> 'object' THEN
    context := jsonb_build_object('source', 'database');
  END IF;
  context := context || jsonb_build_object('dbUser', current_user, 'txid', txid_current()::text);

  -- The UPDATE that fired this trigger holds the quote's row lock until the
  -- transaction ends, so two changes to the same quote can never compute the
  -- same next_seq (and the unique index would reject it if they did).
  SELECT COALESCE(MAX("seq"), 0) + 1 INTO next_seq
    FROM "quote_status_transitions" WHERE "quote_id" = NEW."id";

  INSERT INTO "quote_status_transitions" ("quote_id", "seq", "from_status", "to_status", "occurred_at", "trigger_context")
  VALUES (
    NEW."id",
    next_seq,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD."status" END,
    NEW."status",
    clock_timestamp(),
    context
  );
  RETURN NULL;
END;
$$;

-- AFTER triggers: only changes that passed enforce_quote_lifecycle are logged.
CREATE TRIGGER "quotes_record_status_insert"
  AFTER INSERT ON "quotes"
  FOR EACH ROW EXECUTE FUNCTION "record_quote_status_transition"();

CREATE TRIGGER "quotes_record_status_update"
  AFTER UPDATE OF "status" ON "quotes"
  FOR EACH ROW WHEN (OLD."status" IS DISTINCT FROM NEW."status")
  EXECUTE FUNCTION "record_quote_status_transition"();

-- ---------------------------------------------------------------------------
-- 4. The trail is append-only: rows can never be edited or deleted.
--    (In production, also run the API as a role that has only SELECT and
--    INSERT on this table, so TRUNCATE is impossible too:
--      REVOKE UPDATE, DELETE, TRUNCATE ON "quote_status_transitions" FROM <app_role>;)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "forbid_audit_modification"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'quote_status_transitions is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "quote_status_transitions_append_only"
  BEFORE UPDATE OR DELETE ON "quote_status_transitions"
  FOR EACH ROW EXECUTE FUNCTION "forbid_audit_modification"();
