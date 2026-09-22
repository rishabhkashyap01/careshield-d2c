-- New quote state between "declared" and "paid": a payment has been started
-- (committed before the gateway is called) and the 15-minute clock is frozen.
-- On its own migration because PostgreSQL cannot use a new enum value in the
-- transaction that adds it.

-- AlterEnum
ALTER TYPE "QuoteStatus" ADD VALUE 'PENDING_PAYMENT' BEFORE 'PREMIUM_PAID';
