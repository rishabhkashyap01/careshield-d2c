'use client';

import { formatClock } from '@/lib/format';

/** Announce only at meaningful moments, not every second (screen-reader friendly). */
const ANNOUNCE_AT = [300, 120, 60, 30, 10];

export function CountdownRing({
  remainingMs,
  totalSeconds,
}: {
  remainingMs: number;
  totalSeconds: number;
}) {
  const seconds = Math.ceil(remainingMs / 1000);
  const fraction = Math.max(0, Math.min(1, remainingMs / (totalSeconds * 1000)));
  const tone = seconds === 0 ? 'text-rose-500' : seconds <= 60 ? 'text-amber-500' : 'text-mint-500';
  const r = 22;
  const c = 2 * Math.PI * r;

  // Derived, not stored: the live region's text only changes when a new
  // threshold is crossed, so screen readers hear 5 min, 2 min, 1 min, 30 s, 10 s.
  const bucket = [...ANNOUNCE_AT].reverse().find((m) => seconds <= m);
  const announcement =
    seconds === 0
      ? 'Your price lock has expired.'
      : bucket === undefined
        ? ''
        : bucket >= 60
          ? `${bucket / 60} minute${bucket >= 120 ? 's' : ''} left on your price lock.`
          : `${bucket} seconds left on your price lock.`;

  return (
    <div className="flex items-center gap-3">
      <div className="relative h-11 w-11 shrink-0 sm:h-14 sm:w-14">
        <svg viewBox="0 0 52 52" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="26" cy="26" r={r} className="stroke-white/15" strokeWidth="4" fill="none" />
          <circle
            cx="26"
            cy="26"
            r={r}
            className={`${tone} transition-[stroke-dashoffset] duration-300 ease-linear`}
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            fill="none"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - fraction)}
          />
        </svg>
      </div>
      <div className="leading-tight">
        <p className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider text-white/60">
          {seconds === 0 ? 'Price lock' : 'Price locked'}
        </p>
        <p
          role="timer"
          aria-label={`Price locked for ${formatClock(remainingMs)}`}
          data-testid="countdown"
          className={`font-mono text-xl font-semibold tabular ${seconds === 0 ? 'text-rose-300' : seconds <= 60 ? 'text-amber-300' : 'text-white'}`}
        >
          {formatClock(remainingMs)}
        </p>
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </div>
  );
}
