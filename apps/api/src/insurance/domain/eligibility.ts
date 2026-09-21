/**
 * Medical declaration & eligibility (journey step 2).
 *
 * PLACEHOLDER UNDERWRITING RULES — replace with the product's real rules.
 *  1. Knock-out: a terminal illness diagnosis makes the applicant ineligible.
 *  2. Consistency: if the quote was priced WITHOUT pre-existing conditions but
 *     the declaration lists one, the locked premium is wrong → the applicant
 *     must recalculate (with hasPreExistingConditions = true).
 */
export interface MedicalDeclaration {
  hasDiabetes: boolean;
  hasHypertension: boolean;
  hasHeartDisease: boolean;
  isSmoker: boolean;
  hadMajorSurgeryLast5Years: boolean;
  hasTerminalIllness: boolean;
}

export type IneligibilityCode =
  'TERMINAL_ILLNESS' | 'UNDECLARED_PRE_EXISTING_CONDITION';

export interface EligibilityResult {
  eligible: boolean;
  reasons: { code: IneligibilityCode; message: string }[];
}

export function declaresPreExistingCondition(d: MedicalDeclaration): boolean {
  return d.hasDiabetes || d.hasHypertension || d.hasHeartDisease;
}

export function evaluateEligibility(
  declaration: MedicalDeclaration,
  quote: { hasPreExistingConditions: boolean },
): EligibilityResult {
  const reasons: EligibilityResult['reasons'] = [];

  if (declaration.hasTerminalIllness) {
    reasons.push({
      code: 'TERMINAL_ILLNESS',
      message:
        'CareShield Max cannot be issued online for applicants with a terminal illness diagnosis. Please contact our advisors.',
    });
  }

  if (
    !quote.hasPreExistingConditions &&
    declaresPreExistingCondition(declaration)
  ) {
    reasons.push({
      code: 'UNDECLARED_PRE_EXISTING_CONDITION',
      message:
        'You declared a pre-existing condition that was not included in your quote. Please recalculate your premium with pre-existing conditions selected.',
    });
  }

  return { eligible: reasons.length === 0, reasons };
}

export class IneligibleApplicantError extends Error {
  constructor(
    readonly quoteId: string,
    readonly result: EligibilityResult,
  ) {
    super(`Applicant for quote ${quoteId} is not eligible`);
    this.name = 'IneligibleApplicantError';
  }
}
