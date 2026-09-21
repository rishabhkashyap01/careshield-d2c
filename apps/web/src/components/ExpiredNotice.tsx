'use client';

import { Button } from './ui';

export function ExpiredNotice({
  onRecalculate,
  pending,
}: {
  onRecalculate: () => void;
  pending: boolean;
}) {
  return (
    <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-5 text-red-900">
      <p className="text-lg font-semibold">Your quote has expired</p>
      <p className="mt-1 text-sm">
        Prices are locked for 15 minutes. Recalculate to get a fresh quote with the same
        details — it only takes a second.
      </p>
      <Button
        type="button"
        className="mt-4"
        onClick={onRecalculate}
        pending={pending}
        pendingLabel="Recalculating…"
        autoFocus
      >
        Recalculate premium
      </Button>
    </div>
  );
}
