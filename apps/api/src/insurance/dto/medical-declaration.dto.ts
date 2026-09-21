import { Equals, IsBoolean, IsDefined } from 'class-validator';
import type { MedicalDeclaration } from '../domain/eligibility.js';

/** Body of POST /api/v1/insurance/quote/:id/medical-declaration. */
export class MedicalDeclarationDto implements MedicalDeclaration {
  /** Diagnosed with diabetes. */
  @IsDefined({ message: 'hasDiabetes is required' })
  @IsBoolean({ message: 'hasDiabetes must be true or false' })
  hasDiabetes!: boolean;

  /** Diagnosed with high blood pressure. */
  @IsDefined({ message: 'hasHypertension is required' })
  @IsBoolean({ message: 'hasHypertension must be true or false' })
  hasHypertension!: boolean;

  /** Diagnosed with a heart condition. */
  @IsDefined({ message: 'hasHeartDisease is required' })
  @IsBoolean({ message: 'hasHeartDisease must be true or false' })
  hasHeartDisease!: boolean;

  /** Smoked or used tobacco in the last 12 months. */
  @IsDefined({ message: 'isSmoker is required' })
  @IsBoolean({ message: 'isSmoker must be true or false' })
  isSmoker!: boolean;

  /** Had major surgery in the last 5 years. */
  @IsDefined({ message: 'hadMajorSurgeryLast5Years is required' })
  @IsBoolean({ message: 'hadMajorSurgeryLast5Years must be true or false' })
  hadMajorSurgeryLast5Years!: boolean;

  /** Diagnosed with a terminal illness. */
  @IsDefined({ message: 'hasTerminalIllness is required' })
  @IsBoolean({ message: 'hasTerminalIllness must be true or false' })
  hasTerminalIllness!: boolean;

  /** The applicant must confirm the declaration is true and complete. */
  @IsDefined({ message: 'confirmsAccuracy is required' })
  @Equals(true, {
    message: 'You must confirm that your declaration is true and complete',
  })
  confirmsAccuracy!: true;
}
