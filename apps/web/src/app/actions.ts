'use server';

import { apiPost, fieldErrorsFrom, isErrorBody } from '@/lib/api';
import type {
  DeclarationState,
  IssuedPolicy,
  PaymentState,
  Quote,
  QuoteFormState,
  QuoteInputs,
} from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNAVAILABLE =
  'We couldn’t reach our servers. Please check your connection and try again.';

/* -------------------------------------------------------------------------- */
/* Step 1 — premium calculation & quote lock                                  */
/* -------------------------------------------------------------------------- */

export async function requestQuote(
  _prev: QuoteFormState,
  formData: FormData,
): Promise<QuoteFormState> {
  const values: QuoteInputs = {
    age: String(formData.get('age') ?? '').trim(),
    hasPreExistingConditions:
      formData.get('hasPreExistingConditions') === 'yes'
        ? 'yes'
        : formData.get('hasPreExistingConditions') === 'no'
          ? 'no'
          : '',
  };

  // Server-side checks first (the API re-validates; it is the source of truth).
  const fieldErrors: Record<string, string> = {};
  if (!/^\d{1,3}$/.test(values.age)) {
    fieldErrors.age = 'Enter your age in whole years, for example 34.';
  }
  if (!values.hasPreExistingConditions) {
    fieldErrors.hasPreExistingConditions = 'Choose yes or no.';
  }
  if (Object.keys(fieldErrors).length) {
    return { status: 'error', values, fieldErrors };
  }

  const res = await apiPost<Quote>('/insurance/quote', {
    age: Number(values.age),
    hasPreExistingConditions: values.hasPreExistingConditions === 'yes',
  });

  if (res.ok && res.data && !isErrorBody(res.data)) {
    return { status: 'success', values, quote: res.data };
  }
  if (res.status === 400 && isErrorBody(res.data)) {
    return { status: 'error', values, fieldErrors: fieldErrorsFrom(res.data) };
  }
  return {
    status: 'error',
    values,
    message: res.status === 0 ? UNAVAILABLE : 'Something went wrong calculating your premium. Please try again.',
  };
}

/* -------------------------------------------------------------------------- */
/* Step 2 — medical declaration                                               */
/* -------------------------------------------------------------------------- */

const DECLARATION_FIELDS = [
  'hasDiabetes',
  'hasHypertension',
  'hasHeartDisease',
  'isSmoker',
  'hadMajorSurgeryLast5Years',
  'hasTerminalIllness',
] as const;

export async function submitDeclaration(
  quoteId: string,
  _prev: DeclarationState,
  formData: FormData,
): Promise<DeclarationState> {
  if (!UUID.test(quoteId)) return { status: 'error', message: 'Invalid quote.' };

  const fieldErrors: Record<string, string> = {};
  const answers: Record<string, boolean> = {};
  for (const f of DECLARATION_FIELDS) {
    const v = formData.get(f);
    if (v !== 'yes' && v !== 'no') fieldErrors[f] = 'Choose yes or no.';
    else answers[f] = v === 'yes';
  }
  if (formData.get('confirmsAccuracy') !== 'on') {
    fieldErrors.confirmsAccuracy = 'Please confirm your answers are true and complete.';
  }
  if (Object.keys(fieldErrors).length) {
    return { status: 'error', message: 'Please answer every question.', fieldErrors };
  }

  const res = await apiPost<Quote>(`/insurance/quote/${quoteId}/medical-declaration`, {
    ...answers,
    confirmsAccuracy: true,
  });

  if (res.ok && res.data && !isErrorBody(res.data)) {
    return { status: 'success', quote: res.data };
  }
  const body = isErrorBody(res.data) ? res.data : null;
  switch (res.status) {
    case 410:
      return { status: 'error', expired: true, message: 'Your quote expired before we received your declaration.' };
    case 422:
      return {
        status: 'error',
        message: 'We can’t issue this policy online based on your answers.',
        reasons: body?.reasons?.map((r) => r.message),
        recalculate: body?.reasons?.some((r) => r.code === 'UNDECLARED_PRE_EXISTING_CONDITION'),
      };
    case 409:
      return { status: 'error', message: 'This declaration was already submitted.' };
    case 400:
      return { status: 'error', message: 'Please check your answers.', fieldErrors: fieldErrorsFrom(body) };
    case 0:
      return { status: 'error', message: UNAVAILABLE };
    default:
      return { status: 'error', message: 'Something went wrong. Please try again.' };
  }
}

/* -------------------------------------------------------------------------- */
/* Step 3 — bind & issue (payment)                                            */
/* -------------------------------------------------------------------------- */

const MOCK_TOKENS = new Set([
  'tok_visa_4242',
  'tok_mastercard_4444',
  'tok_upi_success',
  'tok_card_declined',
]);

/**
 * Calls POST /api/v1/insurance/checkout. `idempotencyKey` is minted
 * once per quote in the browser and reused on retries, so a double submit or a
 * retry after a network blip can never charge twice.
 */
export async function payPremium(
  quoteId: string,
  idempotencyKey: string,
  _prev: PaymentState,
  formData: FormData,
): Promise<PaymentState> {
  if (!UUID.test(quoteId) || !UUID.test(idempotencyKey)) {
    return { status: 'error', message: 'Invalid payment request.' };
  }
  const paymentToken = String(formData.get('paymentToken') ?? '');
  if (!MOCK_TOKENS.has(paymentToken)) {
    return { status: 'error', message: 'Choose a payment method.' };
  }

  const res = await apiPost<IssuedPolicy>(
    '/insurance/checkout',
    { quoteId, paymentToken },
    { 'Idempotency-Key': idempotencyKey },
  );

  if (res.ok && res.data && !isErrorBody(res.data)) {
    return { status: 'success', policy: res.data };
  }
  const body = isErrorBody(res.data) ? res.data : null;
  switch (res.status) {
    case 410:
      return { status: 'error', expired: true, message: 'Your quote expired before payment. You have not been charged.' };
    case 402:
      return { status: 'error', message: 'Your payment was declined. You have not been charged.' };
    case 404:
      return { status: 'error', message: 'We couldn’t find this quote. Please start again. You have not been charged.' };
    case 422:
      return { status: 'error', message: 'This payment request was already used. Please refresh and try again.' };
    case 409:
      return { status: 'error', message: typeof body?.message === 'string' ? body.message : 'This quote can’t be paid in its current state.' };
    // Outcome unknown (timeout / 5xx): the charge may or may not have gone
    // through. Retrying is safe because the same idempotency key is reused.
    case 0:
    default:
      return {
        status: 'error',
        message:
          'We couldn’t confirm your payment. Please try again — you will not be charged twice.',
      };
  }
}
