'use client';

import { formatClock } from '@/lib/format';
import { ArrowRightIcon, ClockIcon, ShieldIcon } from '../icons';
import { useFlow } from './FlowProvider';

/** Floating reminder when the dialog is closed with a journey in progress. */
export function ResumePill() {
  const { isOpen, quote, policy, remainingMs, expired, open } = useFlow();
  if (isOpen || !quote) return null;

  const text = policy
    ? `Policy ${policy.policyNumber} is active`
    : expired
      ? 'Your price lock expired'
      : `Price locked · ${formatClock(remainingMs)} left`;
  const cta = policy ? 'View' : expired ? 'Get a new price' : 'Resume';

  return (
    <div className="fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
      <button
        type="button"
        onClick={open}
        className="group flex animate-fade-up items-center gap-3 rounded-full bg-ink/95 py-2 pl-2 pr-4 text-sm text-white shadow-lift ring-1 ring-white/10 backdrop-blur transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-300"
      >
        <span
          className={`grid h-8 w-8 place-items-center rounded-full ${policy ? 'bg-mint-500' : expired ? 'bg-rose-500' : 'bg-brand-600'}`}
        >
          {policy ? <ShieldIcon className="h-4 w-4" /> : <ClockIcon className="h-4 w-4" />}
        </span>
        <span className="tabular">{text}</span>
        <span className="flex items-center gap-1 font-semibold text-brand-300 group-hover:text-white">
          {cta} <ArrowRightIcon className="h-4 w-4" />
        </span>
      </button>
    </div>
  );
}
