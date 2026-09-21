'use client';

import {
  createContext,
  useActionState,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import { requestQuote } from '@/app/actions';
import { useCountdown } from '@/hooks/useCountdown';
import type { IssuedPolicy, Quote, QuoteFormState, QuoteInputs } from '@/lib/types';

export type FlowView = 'details' | 'health' | 'payment' | 'done';

interface Active {
  quote: Quote;
  /** Client clock when the quote arrived — used to correct device clock skew. */
  receivedAt: number;
}

interface FlowContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;

  view: FlowView;
  quote: Quote | null;
  policy: IssuedPolicy | null;

  quoteState: QuoteFormState;
  /** What the details form should show (blank after a quote is discarded). */
  detailsValues: QuoteInputs;
  quoteAction: (fd: FormData) => void;
  /**
   * Submit the details form. Unchanged details on a live quote just return to
   * it (same quote, same price lock); only changed details request a new quote.
   */
  submitDetails: (fd: FormData) => void;
  quotePending: boolean;
  editDetails: () => void;
  backToQuote: () => void;
  isEditing: boolean;

  remainingMs: number;
  expired: boolean;
  markExpired: () => void;
  recalculate: (overrides?: Partial<QuoteInputs>) => void;
  recalculating: boolean;

  onDeclared: (q: Quote) => void;
  onPaid: (p: IssuedPolicy) => void;
  startOver: () => void;
  /** Discard the current quote and close the dialog. */
  cancelQuote: () => void;
}

const FlowContext = createContext<FlowContextValue | null>(null);

export function useFlow(): FlowContextValue {
  const ctx = useContext(FlowContext);
  if (!ctx) throw new Error('useFlow must be used inside <FlowProvider>');
  return ctx;
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

/**
 * Owns the whole purchase journey so the landing page CTAs, the dialog and the
 * "resume" pill all share one quote, one countdown and one policy.
 */
export function FlowProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [active, setActive] = useState<Active | null>(null);
  const [policy, setPolicy] = useState<IssuedPolicy | null>(null);
  const [isEditing, setEditing] = useState(false);
  const [serverExpiredFor, setServerExpiredFor] = useState<string | null>(null);
  const [discarded, setDiscarded] = useState(false);

  // Step 1 — useActionState drives the quote form's pending + error state.
  const [quoteState, quoteAction, quotePending] = useActionState<QuoteFormState, FormData>(
    async (prev, fd) => {
      const result = await requestQuote(prev, fd);
      setDiscarded(false);
      if (result.status === 'success') {
        setActive({ quote: result.quote, receivedAt: Date.now() });
        setPolicy(null);
        setEditing(false);
      }
      return result;
    },
    INITIAL,
  );

  const lock = useMemo(
    () =>
      active && !policy
        ? {
            expiresAt: active.quote.expiresAt,
            serverTime: active.quote.serverTime,
            receivedAt: active.receivedAt,
          }
        : null,
    [active, policy],
  );
  const { remainingMs, expired: timerExpired } = useCountdown(lock);
  const quote = active?.quote ?? null;
  // The server can also tell us it expired (e.g. device clock very wrong).
  const expired =
    !!quote && !policy && (timerExpired || quote.isExpired || serverExpiredFor === quote.quoteId);

  // Recalculate (after expiry) re-submits the same inputs in a transition.
  const [recalculating, startRecalc] = useTransition();
  const recalculate = useCallback(
    (overrides: Partial<QuoteInputs> = {}) =>
      startRecalc(() => quoteAction(toFormData({ ...quoteState.values, ...overrides }))),
    [quoteAction, quoteState.values],
  );

  const submitDetails = (fd: FormData) => {
    const age = String(fd.get('age') ?? '').trim();
    const pec = fd.get('hasPreExistingConditions');
    const unchanged =
      !!quote &&
      !policy &&
      !expired &&
      /^\d{1,3}$/.test(age) &&
      Number(age) === quote.applicant.age &&
      (pec === 'yes' || pec === 'no') &&
      (pec === 'yes') === quote.applicant.hasPreExistingConditions;
    if (unchanged) {
      setEditing(false); // same inputs → same deterministic price: keep the lock running
      return;
    }
    quoteAction(fd);
  };

  const view: FlowView = policy
    ? 'done'
    : !quote || isEditing
      ? 'details'
      : quote.status === 'QUOTE_GENERATED'
        ? 'health'
        : 'payment';

  const value: FlowContextValue = {
    isOpen,
    open: () => setOpen(true),
    close: () => setOpen(false),
    view,
    quote,
    policy,
    quoteState,
    detailsValues: discarded ? INITIAL.values : quoteState.values,
    quoteAction,
    submitDetails,
    quotePending,
    isEditing,
    editDetails: () => setEditing(true),
    backToQuote: () => setEditing(false),
    remainingMs,
    expired,
    markExpired: () => quote && setServerExpiredFor(quote.quoteId),
    recalculate,
    recalculating,
    onDeclared: (q) => setActive((a) => (a ? { ...a, quote: q } : a)),
    onPaid: setPolicy,
    startOver: () => {
      setActive(null);
      setPolicy(null);
      setEditing(false);
    },
    cancelQuote: () => {
      setDiscarded(true);
      setActive(null);
      setPolicy(null);
      setEditing(false);
      setOpen(false);
    },
  };

  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
}
