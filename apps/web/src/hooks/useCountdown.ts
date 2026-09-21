'use client';

import { useEffect, useState } from 'react';

/**
 * Countdown to a server-issued deadline (Task 3.2).
 *
 * The device clock can be wrong, so we measure the offset between the server's
 * clock (`serverTime` in the API response) and ours at the moment the response
 * arrived, and count down against the corrected clock.
 */
export function useCountdown(
  lock: { expiresAt: string; serverTime: string; receivedAt: number } | null,
) {
  const deadline = lock ? Date.parse(lock.expiresAt) : NaN;
  const skew = lock ? Date.parse(lock.serverTime) - lock.receivedAt : 0; // server − client

  const compute = () => (Number.isNaN(deadline) ? 0 : Math.max(0, deadline - (Date.now() + skew)));
  const [remainingMs, setRemainingMs] = useState(compute);

  useEffect(() => {
    if (Number.isNaN(deadline)) return;
    // Recompute right away when a new quote arrives, then keep it fresh.
    const tick = () => {
      const next = compute();
      setRemainingMs(next);
      return next;
    };
    const id = window.setInterval(() => {
      if (tick() === 0) window.clearInterval(id);
    }, 250);
    const first = window.setTimeout(tick, 0);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(first);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline, skew]);

  return { remainingMs, expired: !Number.isNaN(deadline) && remainingMs === 0 };
}
