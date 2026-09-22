'use client';

import { useEffect, useState } from 'react';
import { type LockAnchor, remainingFrom } from '@/lib/lock-clock';

/**
 * Countdown for the quote lock (Task 3.2). Driven by the server-computed
 * remaining time captured in `anchor` (see lib/lock-clock.ts), never by
 * comparing the device clock with `expiresAt`.
 */
export function useCountdown(anchor: LockAnchor | null) {
  // The latest reading, tagged with the anchor it belongs to.
  const [reading, setReading] = useState<{ anchor: LockAnchor | null; ms: number }>({
    anchor: null,
    ms: 0,
  });

  useEffect(() => {
    if (!anchor) return;
    const tick = () => {
      const ms = remainingFrom(anchor, performance.now(), Date.now());
      setReading({ anchor, ms });
      return ms;
    };
    const id = window.setInterval(() => {
      if (tick() === 0) window.clearInterval(id);
    }, 250);
    const first = window.setTimeout(tick, 0);
    // Coming back to the tab (or waking the computer) re-reads the clock at once.
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(first);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [anchor]);

  // Until the first tick for a new anchor, show what the server just told us
  // (this keeps render pure and avoids a one-frame "expired" flash).
  const remainingMs = !anchor
    ? 0
    : reading.anchor === anchor
      ? reading.ms
      : anchor.remainingAtReceipt;

  return { remainingMs, expired: !!anchor && remainingMs === 0 };
}
