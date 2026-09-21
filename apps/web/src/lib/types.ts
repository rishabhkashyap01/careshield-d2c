/** Mirrors QuoteResponse from the NestJS API (apps/api). */
export type QuoteStatus =
  | 'QUOTE_GENERATED'
  | 'MEDICAL_DECLARED'
  | 'PREMIUM_PAID'
  | 'POLICY_ISSUED';

export interface Quote {
  quoteId: string;
  status: QuoteStatus;
  applicant: { age: number; hasPreExistingConditions: boolean };
  premium: {
    currency: string;
    base: string;
    ageLoading: string;
    conditionLoading: string;
    total: string;
  };
  createdAt: string;
  medicalDeclaredAt: string | null;
  expiresAt: string;
  lockDurationSeconds: number;
  serverTime: string;
  isExpired: boolean;
}

/**
 * Contract for POST /api/v1/insurance/checkout (implemented in Phase 4).
 * Request: header `Idempotency-Key: <uuid>`, body `{ quoteId, paymentToken }`.
 */
export interface IssuedPolicy {
  policyNumber: string;
  quoteId: string;
  status: 'POLICY_ISSUED' | string;
  premiumPaid: string;
  currency: string;
  paymentReference: string;
  coverageStart: string;
  coverageEnd: string;
  issuedAt: string;
}

export type FieldErrors = Partial<Record<string, string>>;

export interface QuoteInputs {
  age: string;
  hasPreExistingConditions: '' | 'yes' | 'no';
}

export type QuoteFormState =
  | { status: 'idle'; values: QuoteInputs }
  | { status: 'error'; values: QuoteInputs; message?: string; fieldErrors?: FieldErrors }
  | { status: 'success'; values: QuoteInputs; quote: Quote };

export type DeclarationState =
  | { status: 'idle' }
  | { status: 'error'; message: string; reasons?: string[]; fieldErrors?: FieldErrors; expired?: boolean; recalculate?: boolean }
  | { status: 'success'; quote: Quote };

export type PaymentState =
  | { status: 'idle' }
  | { status: 'error'; message: string; expired?: boolean }
  | { status: 'success'; policy: IssuedPolicy };
