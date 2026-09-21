-- CreateEnum
CREATE TYPE "IdempotencyStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "scope" VARCHAR(64) NOT NULL,
    "key" VARCHAR(255) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "status" "IdempotencyStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "response_status" SMALLINT,
    "response_body" JSONB,
    "quote_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("scope","key")
);

-- CreateIndex
CREATE INDEX "idempotency_keys_quote_id_idx" ON "idempotency_keys"("quote_id");

-- ---------------------------------------------------------------------------
-- Hand-written additions (not expressible in schema.prisma)
-- ---------------------------------------------------------------------------

-- A completed record must carry the response it will replay.
ALTER TABLE "idempotency_keys"
  ADD CONSTRAINT "idempotency_keys_completed_has_response_chk"
    CHECK ("status" <> 'COMPLETED' OR ("response_status" IS NOT NULL AND "response_body" IS NOT NULL)),
  ADD CONSTRAINT "idempotency_keys_request_hash_hex_chk"
    CHECK ("request_hash" ~ '^[0-9a-f]{64}$');

-- Human-facing policy numbers: CSM-<year>-<6 digits>. A sequence never hands
-- out the same value twice, even under concurrency (gaps after a rollback are fine).
CREATE SEQUENCE "policy_number_seq" START WITH 1 INCREMENT BY 1 NO CYCLE;
