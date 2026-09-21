'use client';

import { useActionState, useRef, useState, type FormEvent } from 'react';
import { payPremium } from '@/app/actions';
import { formatMoney } from '@/lib/format';
import type { IssuedPolicy, PaymentState, Quote } from '@/lib/types';
import { Alert, Button } from './ui';

const METHODS = [
  { token: 'tok_visa_4242', label: 'Visa ending 4242' },
  { token: 'tok_mastercard_4444', label: 'Mastercard ending 4444' },
  { token: 'tok_upi_success', label: 'UPI · demo@okbank' },
] as const;

/**
 * Journey step 3 (Task 3.3). Double-charge protection in three layers:
 *  1. `pending` from useActionState disables the button and the fieldset.
 *  2. A synchronous ref guard drops a second submit fired before React has
 *     re-rendered (e.g. a very fast double-click or Enter key repeat).
 *  3. One idempotency key per quote, reused on retries, so even a duplicate
 *     request that reaches the server is charged once (enforced in Phase 4).
 */
export function PaymentForm({
  quote,
  expired,
  onPaid,
  onExpired,
}: {
  quote: Quote;
  expired: boolean;
  onPaid: (p: IssuedPolicy) => void;
  onExpired: () => void;
}) {
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const inFlight = useRef(false);

  const [state, action, pending] = useActionState<PaymentState, FormData>(
    async (prev, fd) => {
      try {
        const result = await payPremium(quote.quoteId, idempotencyKey, prev, fd);
        if (result.status === 'success') onPaid(result.policy);
        if (result.status === 'error' && result.expired) onExpired();
        return result;
      } finally {
        inFlight.current = false;
      }
    },
    { status: 'idle' },
  );

  const blocked = pending || expired;

  function guard(e: FormEvent<HTMLFormElement>) {
    if (inFlight.current || expired) {
      e.preventDefault();
      return;
    }
    inFlight.current = true;
  }

  return (
    <form action={action} onSubmit={guard} aria-busy={pending} className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Pay &amp; get covered</h2>
        <p className="mt-1 text-slate-600">
          This is a demo checkout — choose a mock payment method. No real money is taken.
        </p>
      </div>

      {state.status === 'error' && !state.expired && !expired && (
        <Alert tone="error" title="Payment not completed">
          {state.message}
        </Alert>
      )}

      <fieldset disabled={blocked} className="space-y-2">
        <legend className="text-base font-medium text-slate-900">Payment method</legend>
        {METHODS.map((m, i) => (
          <label
            key={m.token}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-3 has-[:checked]:border-indigo-600 has-[:checked]:bg-indigo-50 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-indigo-200 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
          >
            <input
              type="radio"
              name="paymentToken"
              value={m.token}
              defaultChecked={i === 0}
              className="h-4 w-4 accent-indigo-700"
            />
            <span className="text-slate-900">{m.label}</span>
          </label>
        ))}
      </fieldset>

      <Button
        type="submit"
        disabled={blocked}
        pending={pending}
        pendingLabel="Processing payment…"
        className="w-full sm:w-auto"
        data-testid="pay-button"
      >
        Pay {formatMoney(quote.premium.total)}
      </Button>

      <p className="sr-only" role="status" aria-live="polite">
        {pending ? 'Processing your payment. Please don’t close this page.' : ''}
      </p>
    </form>
  );
}
