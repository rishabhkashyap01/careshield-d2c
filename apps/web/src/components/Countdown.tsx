'use client';

import { useEffect, useRef, useState } from 'react';
import { formatClock } from '@/lib/format';

/** Announce only at meaningful moments, not every second (screen-reader friendly). */
const ANNOUNCE_AT = [300, 120, 60, 30, 10];

export function Countdown({
  remainingMs,
  totalSeconds,
}: {
  remainingMs: number;
  totalSeconds: number;
}) {
  const seconds = Math.ceil(remainingMs / 1000);
  const pct = Math.max(0, Math.min(100, (remainingMs / (totalSeconds * 1000)) * 100));
  const urgent = seconds <= 60;
  const [announcement, setAnnouncement] = useState('');
  const announced = useRef(new Set<number>());

  useEffect(() => {
    const mark = ANNOUNCE_AT.find((m) => seconds <= m && !announced.current.has(m));
    if (mark !== undefined && seconds > 0) {
      ANNOUNCE_AT.filter((m) => m >= mark).forEach((m) => announced.current.add(m));
      setAnnouncement(
        mark >= 60
          ? `${Math.round(mark / 60)} minute${mark >= 120 ? 's' : ''} left on your quote.`
          : `${mark} seconds left on your quote.`,
      );
    }
    if (seconds === 0) setAnnouncement('Your quote has expired.');
  }, [seconds]);

  return (
    <div
      className={`rounded-xl border p-4 ${
        urgent ? 'border-amber-300 bg-amber-50' : 'border-emerald-200 bg-emerald-50'
      }`}
    >
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-sm font-medium text-slate-700">Price locked for</p>
        <p
          role="timer"
          aria-label={`Quote expires in ${formatClock(remainingMs)}`}
          className={`font-mono text-2xl font-semibold tabular-nums ${
            urgent ? 'text-amber-800' : 'text-emerald-800'
          }`}
          data-testid="countdown"
        >
          {formatClock(remainingMs)}
        </p>
      </div>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-white"
        aria-hidden="true"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ease-linear ${
            urgent ? 'bg-amber-500' : 'bg-emerald-600'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {urgent && seconds > 0 && (
        <p className="mt-2 text-sm text-amber-900">
          Less than a minute left — complete payment to keep this price.
        </p>
      )}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </div>
  );
}
