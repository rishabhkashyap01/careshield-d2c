/**
 * Quote-lock countdown that never trusts the device clock (Task 3.2).
 *
 * The API reports how much lock is left, measured on the SERVER clock
 * (`remainingMs`). We anchor that relative value at the moment the response
 * arrives and from then on only measure elapsed time locally. The device's
 * absolute time is never compared with the server's, so a device clock that is
 * minutes (or years) wrong cannot end the countdown early or keep it running
 * past the real deadline. The server still has the final say: declaring or
 * paying after expiry is refused with 410.
 */

export interface LockAnchor {
  /** Lock left at the moment the response arrived, after transit correction. */
  remainingAtReceipt: number;
  /** performance.now() at arrival — monotonic, unaffected by clock changes. */
  perfAtReceipt: number;
  /** Date.now() at arrival — used only as a difference (see remainingFrom). */
  wallAtReceipt: number;
}

export interface Timing {
  /** performance.now() just before the request left. */
  sentAt: number;
  /** performance.now() when the response arrived. */
  receivedAt: number;
}

/**
 * The server measured `remainingMs` somewhere between `sentAt` and
 * `receivedAt`; assuming half-way (as NTP does) bounds the error by half the
 * round trip, whatever the network latency.
 */
export function anchorLock(
  remainingMs: number,
  { sentAt, receivedAt }: Timing,
  wallNow: number,
): LockAnchor {
  const transit = Math.max(0, receivedAt - sentAt) / 2;
  return {
    remainingAtReceipt: Math.max(0, remainingMs - transit),
    perfAtReceipt: receivedAt,
    wallAtReceipt: wallNow,
  };
}

/**
 * Lock left now. Elapsed time is the LARGER of two local measurements:
 *  - performance.now() ignores clock changes, but some browsers pause it
 *    while the computer sleeps;
 *  - Date.now() keeps counting through sleep, but jumps if the clock is changed.
 * Taking the larger means sleeping, or turning the clock back, can never make
 * the price look locked for longer than it really is.
 */
export function remainingFrom(
  anchor: LockAnchor,
  perfNow: number,
  wallNow: number,
): number {
  const elapsed = Math.max(
    0,
    perfNow - anchor.perfAtReceipt,
    wallNow - anchor.wallAtReceipt,
  );
  return Math.max(0, anchor.remainingAtReceipt - elapsed);
}

/** Run a request and record its round trip on the monotonic clock. */
export async function timed<T>(
  request: () => Promise<T>,
): Promise<{ result: T; timing: Timing }> {
  const sentAt = performance.now();
  const result = await request();
  return { result, timing: { sentAt, receivedAt: performance.now() } };
}
