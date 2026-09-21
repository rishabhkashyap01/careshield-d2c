'use client';

import type { QuoteFormState } from '@/lib/types';
import { Alert, Button, FieldError, YesNo } from './ui';

export function QuoteForm({
  state,
  action,
  pending,
}: {
  state: QuoteFormState;
  action: (fd: FormData) => void;
  pending: boolean;
}) {
  const errors = state.status === 'error' ? state.fieldErrors ?? {} : {};
  return (
    <form action={action} noValidate aria-busy={pending} className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Get your price</h2>
        <p className="mt-1 text-slate-600">
          Two questions. Your premium is locked for 15 minutes once calculated.
        </p>
      </div>

      {state.status === 'error' && state.message && (
        <Alert tone="error" title="We couldn’t calculate your premium">
          {state.message}
        </Alert>
      )}

      <div>
        <label htmlFor="age" className="block text-base font-medium text-slate-900">
          Age
        </label>
        <p id="age-hint" className="mt-0.5 text-sm text-slate-600">
          In whole years. Cover is available from 18 to 99.
        </p>
        <input
          id="age"
          name="age"
          type="number"
          inputMode="numeric"
          min={18}
          max={99}
          step={1}
          required
          autoComplete="off"
          defaultValue={state.values.age}
          aria-invalid={errors.age ? true : undefined}
          aria-describedby={`age-hint${errors.age ? ' age-error' : ''}`}
          disabled={pending}
          className="mt-2 block w-32 rounded-lg border border-slate-300 px-3 py-2.5 text-lg text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-4 focus:ring-indigo-200 aria-[invalid=true]:border-red-600"
        />
        <FieldError id="age-error">{errors.age}</FieldError>
      </div>

      <YesNo
        name="hasPreExistingConditions"
        legend="Do you have any pre-existing medical conditions?"
        hint="For example diabetes, high blood pressure or a heart condition."
        defaultValue={state.values.hasPreExistingConditions}
        error={errors.hasPreExistingConditions}
        disabled={pending}
      />

      <Button type="submit" pending={pending} pendingLabel="Calculating…">
        Calculate premium
      </Button>
    </form>
  );
}
