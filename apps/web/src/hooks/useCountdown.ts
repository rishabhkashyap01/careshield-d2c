'use client';

import { useEffect, useState } from 'react';

/**
 * Countdown to a server-issued deadline (Task 3.2).
 *
 * The device clock can be wrong, so we measure the offset between the server's
 * clock (`serverTime` in the API response) and ours at the moment the response
 * arrived, and count down against the corrected clock.
 */
export function useCountdown(expiresAt: string, serverTime: string, receivedAt: number) {
  const deadline = Date.parse(expiresAt);
  const skew = Date.parse(serverTime) - receivedAt; // server − client

  const compute = () => Math.max(0, deadline - (Date.now() + skew));
  const [remainingMs, setRemainingMs] = useState(compute);

  useEffect(() => {
    // The initial value comes from useState(compute); the interval keeps it fresh.
    const id = window.setInterval(() => {
      const next = compute();
      setRemainingMs(next);
      if (next === 0) window.clearInterval(id);
    }, 250);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline, skew]);

  return { remainingMs, expired: remainingMs === 0 };
}
