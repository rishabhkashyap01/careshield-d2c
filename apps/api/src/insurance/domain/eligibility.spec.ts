import { evaluateEligibility, type MedicalDeclaration } from './eligibility.js';

const clean: MedicalDeclaration = {
  hasDiabetes: false,
  hasHypertension: false,
  hasHeartDisease: false,
  isSmoker: false,
  hadMajorSurgeryLast5Years: false,
  hasTerminalIllness: false,
};

describe('evaluateEligibility', () => {
  it('accepts a clean declaration', () => {
    expect(
      evaluateEligibility(clean, { hasPreExistingConditions: false }),
    ).toEqual({ eligible: true, reasons: [] });
  });

  it('accepts declared conditions when the quote was priced for them', () => {
    const r = evaluateEligibility(
      { ...clean, hasDiabetes: true, isSmoker: true },
      { hasPreExistingConditions: true },
    );
    expect(r.eligible).toBe(true);
  });

  it.each(['hasDiabetes', 'hasHypertension', 'hasHeartDisease'] as const)(
    'rejects %s when the quote said no pre-existing conditions',
    (field) => {
      const r = evaluateEligibility(
        { ...clean, [field]: true },
        { hasPreExistingConditions: false },
      );
      expect(r.eligible).toBe(false);
      expect(r.reasons.map((x) => x.code)).toEqual([
        'UNDECLARED_PRE_EXISTING_CONDITION',
      ]);
    },
  );

  it('smoking and past surgery alone do not change eligibility', () => {
    const r = evaluateEligibility(
      { ...clean, isSmoker: true, hadMajorSurgeryLast5Years: true },
      { hasPreExistingConditions: false },
    );
    expect(r.eligible).toBe(true);
  });

  it('terminal illness is a knock-out, and reasons accumulate', () => {
    const r = evaluateEligibility(
      { ...clean, hasTerminalIllness: true, hasHeartDisease: true },
      { hasPreExistingConditions: false },
    );
    expect(r.eligible).toBe(false);
    expect(r.reasons.map((x) => x.code)).toEqual([
      'TERMINAL_ILLNESS',
      'UNDECLARED_PRE_EXISTING_CONDITION',
    ]);
  });
});
