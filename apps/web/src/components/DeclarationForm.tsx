'use client';

import { useActionState } from 'react';
import { submitDeclaration } from '@/app/actions';
import { useSubmit } from '@/hooks/useSubmit';
import type { DeclarationState, Quote } from '@/lib/types';
import { Alert, Button, FieldError, YesNo } from './ui';

const QUESTIONS = [
  ['hasDiabetes', 'Have you been diagnosed with diabetes?'],
  ['hasHypertension', 'Have you been diagnosed with high blood pressure?'],
  ['hasHeartDisease', 'Have you been diagnosed with a heart condition?'],
  ['isSmoker', 'Have you smoked or used tobacco in the last 12 months?'],
  ['hadMajorSurgeryLast5Years', 'Have you had major surgery in the last 5 years?'],
  ['hasTerminalIllness', 'Have you been diagnosed with a terminal illness?'],
] as const;

export function DeclarationForm({
  quote,
  expired,
  onDeclared,
  onExpired,
  onRecalculate,
}: {
  quote: Quote;
  expired: boolean;
  onDeclared: (q: Quote) => void;
  onExpired: () => void;
  onRecalculate: () => void;
}) {
  const [state, action, pending] = useActionState<DeclarationState, FormData>(
    async (prev, fd) => {
      const result = await submitDeclaration(quote.quoteId, prev, fd);
      if (result.status === 'success') onDeclared(result.quote);
      if (result.status === 'error' && result.expired) onExpired();
      return result;
    },
    { status: 'idle' },
  );
  const errors = state.status === 'error' ? state.fieldErrors ?? {} : {};
  const locked = pending || expired;
  const onSubmit = useSubmit(action, () => !locked);

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={pending} className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Medical declaration</h2>
        <p className="mt-1 text-slate-600">
          Answer honestly — an inaccurate declaration can make your policy invalid.
        </p>
      </div>

      {state.status === 'error' && !state.expired && !expired && (
        <Alert tone="error" title={state.message}>
          {state.reasons && (
            <ul className="list-disc space-y-1 pl-5">
              {state.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          {state.recalculate && (
            <Button type="button" variant="secondary" className="mt-3" onClick={onRecalculate}>
              Recalculate with pre-existing conditions
            </Button>
          )}
        </Alert>
      )}

      <div className="space-y-5">
        {QUESTIONS.map(([name, legend]) => (
          <YesNo key={name} name={name} legend={legend} error={errors[name]} disabled={locked} />
        ))}
      </div>

      <div>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="confirmsAccuracy"
            required
            disabled={locked}
            aria-invalid={errors.confirmsAccuracy ? true : undefined}
            aria-describedby={errors.confirmsAccuracy ? 'confirmsAccuracy-error' : undefined}
            className="mt-1 h-5 w-5 accent-indigo-700"
          />
          <span className="text-slate-900">
            I confirm my answers are true and complete to the best of my knowledge.
          </span>
        </label>
        <FieldError id="confirmsAccuracy-error">{errors.confirmsAccuracy}</FieldError>
      </div>

      <Button type="submit" disabled={locked} pending={pending} pendingLabel="Checking eligibility…">
        Continue to payment
      </Button>
    </form>
  );
}
