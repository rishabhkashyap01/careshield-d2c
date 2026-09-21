'use client';

import { ClockIcon } from '../icons';
import { Button } from '../ui';
import { useFlow } from './FlowProvider';

export function ExpiredPanel() {
  const { recalculate, recalculating } = useFlow();
  return (
    <div
      role="alert"
      className="mx-6 mt-4 flex shrink-0 gap-4 rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-white p-4"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-rose-100 text-rose-600">
        <ClockIcon className="h-6 w-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-rose-900">Your price lock has expired</p>
        <p className="mt-0.5 text-sm text-rose-800/80">
          Prices are held for 15 minutes. Get a fresh price with the same details — it takes a
          second.
        </p>
        <Button
          type="button"
          className="mt-3"
          onClick={() => recalculate()}
          pending={recalculating}
          pendingLabel="Recalculating…"
          autoFocus
        >
          Recalculate premium
        </Button>
      </div>
    </div>
  );
}
