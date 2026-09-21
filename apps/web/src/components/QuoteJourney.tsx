'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { requestQuote } from '@/app/actions';
import { useCountdown } from '@/hooks/useCountdown';
import type { IssuedPolicy, Quote, QuoteFormState, QuoteInputs } from '@/lib/types';
import { Countdown } from './Countdown';
import { DeclarationForm } from './DeclarationForm';
import { ExpiredNotice } from './ExpiredNotice';
import { PaymentForm } from './PaymentForm';
import { PolicyIssued } from './PolicyIssued';
import { QuoteForm } from './QuoteForm';
import { QuoteSummary } from './QuoteSummary';
import { Stepper } from './Stepper';
import { Button } from './ui';

interface Active {
  quote: Quote;
  /** Client clock when the quote arrived — used to correct device clock skew. */
  receivedAt: number;
}

const INITIAL: QuoteFormState = {
  status: 'idle',
  values: { age: '', hasPreExistingConditions: '' },
};

function toFormData(values: QuoteInputs): FormData {
  const fd = new FormData();
  fd.set('age', values.age);
  fd.set('hasPreExistingConditions', values.hasPreExistingConditions);
  return fd;
}

export function QuoteJourney() {
  const [active, setActive] = useState<Active | null>(null);
  const [policy, setPolicy] = useState<IssuedPolicy | null>(null);
  const [editing, setEditing] = useState(false);

  // Step 1 — useActionState drives the quote form's pending + error state.
  const [quoteState, quoteAction, quotePending] = useActionState<QuoteFormState, FormData>(
    async (prev, fd) => {
      const result = await requestQuote(prev, fd);
      if (result.status === 'success') {
        setActive({ quote: result.quote, receivedAt: Date.now() });
        setPolicy(null);
        setEditing(false);
      }
      return result;
    },
    INITIAL,
  );

  // Recalculate (after expiry) re-submits the same inputs in a transition.
  const [recalculating, startRecalc] = useTransition();
  const recalculate = (overrides: Partial<QuoteInputs> = {}) =>
    startRecalc(() => quoteAction(toFormData({ ...quoteState.values, ...overrides })));

  const showForm = !active || editing;
  const step: 0 | 1 | 2 | 3 = policy
    ? 3
    : showForm
      ? 0
      : active!.quote.status === 'QUOTE_GENERATED'
        ? 1
        : 2;

  // Move focus to the new step's heading for keyboard & screen-reader users.
  const main = useRef<HTMLDivElement>(null);
  useEffect(() => {
    main.current?.querySelector<HTMLElement>('h2')?.focus();
  }, [step, active?.quote.quoteId]);

  return (
    <div className="space-y-8">
      <Stepper current={step} />
      <div ref={main} className="[&_h2]:outline-none">
        {showForm ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <QuoteForm state={quoteState} action={quoteAction} pending={quotePending} />
            {active && (
              <Button variant="secondary" className="mt-4" onClick={() => setEditing(false)}>
                Back to my current quote
              </Button>
            )}
          </div>
        ) : policy ? (
          <PolicyIssued policy={policy} />
        ) : (
          <ActiveQuote
            key={active!.quote.quoteId}
            active={active!}
            recalculating={recalculating}
            onRecalculate={recalculate}
            onEdit={() => setEditing(true)}
            onUpdate={(quote) => setActive((a) => (a ? { ...a, quote } : a))}
            onPaid={setPolicy}
          />
        )}
      </div>
    </div>
  );
}

function ActiveQuote({
  active,
  recalculating,
  onRecalculate,
  onEdit,
  onUpdate,
  onPaid,
}: {
  active: Active;
  recalculating: boolean;
  onRecalculate: (o?: Partial<QuoteInputs>) => void;
  onEdit: () => void;
  onUpdate: (q: Quote) => void;
  onPaid: (p: IssuedPolicy) => void;
}) {
  const { quote } = active;
  const { remainingMs, expired: timerExpired } = useCountdown(
    quote.expiresAt,
    quote.serverTime,
    active.receivedAt,
  );
  // The server can also tell us it expired (e.g. device clock very wrong).
  const [serverExpired, setServerExpired] = useState(quote.isExpired);
  const expired = timerExpired || serverExpired;
  const onExpired = () => setServerExpired(true);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="order-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:order-1">
        {expired && (
          <div className="mb-6">
            <ExpiredNotice onRecalculate={() => onRecalculate()} pending={recalculating} />
          </div>
        )}
        {quote.status === 'QUOTE_GENERATED' ? (
          <DeclarationForm
            quote={quote}
            expired={expired}
            onDeclared={onUpdate}
            onExpired={onExpired}
            onRecalculate={() => onRecalculate({ hasPreExistingConditions: 'yes' })}
          />
        ) : (
          <PaymentForm quote={quote} expired={expired} onPaid={onPaid} onExpired={onExpired} />
        )}
      </div>

      <aside className="order-1 space-y-4 lg:order-2" aria-label="Your quote">
        <QuoteSummary quote={quote} />
        {!expired && <Countdown remainingMs={remainingMs} totalSeconds={quote.lockDurationSeconds} />}
        <button
          type="button"
          onClick={onEdit}
          className="text-sm font-medium text-indigo-700 underline underline-offset-4 hover:text-indigo-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200"
        >
          Change my details
        </button>
      </aside>
    </div>
  );
}
