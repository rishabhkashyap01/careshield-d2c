'use client';

import { useRef } from 'react';
import { useRevealInvalid } from '@/hooks/useRevealInvalid';
import { useSubmit } from '@/hooks/useSubmit';
import { ArrowRightIcon, HeartPulseIcon, ShieldIcon } from '../icons';
import { Alert, Button, FieldError } from '../ui';
import { useFlow } from './FlowProvider';

const MIN = 18;
const MAX = 99;

/** Step 1 — age + pre-existing conditions → a locked quote. */
export function DetailsStep() {
  const {
    quoteState,
    detailsValues,
    quoteAction,
    quotePending: pending,
    quote,
    backToQuote,
  } = useFlow();
  // After a discard, show a blank form and hide the stale errors.
  const state =
    detailsValues === quoteState.values
      ? quoteState
      : { status: 'idle' as const, values: detailsValues };
  const onSubmit = useSubmit(quoteAction);
  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};
  const ageRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useRevealInvalid(formRef, state, Object.keys(errors).length > 0);

  const bump = (delta: number) => {
    const el = ageRef.current;
    if (!el) return;
    const current = Number(el.value) || 30;
    el.value = String(Math.min(MAX, Math.max(MIN, current + delta)));
    el.focus();
  };

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      aria-busy={pending}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex-1 space-y-7 overflow-y-auto px-6 pb-6 pt-2">
        <div>
          <h2 tabIndex={-1} className="text-2xl font-semibold tracking-tight text-ink outline-none">
            Let’s find your price
          </h2>
          <p className="mt-1 text-slate-500">
            Two quick questions. Your price is locked for 15 minutes once calculated.
          </p>
        </div>

        {quote && (
          <Alert tone="info" title="Changing your details" role="status">
            You’ll get a fresh price and a new 15-minute lock, and you’ll answer the health
            questions again. Your current quote stays available until you submit.
          </Alert>
        )}

        <div>
          <label htmlFor="age" className="block text-sm font-semibold text-ink">
            Age
          </label>
          <p id="age-hint" className="mt-0.5 text-sm text-slate-500">
            In whole years — cover is available from {MIN} to {MAX}.
          </p>
          <div
            className={`mt-3 flex items-center gap-2 rounded-2xl border bg-slate-50/60 p-2 transition focus-within:border-brand-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-brand-100 ${
              errors.age ? 'border-rose-300 ring-4 ring-rose-100' : 'border-slate-200'
            }`}
          >
            <button
              type="button"
              onClick={() => bump(-1)}
              disabled={pending}
              aria-label="Decrease age"
              className="grid h-12 w-12 place-items-center rounded-xl bg-white text-2xl font-medium text-slate-600 shadow-soft transition hover:text-brand-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
            >
              −
            </button>
            <input
              ref={ageRef}
              id="age"
              name="age"
              type="number"
              inputMode="numeric"
              min={MIN}
              max={MAX}
              step={1}
              required
              autoComplete="off"
              placeholder="e.g. 32"
              defaultValue={state.values.age}
              aria-invalid={errors.age ? true : undefined}
              aria-describedby={`age-hint${errors.age ? ' age-error' : ''}`}
              disabled={pending}
              className="h-12 min-w-0 flex-1 bg-transparent text-center text-3xl font-semibold tracking-tight text-ink tabular outline-none placeholder:text-slate-300 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <button
              type="button"
              onClick={() => bump(1)}
              disabled={pending}
              aria-label="Increase age"
              className="grid h-12 w-12 place-items-center rounded-xl bg-white text-2xl font-medium text-slate-600 shadow-soft transition hover:text-brand-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
            >
              +
            </button>
          </div>
          <FieldError id="age-error">{errors.age}</FieldError>
        </div>

        <fieldset
          aria-describedby={errors.hasPreExistingConditions ? 'pec-error' : 'pec-hint'}
          aria-invalid={errors.hasPreExistingConditions ? true : undefined}
          disabled={pending}
        >
          <legend className="text-sm font-semibold text-ink">
            Do you have any pre-existing medical conditions?
          </legend>
          <p id="pec-hint" className="mt-0.5 text-sm text-slate-500">
            For example diabetes, high blood pressure or a heart condition.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(
              [
                {
                  value: 'no',
                  title: 'No',
                  body: 'I’m not being treated for any ongoing condition',
                  Icon: ShieldIcon,
                },
                {
                  value: 'yes',
                  title: 'Yes',
                  body: 'I have one or more pre-existing conditions',
                  Icon: HeartPulseIcon,
                },
              ] as const
            ).map(({ value, title, body, Icon }) => (
              <label
                key={value}
                className="group relative flex cursor-pointer gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-brand-300 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50/60 has-[:checked]:ring-4 has-[:checked]:ring-brand-100 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand-200"
              >
                <input
                  type="radio"
                  name="hasPreExistingConditions"
                  value={value}
                  defaultChecked={state.values.hasPreExistingConditions === value}
                  required
                  className="peer sr-only"
                />
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500 transition group-has-[:checked]:bg-brand-600 group-has-[:checked]:text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-ink">{title}</span>
                  <span className="mt-0.5 block text-sm leading-snug text-slate-500">{body}</span>
                </span>
              </label>
            ))}
          </div>
          <FieldError id="pec-error">{errors.hasPreExistingConditions}</FieldError>
        </fieldset>

        <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-semibold text-ink">How your price is worked out</p>
          <ul className="mt-2 grid gap-1.5">
            <li className="flex justify-between gap-4">
              <span>Base premium</span>
              <span className="font-medium tabular text-ink">₹10,000</span>
            </li>
            <li className="flex justify-between gap-4">
              <span>Age over 45</span>
              <span className="font-medium tabular text-ink">+50% of base</span>
            </li>
            <li className="flex justify-between gap-4">
              <span>Pre-existing condition</span>
              <span className="font-medium tabular text-ink">+₹5,000</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="space-y-3 border-t border-slate-100 bg-white/90 px-6 py-4 backdrop-blur">
        {state.status === 'error' && state.message && (
          <Alert
            tone="error"
            title="We couldn’t calculate your premium"
            className="max-h-[38dvh] animate-fade-up overflow-y-auto [animation-duration:250ms]"
          >
            {state.message}
          </Alert>
        )}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          {quote && (
            <Button type="button" variant="secondary" onClick={backToQuote} disabled={pending}>
              Back to my quote
            </Button>
          )}
          <Button
            type="submit"
            size="lg"
            pending={pending}
            pendingLabel="Calculating…"
            className="sm:min-w-52"
          >
            See my price <ArrowRightIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </form>
  );
}
