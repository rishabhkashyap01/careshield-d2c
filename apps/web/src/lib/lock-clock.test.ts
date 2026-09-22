/**
 * Countdown maths (lib/lock-clock.ts) under the clock problems it exists for.
 * Runs on Node's built-in test runner: npm test -w @careshield/web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { anchorLock, remainingFrom } from './lock-clock.ts';

// A device clock that is years wrong — it must not matter.
const WRONG_CLOCK = Date.parse('2031-01-01T00:00:00Z');
// Server said 15:00 left; the request took 200 ms round trip.
const anchor = anchorLock(900_000, { sentAt: 1_000, receivedAt: 1_200 }, WRONG_CLOCK);

describe('quote-lock countdown', () => {
  it('subtracts half the round trip from the server-reported time', () => {
    assert.equal(anchor.remainingAtReceipt, 899_900);
  });

  it('counts down by elapsed time only; the absolute device time is irrelevant', () => {
    assert.equal(remainingFrom(anchor, 2_200, WRONG_CLOCK + 1_000), 898_900);
  });

  it('gains nothing when the device clock is turned back', () => {
    assert.equal(remainingFrom(anchor, 2_200, WRONG_CLOCK + 1_000 - 600_000), 898_900);
  });

  it('still counts time while the computer sleeps (performance.now paused)', () => {
    assert.equal(remainingFrom(anchor, 1_200, WRONG_CLOCK + 300_000), 599_900);
  });

  it('can only end early, never late, when the clock is turned forward', () => {
    assert.equal(remainingFrom(anchor, 2_200, WRONG_CLOCK + 601_000), 298_900);
  });

  it('never goes below zero', () => {
    assert.equal(remainingFrom(anchor, 2_000_000, WRONG_CLOCK + 2_000_000), 0);
    assert.equal(anchorLock(100, { sentAt: 0, receivedAt: 1_000 }, 0).remainingAtReceipt, 0);
  });

  it('shows an already-expired quote as expired', () => {
    assert.equal(anchorLock(0, { sentAt: 0, receivedAt: 10 }, 0).remainingAtReceipt, 0);
  });
});
