import { Prisma } from '../../generated/prisma/client.js';

/**
 * CareShield Max pricing rules (Task 2.2).
 *
 *   base                      ₹10,000.00
 *   age > 45                  + 50% of base   (age 45 itself is NOT loaded)
 *   hasPreExistingConditions  + ₹5,000.00 flat
 *
 * All arithmetic uses Prisma.Decimal (decimal.js) — never JS floats — and every
 * amount is rounded to 2 dp (ROUND_HALF_UP) to match NUMERIC(10,2).
 * The function is pure: same inputs → same quote, which is what makes a locked
 * quote "deterministic".
 */
export const PRICING = Object.freeze({
  currency: 'INR',
  basePremium: new Prisma.Decimal('10000.00'),
  ageLoadingThreshold: 45,
  ageLoadingRate: new Prisma.Decimal('0.50'),
  preExistingConditionLoading: new Prisma.Decimal('5000.00'),
});

export interface PremiumInput {
  age: number;
  hasPreExistingConditions: boolean;
}

export interface PremiumBreakdown {
  currency: string;
  basePremium: Prisma.Decimal;
  ageLoading: Prisma.Decimal;
  conditionLoading: Prisma.Decimal;
  totalPremium: Prisma.Decimal;
}

const money = (d: Prisma.Decimal) =>
  d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

export function calculatePremium(input: PremiumInput): PremiumBreakdown {
  if (!Number.isInteger(input.age) || input.age < 0) {
    throw new RangeError(
      `age must be a non-negative integer, got ${input.age}`,
    );
  }

  const basePremium = money(PRICING.basePremium);
  const ageLoading = money(
    input.age > PRICING.ageLoadingThreshold
      ? basePremium.mul(PRICING.ageLoadingRate)
      : new Prisma.Decimal(0),
  );
  const conditionLoading = money(
    input.hasPreExistingConditions
      ? PRICING.preExistingConditionLoading
      : new Prisma.Decimal(0),
  );
  const totalPremium = money(basePremium.add(ageLoading).add(conditionLoading));

  return {
    currency: PRICING.currency,
    basePremium,
    ageLoading,
    conditionLoading,
    totalPremium,
  };
}
