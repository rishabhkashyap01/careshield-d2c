'use client';

import { formatMoney } from '@/lib/format';
import { CheckIcon } from '../icons';
import { Button } from '../ui';
import { useFlow } from './FlowProvider';
import { PolicyCard } from './PolicyCard';

const CONFETTI = Array.from({ length: 18 }, (_, i) => {
  const angle = (i / 18) * Math.PI * 2;
  const dist = 90 + (i % 3) * 30;
  return {
    dx: `${Math.cos(angle) * dist}px`,
    dy: `${Math.sin(angle) * dist}px`,
    rot: `${(i * 57) % 360}deg`,
    color: ['#7047ff', '#34e0a1', '#ffb547', '#ff6b9a'][i % 4],
    delay: `${(i % 6) * 30}ms`,
  };
});

export function DoneStep() {
  const { policy, close, startOver } = useFlow();
  if (!policy) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto px-6 pb-6 pt-4">
        <div className="relative mx-auto grid h-20 w-20 place-items-center">
          {CONFETTI.map((c, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="absolute h-2 w-2 rounded-sm"
              style={
                {
                  background: c.color,
                  '--dx': c.dx,
                  '--dy': c.dy,
                  '--rot': c.rot,
                  animation: `confetti 900ms cubic-bezier(0.2,0.8,0.3,1) ${c.delay} both`,
                } as React.CSSProperties
              }
            />
          ))}
          <span className="grid h-20 w-20 animate-pop place-items-center rounded-full bg-gradient-to-br from-mint-400 to-mint-500 text-white shadow-[0_12px_30px_-8px_rgb(16_200_136/0.6)]">
            <CheckIcon className="h-10 w-10" strokeWidth={2.6} />
          </span>
        </div>

        <div role="status" className="mt-5 text-center">
          <h2 tabIndex={-1} className="text-2xl font-semibold tracking-tight text-ink outline-none">
            You’re covered!
          </h2>
          <p className="mt-1 text-slate-500">Your CareShield Max policy has been issued.</p>
        </div>

        <div className="mx-auto mt-6 max-w-sm animate-fade-up [animation-delay:150ms]">
          <PolicyCard
            policyNumber={policy.policyNumber}
            premium={policy.premiumPaid}
            coverageStart={policy.coverageStart}
            coverageEnd={policy.coverageEnd}
          />
        </div>

        <dl className="mx-auto mt-5 grid max-w-sm grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl bg-slate-50 p-3">
            <dt className="text-xs text-slate-500">Premium paid</dt>
            <dd className="font-semibold tabular text-ink">{formatMoney(policy.premiumPaid)}</dd>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3">
            <dt className="text-xs text-slate-500">Payment reference</dt>
            <dd className="truncate font-mono text-xs font-medium text-ink">
              {policy.paymentReference}
            </dd>
          </div>
        </dl>
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-slate-100 px-6 py-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={startOver}>
          Get another quote
        </Button>
        <Button type="button" size="lg" onClick={close} className="sm:min-w-40">
          Done
        </Button>
      </div>
    </div>
  );
}
