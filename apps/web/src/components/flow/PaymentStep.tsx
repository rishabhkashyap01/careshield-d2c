'use client';

import { useActionState, useRef } from 'react';
import { payPremium } from '@/app/actions';
import { useSubmit } from '@/hooks/useSubmit';
import { formatMoney } from '@/lib/format';
import type { PaymentState } from '@/lib/types';
import { ArrowLeftIcon, CardIcon, LockIcon, PhoneIcon } from '../icons';
import { Alert, Button } from '../ui';
import { CancelQuote } from './CancelQuote';
import { useFlow } from './FlowProvider';

const METHODS = [
  {
    token: 'tok_visa_4242',
    label: 'Visa ending 4242',
    sub: 'Expires 12/29',
    Icon: CardIcon,
  },
  {
    token: 'tok_mastercard_4444',
    label: 'Mastercard ending 4444',
    sub: 'Expires 08/28',
    Icon: CardIcon,
  },
  {
    token: 'tok_upi_success',
    label: 'UPI · demo@okbank',
    sub: 'Pay from any UPI app',
    Icon: PhoneIcon,
  },
  {
    token: 'tok_card_declined',
    label: 'Test card that is always declined',
    sub: 'Try the decline path',
    Icon: CardIcon,
  },
] as const;

/**
 * Step 3 (Task 3.3). Double-charge protection in three layers:
 *  1. `pending` from useActionState disables the button and the options.
 *  2. A synchronous ref guard drops a second submit fired before React has
 *     re-rendered (e.g. a very fast double-click or Enter key repeat).
 *  3. An Idempotency-Key per (quote, payment method), reused on every retry of
 *     that same request, so a duplicate that reaches the server is charged
 *     once (enforced by the API). Switching method is a different request and
 *     gets its own key; the API's row lock on the quote still guarantees at
 *     most one successful payment per quote.
 */
export function PaymentStep() {
  const { quote, expired, onPaid, markExpired, editDetails } = useFlow();
  const q = quote!;
  const keys = useRef(new Map<string, string>());
  const keyFor = (token: string) => {
    let key = keys.current.get(token);
    if (!key) keys.current.set(token, (key = crypto.randomUUID()));
    return key;
  };
  const inFlight = useRef(false);

  const [state, action, pending] = useActionState<PaymentState, FormData>(
    async (prev, fd) => {
      try {
        const token = String(fd.get('paymentToken') ?? '');
        const result = await payPremium(q.quoteId, keyFor(token), prev, fd);
        if (result.status === 'success') onPaid(result.policy);
        if (result.status === 'error' && result.expired) markExpired();
        return result;
      } finally {
        inFlight.current = false;
      }
    },
    { status: 'idle' },
  );

  const blocked = pending || expired;
  // Synchronous guard: runs before React re-renders, so it catches a second
  // click/Enter that arrives while `pending` is still false.
  const onSubmit = useSubmit(action, () => {
    if (inFlight.current || expired) return false;
    inFlight.current = true;
    return true;
  });

  const lines: [string, string][] = [['Base premium', q.premium.base]];
  if (q.premium.ageLoading !== '0.00') lines.push(['Age loading (over 45)', q.premium.ageLoading]);
  if (q.premium.conditionLoading !== '0.00')
    lines.push(['Pre-existing condition loading', q.premium.conditionLoading]);

  return (
    <form onSubmit={onSubmit} aria-busy={pending} className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-6 overflow-y-auto px-6 pb-6 pt-2">
        <div>
          <h2 tabIndex={-1} className="text-2xl font-semibold tracking-tight text-ink outline-none">
            Pay &amp; get covered
          </h2>
          <p className="mt-1 text-slate-500">
            Demo checkout — choose a mock payment method. No real money is taken.
          </p>
        </div>

        <section
          aria-labelledby="summary-heading"
          className="rounded-2xl border border-slate-200 p-4"
        >
          <h3 id="summary-heading" className="text-sm font-semibold text-ink">
            Order summary
          </h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Plan</dt>
              <dd className="font-medium text-ink">CareShield Max · 12 months</dd>
            </div>
            {lines.map(([label, amount]) => (
              <div key={label} className="flex justify-between gap-4">
                <dt className="text-slate-500">{label}</dt>
                <dd className="font-medium tabular text-ink">{formatMoney(amount)}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-4 border-t border-dashed border-slate-200 pt-2 text-base">
              <dt className="font-semibold text-ink">Total</dt>
              <dd className="font-semibold tabular text-ink">{formatMoney(q.premium.total)}</dd>
            </div>
          </dl>
        </section>

        <fieldset disabled={blocked} className="space-y-2.5">
          <legend className="mb-3 text-sm font-semibold text-ink">Payment method</legend>
          {METHODS.map(({ token, label, sub, Icon }, i) => (
            <label
              key={token}
              className="group flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 transition hover:border-brand-300 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50/60 has-[:checked]:ring-4 has-[:checked]:ring-brand-100 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand-200 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
            >
              <input
                type="radio"
                name="paymentToken"
                value={token}
                defaultChecked={i === 0}
                className="sr-only"
              />
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600 transition group-has-[:checked]:bg-brand-600 group-has-[:checked]:text-white">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-ink">{label}</span>
                <span className="block text-xs text-slate-500">{sub}</span>
              </span>
              <span
                aria-hidden="true"
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 border-slate-300 transition group-has-[:checked]:border-brand-600 group-has-[:checked]:bg-brand-600 group-has-[:checked]:shadow-[inset_0_0_0_3px_white]"
              />
            </label>
          ))}
        </fieldset>
      </div>

      <div className="relative space-y-2 border-t border-slate-100 bg-white/90 px-6 py-4 backdrop-blur">
        {state.status === 'error' && !state.expired && !expired && (
          <Alert
            tone="error"
            title="Payment not completed"
            className="max-h-[38dvh] animate-fade-up overflow-y-auto [animation-duration:250ms]"
          >
            {state.message}
          </Alert>
        )}

        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" onClick={editDetails} disabled={pending}>
            <ArrowLeftIcon className="h-4 w-4" /> Change details
          </Button>
          <CancelQuote disabled={pending} />
        </div>
        <Button
          type="submit"
          size="lg"
          disabled={blocked}
          pending={pending}
          pendingLabel="Processing payment…"
          className="w-full"
          data-testid="pay-button"
        >
          <LockIcon className="h-4 w-4" /> Pay {formatMoney(q.premium.total)}
        </Button>
        <p className="text-center text-xs text-slate-500">
          Protected against double charges · you’ll only ever be charged once
        </p>
        <p className="sr-only" role="status" aria-live="polite">
          {pending ? 'Processing your payment. Please don’t close this window.' : ''}
        </p>
      </div>
    </form>
  );
}
