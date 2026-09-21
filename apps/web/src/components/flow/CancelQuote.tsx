'use client';

import { useEffect, useRef, useState } from 'react';
import { formatMoney } from '@/lib/format';
import { Button } from '../ui';
import { useFlow } from './FlowProvider';

/**
 * "Cancel quote" with an inline confirmation that covers the step footer.
 * The footer it sits in must be `relative`. Nothing is sent to the API: an
 * abandoned quote simply expires server-side after its 15-minute lock and can
 * never be paid, so discarding it is purely a client-side reset.
 */
export function CancelQuote({ disabled = false }: { disabled?: boolean }) {
  const { quote, cancelQuote } = useFlow();
  const [confirming, setConfirming] = useState(false);
  const keepRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Move focus into the confirmation, and back to the trigger when it closes.
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (confirming) keepRef.current?.focus();
    else if (wasConfirming.current) triggerRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  if (!quote) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setConfirming(true)}
        disabled={disabled}
        className="rounded-lg px-2 py-2 text-sm font-semibold text-slate-500 transition hover:text-rose-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Cancel quote
      </button>

      {confirming && (
        <div
          role="alertdialog"
          aria-labelledby="cancel-title"
          aria-describedby="cancel-desc"
          className="absolute inset-0 z-10 flex animate-fade-up flex-col justify-center gap-3 bg-white px-6 py-4 [animation-duration:200ms] sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p id="cancel-title" className="font-semibold text-ink">
              Discard this quote?
            </p>
            <p id="cancel-desc" className="text-sm text-slate-500">
              Your locked price of {formatMoney(quote.premium.total)} will be lost.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              ref={keepRef}
              type="button"
              variant="secondary"
              onClick={() => setConfirming(false)}
            >
              Keep quote
            </Button>
            <Button type="button" variant="danger" onClick={cancelQuote}>
              Yes, discard
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
