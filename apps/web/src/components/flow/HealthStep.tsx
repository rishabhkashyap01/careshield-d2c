'use client';

import { useActionState, useRef } from 'react';
import { submitDeclaration } from '@/app/actions';
import { useRevealInvalid } from '@/hooks/useRevealInvalid';
import { useSubmit } from '@/hooks/useSubmit';
import type { DeclarationState } from '@/lib/types';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  DocIcon,
  HeartPulseIcon,
  SparkleIcon,
  UserIcon,
  AlertIcon,
} from '../icons';
import { Alert, Button, FieldError, YesNo } from '../ui';
import { CancelQuote } from './CancelQuote';
import { useFlow } from './FlowProvider';

const QUESTIONS = [
  ['hasDiabetes', 'Have you been diagnosed with diabetes?', HeartPulseIcon],
  ['hasHypertension', 'Have you been diagnosed with high blood pressure?', HeartPulseIcon],
  ['hasHeartDisease', 'Have you been diagnosed with a heart condition?', HeartPulseIcon],
  ['isSmoker', 'Have you smoked or used tobacco in the last 12 months?', SparkleIcon],
  ['hadMajorSurgeryLast5Years', 'Have you had major surgery in the last 5 years?', DocIcon],
  ['hasTerminalIllness', 'Have you been diagnosed with a terminal illness?', AlertIcon],
] as const;

/** Step 2 — medical declaration. */
export function HealthStep() {
  const { quote, expired, onDeclared, markExpired, recalculate, recalculating, editDetails } =
    useFlow();
  const [state, action, pending] = useActionState<DeclarationState, FormData>(
    async (prev, fd) => {
      const result = await submitDeclaration(quote!.quoteId, prev, fd);
      if (result.status === 'success') onDeclared(result.quote);
      if (result.status === 'error' && result.expired) markExpired();
      return result;
    },
    { status: 'idle' },
  );
  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};
  const locked = pending || expired;
  const onSubmit = useSubmit(action, () => !locked);
  const formRef = useRef<HTMLFormElement>(null);
  useRevealInvalid(formRef, state, Object.keys(errors).length > 0);

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      aria-busy={pending}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex-1 space-y-6 overflow-y-auto px-6 pb-6 pt-2">
        <div>
          <h2 tabIndex={-1} className="text-2xl font-semibold tracking-tight text-ink outline-none">
            A few health questions
          </h2>
          <p className="mt-1 text-slate-500">
            Answer honestly — an inaccurate declaration can make your policy invalid.
          </p>
        </div>

        <div className="space-y-2.5">
          {QUESTIONS.map(([name, legend, Icon]) => (
            <YesNo
              key={name}
              name={name}
              legend={legend}
              icon={<Icon className="h-[18px] w-[18px]" />}
              error={errors[name]}
              disabled={locked}
            />
          ))}
        </div>

        <div>
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50/60 has-[:disabled]:cursor-not-allowed ${
              errors.confirmsAccuracy ? 'border-rose-300 ring-4 ring-rose-100' : 'border-slate-200'
            }`}
          >
            <input
              type="checkbox"
              name="confirmsAccuracy"
              required
              disabled={locked}
              aria-invalid={errors.confirmsAccuracy ? true : undefined}
              aria-describedby={errors.confirmsAccuracy ? 'confirmsAccuracy-error' : undefined}
              className="mt-0.5 h-5 w-5 shrink-0 rounded accent-brand-600"
            />
            <span className="text-[15px] text-ink">
              I confirm my answers are true and complete to the best of my knowledge.
            </span>
          </label>
          <FieldError id="confirmsAccuracy-error">{errors.confirmsAccuracy}</FieldError>
        </div>

        <p className="flex items-center gap-2 text-xs text-slate-500">
          <UserIcon className="h-4 w-4 shrink-0" /> Your answers are only used to confirm
          eligibility.
        </p>
      </div>

      <div className="relative space-y-3 border-t border-slate-100 bg-white/90 px-6 py-4 backdrop-blur">
        {state.status === 'error' && !state.expired && !expired && (
          <Alert
            tone="error"
            title={state.message}
            className="max-h-[38dvh] animate-fade-up overflow-y-auto [animation-duration:250ms]"
          >
            {state.reasons && (
              <ul className="list-disc space-y-1 pl-5">
                {state.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            {state.recalculate && (
              <Button
                type="button"
                variant="secondary"
                className="mt-3 w-full sm:w-auto"
                onClick={() => recalculate({ hasPreExistingConditions: 'yes' })}
                pending={recalculating}
                pendingLabel="Recalculating…"
              >
                Recalculate with pre-existing conditions
              </Button>
            )}
          </Alert>
        )}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center justify-between gap-2 sm:justify-start">
            <Button type="button" variant="ghost" onClick={editDetails} disabled={pending}>
              <ArrowLeftIcon className="h-4 w-4" /> Back
            </Button>
            <CancelQuote disabled={pending} />
          </div>
          <div className="hidden flex-1 sm:block" />
          <Button
            type="submit"
            size="lg"
            disabled={locked}
            pending={pending}
            pendingLabel="Checking eligibility…"
            className="w-full sm:w-auto sm:min-w-56"
          >
            Continue to payment <ArrowRightIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </form>
  );
}
