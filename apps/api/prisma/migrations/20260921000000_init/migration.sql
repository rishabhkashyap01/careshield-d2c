-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('QUOTE_GENERATED', 'MEDICAL_DECLARED', 'PREMIUM_PAID', 'POLICY_ISSUED');

-- CreateEnum
CREATE TYPE "PolicyStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateTable
CREATE TABLE "quotes" (
    "id" UUID NOT NULL,
    "age" SMALLINT NOT NULL,
    "has_pre_existing_conditions" BOOLEAN NOT NULL,
    "base_premium" DECIMAL(10,2) NOT NULL,
    "age_loading" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "condition_loading" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_premium" DECIMAL(10,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "status" "QuoteStatus" NOT NULL DEFAULT 'QUOTE_GENERATED',
    "medical_declaration" JSONB,
    "medical_declared_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policies" (
    "id" UUID NOT NULL,
    "policy_number" VARCHAR(32) NOT NULL,
    "quote_id" UUID NOT NULL,
    "status" "PolicyStatus" NOT NULL DEFAULT 'ACTIVE',
    "premium_paid" DECIMAL(10,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "payment_reference" VARCHAR(64) NOT NULL,
    "coverage_start" TIMESTAMPTZ(3) NOT NULL,
    "coverage_end" TIMESTAMPTZ(3) NOT NULL,
    "issued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quotes_status_expires_at_idx" ON "quotes"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "policies_policy_number_key" ON "policies"("policy_number");

-- CreateIndex
CREATE UNIQUE INDEX "policies_quote_id_key" ON "policies"("quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "policies_payment_reference_key" ON "policies"("payment_reference");

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
