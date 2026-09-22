/**
 * Generated tests for the countdown maths (lib/lock-clock.ts): fast-check
 * invents server answers, network round trips, wrong device clocks, sleeps and
 * clock changes. Run with: npm test -w @careshield/web
 */
import { describe, it } from 'node:test';
import fc from 'fast-check';
import { anchorLock, remainingFrom } from './lock-clock.ts';

const LOCK = 15 * 60_000;
const numRuns = Number(process.env.FC_NUM_RUNS) || 1000;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const assert = (p: fc.IProperty<any>) => fc.assert(p, { numRuns });

/** What the server said, and how long the request took. */
const answer = fc.record({
  remainingMs: fc.integer({ min: 0, max: LOCK }),
  sentAt: fc.integer({ min: 0, max: 10 ** 9 }), // performance.now() when the request left
  roundTrip: fc.integer({ min: 0, max: 30_000 }),
  /** The device's wall clock: any time from 1970 to 2100, however wrong. */
  wallAtReceipt: fc.integer({ min: 0, max: 4_102_444_800_000 }),
});
type Answer = { remainingMs: number; sentAt: number; roundTrip: number; wallAtReceipt: number };
const anchorOf = (a: Answer) =>
  anchorLock(
    a.remainingMs,
    { sentAt: a.sentAt, receivedAt: a.sentAt + a.roundTrip },
    a.wallAtReceipt,
  );
const elapsed = fc.integer({ min: 0, max: 2 * LOCK });

describe('countdown maths (generated)', () => {
  it('never goes negative and never shows more than the server reported', () => {
    assert(
      fc.property(answer, elapsed, elapsed, (a, dPerf, dWall) => {
        const anchor = anchorOf(a);
        const r = remainingFrom(anchor, anchor.perfAtReceipt + dPerf, anchor.wallAtReceipt + dWall);
        if (r < 0) throw new Error(`negative: ${r}`);
        if (r > a.remainingMs) throw new Error(`${r} > server's ${a.remainingMs}`);
      }),
    );
  });

  it('is off from the true deadline by at most half the round trip', () => {
    assert(
      fc.property(answer, (a) => {
        const anchor = anchorOf(a);
        // The server measured somewhere in [sentAt, receivedAt]: the truth at
        // receipt lies between remainingMs - roundTrip and remainingMs.
        const shown = anchor.remainingAtReceipt;
        const truthLow = Math.max(0, a.remainingMs - a.roundTrip);
        const truthHigh = a.remainingMs;
        const err = Math.max(Math.abs(shown - truthLow), Math.abs(shown - truthHigh));
        if (err > a.roundTrip / 2 + 1e-9) throw new Error(`error ${err} > rtt/2`);
      }),
    );
  });

  it('the absolute device time is irrelevant: shifting the wall clock by any amount changes nothing', () => {
    assert(
      fc.property(answer, elapsed, fc.integer({ min: -(10 ** 12), max: 10 ** 12 }), (a, d, shift) => {
        const x = anchorOf(a);
        const y = anchorOf({ ...a, wallAtReceipt: a.wallAtReceipt + shift });
        const rx = remainingFrom(x, x.perfAtReceipt + d, x.wallAtReceipt + d);
        const ry = remainingFrom(y, y.perfAtReceipt + d, y.wallAtReceipt + d);
        if (rx !== ry) throw new Error(`${rx} !== ${ry}`);
      }),
    );
  });

  it('only counts down: as real time passes, the time left never goes up', () => {
    assert(
      fc.property(answer, elapsed, elapsed, (a, t1, t2) => {
        const anchor = anchorOf(a);
        const [early, late] = t1 <= t2 ? [t1, t2] : [t2, t1];
        const at = (t: number) => remainingFrom(anchor, anchor.perfAtReceipt + t, anchor.wallAtReceipt + t);
        if (at(late) > at(early)) throw new Error('went up');
      }),
    );
  });

  it('turning the device clock BACK never adds time', () => {
    assert(
      fc.property(answer, elapsed, fc.integer({ min: 1, max: 10 ** 10 }), (a, d, back) => {
        const anchor = anchorOf(a);
        const honest = remainingFrom(anchor, anchor.perfAtReceipt + d, anchor.wallAtReceipt + d);
        const cheated = remainingFrom(anchor, anchor.perfAtReceipt + d, anchor.wallAtReceipt + d - back);
        if (cheated > honest) throw new Error(`${cheated} > ${honest}`);
      }),
    );
  });

  it('a sleeping computer (performance.now paused) still loses the time it slept', () => {
    assert(
      fc.property(answer, elapsed, (a, slept) => {
        const anchor = anchorOf(a);
        const r = remainingFrom(anchor, anchor.perfAtReceipt, anchor.wallAtReceipt + slept);
        if (r !== Math.max(0, anchor.remainingAtReceipt - slept)) throw new Error(`got ${r}`);
      }),
    );
  });

  it('reaches exactly 0 once the reported time has fully elapsed', () => {
    assert(
      fc.property(answer, fc.integer({ min: 0, max: LOCK }), (a, extra) => {
        const anchor = anchorOf(a);
        const t = anchor.remainingAtReceipt + extra;
        if (remainingFrom(anchor, anchor.perfAtReceipt + t, anchor.wallAtReceipt + t) !== 0)
          throw new Error('not 0');
      }),
    );
  });
});
