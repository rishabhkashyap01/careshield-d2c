import { Prisma } from '../../generated/prisma/client.js';
import { calculatePremium } from './premium-calculator.js';

const fmt = (b: ReturnType<typeof calculatePremium>) => ({
  base: b.basePremium.toFixed(2),
  age: b.ageLoading.toFixed(2),
  cond: b.conditionLoading.toFixed(2),
  total: b.totalPremium.toFixed(2),
});

describe('calculatePremium (Task 2.2)', () => {
  it.each([
    // age, pre-existing, age loading, condition loading, total
    [30, false, '0.00', '0.00', '10000.00'],
    [30, true, '0.00', '5000.00', '15000.00'],
    [45, false, '0.00', '0.00', '10000.00'], // boundary: 45 is NOT > 45
    [45, true, '0.00', '5000.00', '15000.00'],
    [46, false, '5000.00', '0.00', '15000.00'], // first loaded age
    [46, true, '5000.00', '5000.00', '20000.00'],
    [18, false, '0.00', '0.00', '10000.00'],
    [99, true, '5000.00', '5000.00', '20000.00'],
  ])(
    'age %i, preExisting=%s → ageLoading %s, conditionLoading %s, total %s',
    (age, hasPreExistingConditions, ageLoading, conditionLoading, total) => {
      expect(fmt(calculatePremium({ age, hasPreExistingConditions }))).toEqual({
        base: '10000.00',
        age: ageLoading,
        cond: conditionLoading,
        total,
      });
    },
  );

  it('returns Decimals (never floats) with 2 dp, total = sum of parts', () => {
    const b = calculatePremium({ age: 60, hasPreExistingConditions: true });
    for (const v of [
      b.basePremium,
      b.ageLoading,
      b.conditionLoading,
      b.totalPremium,
    ]) {
      expect(v).toBeInstanceOf(Prisma.Decimal);
      expect(v.decimalPlaces()).toBeLessThanOrEqual(2);
    }
    expect(
      b.basePremium
        .add(b.ageLoading)
        .add(b.conditionLoading)
        .eq(b.totalPremium),
    ).toBe(true);
    expect(b.currency).toBe('INR');
  });

  it('is deterministic', () => {
    const a = calculatePremium({ age: 50, hasPreExistingConditions: true });
    const b = calculatePremium({ age: 50, hasPreExistingConditions: true });
    expect(fmt(a)).toEqual(fmt(b));
  });

  it.each([-1, 30.5, Number.NaN])('rejects invalid age %s', (age) => {
    expect(() =>
      calculatePremium({ age, hasPreExistingConditions: false }),
    ).toThrow(RangeError);
  });
});
