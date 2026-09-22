'use client';

import { useEffect, useRef, useState } from 'react';
import { formatMoney } from '@/lib/format';
import { CountdownRing } from './CountdownRing';
import { useFlow } from './FlowProvider';

/** Animates a number from its previous value to the new one (display only). */
function useCountUp(target: number, ms = 700) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const origin = from.current;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || origin === target) {
      from.current = target;
      const id = requestAnimationFrame(() => setValue(target));
      return () => cancelAnimationFrame(id);
    }
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(origin + (target - origin) * eased);
      if (t < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

/** The dark strip under the dialog header: live premium + price-lock countdown. */
export function PriceBar() {
  const { quote, remainingMs, expired, paymentPending } = useFlow();
  const shown = useCountUp(quote ? Number(quote.premium.total) : 0);
  if (!quote) return null;

  return (
    <div className="relative shrink-0 overflow-hidden bg-gradient-to-r from-brand-950 via-brand-900 to-brand-800 px-6 py-4 text-white">
      <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-brand-500/40 blur-3xl" />
      <div className="relative flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
            Annual premium
          </p>
          <p className="text-2xl font-semibold tracking-tight tabular sm:text-3xl">
            <span className="sr-only" data-testid="total-premium">
              {formatMoney(quote.premium.total)}
            </span>
            <span aria-hidden="true">{formatMoney(shown.toFixed(2))}</span>
          </p>
          <p className="mt-0.5 truncate text-xs text-white/60">
            Age {quote.applicant.age} · {quote.applicant.hasPreExistingConditions ? 'with' : 'no'}{' '}
            pre-existing conditions
          </p>
        </div>
        {paymentPending ? (
          // The server froze the lock for this payment; a ticking clock would mislead.
          <p className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/90">
            Price secured · confirming payment
          </p>
        ) : (
          <CountdownRing
            remainingMs={expired ? 0 : remainingMs}
            totalSeconds={quote.lockDurationSeconds}
          />
        )}
      </div>
    </div>
  );
}
