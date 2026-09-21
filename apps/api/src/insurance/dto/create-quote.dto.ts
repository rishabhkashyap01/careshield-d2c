import { IsBoolean, IsDefined, IsInt, Max, Min } from 'class-validator';

/** Underwriting eligibility window for CareShield Max (assumption; adjust per product). */
export const MIN_ELIGIBLE_AGE = 18;
export const MAX_ELIGIBLE_AGE = 99;

/**
 * Body of POST /api/v1/insurance/quote (Task 2.1).
 *
 * Validation is deliberately strict: implicit type conversion is OFF, so
 * `"age": "30"` or `"hasPreExistingConditions": "true"` are rejected rather
 * than silently coerced, and unknown fields are refused (see configureApp).
 */
export class CreateQuoteDto {
  // class-validator runs decorators bottom-up, so the type check (IsInt) is
  // listed last to make it the first — and, with stopAtFirstError, the only —
  // message for a wrong type.
  @IsDefined({ message: 'age is required' })
  @Max(MAX_ELIGIBLE_AGE, {
    message: `age must be at most ${MAX_ELIGIBLE_AGE}`,
  })
  @Min(MIN_ELIGIBLE_AGE, {
    message: `age must be at least ${MIN_ELIGIBLE_AGE}`,
  })
  @IsInt({ message: 'age must be a whole number' })
  age!: number;

  @IsDefined({ message: 'hasPreExistingConditions is required' })
  @IsBoolean({ message: 'hasPreExistingConditions must be true or false' })
  hasPreExistingConditions!: boolean;
}
