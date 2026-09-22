/**
 * Generated tests for the quote state machine and the eligibility rules.
 * fast-check walks random paths through the state machine and invents
 * random medical declarations.
 */
import fc from 'fast-check';
import { QuoteStatus } from '../../generated/prisma/enums.js';
import {
  declaresPreExistingCondition,
  evaluateEligibility,
  type MedicalDeclaration,
} from './eligibility.js';
import {
  assertTransition,
  canTransition,
  InvalidQuoteTransitionError,
  QUOTE_TRANSITIONS,
  requiresValidLock,
} from './quote-state-machine.js';

const {
  QUOTE_GENERATED,
  MEDICAL_DECLARED,
  PENDING_PAYMENT,
  PREMIUM_PAID,
  POLICY_ISSUED,
} = QuoteStatus;
const ALL = Object.values(QuoteStatus);
const status = fc.constantFrom(...ALL);

/** The lifecycle as the brief + LLD describe it, written independently of the code. */
const SPEC = new Set([
  'QUOTE_GENERATED>MEDICAL_DECLARED',
  'MEDICAL_DECLARED>PENDING_PAYMENT',
  'PENDING_PAYMENT>PREMIUM_PAID',
  'PENDING_PAYMENT>MEDICAL_DECLARED', // payment failed
  'PREMIUM_PAID>POLICY_ISSUED',
]);

describe('quote state machine (generated)', () => {
  it('allows exactly the transitions in the spec, for every pair of states', () => {
    fc.assert(
      fc.property(status, status, (from, to) => {
        const legal = SPEC.has(`${from}>${to}`);
        expect(canTransition(from, to)).toBe(legal);
        if (legal) expect(() => assertTransition(from, to)).not.toThrow();
        else
          expect(() => assertTransition(from, to)).toThrow(
            InvalidQuoteTransitionError,
          );
      }),
    );
  });

  it('on any random walk: never skips payment, never leaves POLICY_ISSUED, never returns to QUOTE_GENERATED', () => {
    fc.assert(
      fc.property(fc.array(status, { maxLength: 40 }), (attempts) => {
        let current: QuoteStatus = QUOTE_GENERATED;
        const visited: QuoteStatus[] = [current];
        for (const next of attempts) {
          if (!canTransition(current, next)) continue; // refused: state unchanged
          if (next === PREMIUM_PAID) expect(current).toBe(PENDING_PAYMENT);
          if (next === POLICY_ISSUED) expect(current).toBe(PREMIUM_PAID);
          expect(next).not.toBe(QUOTE_GENERATED);
          current = next;
          visited.push(current);
        }
        // Once issued, the walk is over.
        const issuedAt = visited.indexOf(POLICY_ISSUED);
        if (issuedAt >= 0) expect(visited.length - 1).toBe(issuedAt);
      }),
    );
  });

  it('POLICY_ISSUED is reachable from every non-final state, and is the only final state', () => {
    const reachable = (
      from: QuoteStatus,
      seen = new Set<QuoteStatus>(),
    ): Set<QuoteStatus> => {
      for (const to of QUOTE_TRANSITIONS[from]) {
        if (!seen.has(to)) {
          seen.add(to);
          reachable(to, seen);
        }
      }
      return seen;
    };
    fc.assert(
      fc.property(status, (s) => {
        if (s === POLICY_ISSUED) expect(QUOTE_TRANSITIONS[s]).toEqual([]);
        else expect(reachable(s).has(POLICY_ISSUED)).toBe(true);
      }),
    );
  });

  it('the 15-minute lock guards exactly: declaring, and starting a payment', () => {
    fc.assert(
      fc.property(status, status, (from, to) => {
        const guarded =
          (from === QUOTE_GENERATED && to === MEDICAL_DECLARED) ||
          to === PENDING_PAYMENT;
        expect(requiresValidLock(from, to)).toBe(guarded);
      }),
    );
  });
});

const declaration: fc.Arbitrary<MedicalDeclaration> = fc.record({
  hasDiabetes: fc.boolean(),
  hasHypertension: fc.boolean(),
  hasHeartDisease: fc.boolean(),
  isSmoker: fc.boolean(),
  hadMajorSurgeryLast5Years: fc.boolean(),
  hasTerminalIllness: fc.boolean(),
});

describe('eligibility (generated)', () => {
  it('is eligible exactly when there is no terminal illness and no condition the price missed', () => {
    fc.assert(
      fc.property(declaration, fc.boolean(), (d, pricedWithConditions) => {
        const condition =
          d.hasDiabetes || d.hasHypertension || d.hasHeartDisease;
        const expected =
          !d.hasTerminalIllness && (pricedWithConditions || !condition);
        const r = evaluateEligibility(d, {
          hasPreExistingConditions: pricedWithConditions,
        });
        expect(r.eligible).toBe(expected);
        expect(r.eligible).toBe(r.reasons.length === 0);
      }),
    );
  });

  it('gives one reason per problem, each with a message, and never duplicates', () => {
    fc.assert(
      fc.property(declaration, fc.boolean(), (d, priced) => {
        const r = evaluateEligibility(d, { hasPreExistingConditions: priced });
        const codes = r.reasons.map((x) => x.code);
        expect(new Set(codes).size).toBe(codes.length);
        expect(codes.includes('TERMINAL_ILLNESS')).toBe(d.hasTerminalIllness);
        expect(codes.includes('UNDECLARED_PRE_EXISTING_CONDITION')).toBe(
          !priced && declaresPreExistingCondition(d),
        );
        for (const x of r.reasons) expect(x.message.length).toBeGreaterThan(20);
      }),
    );
  });

  it('smoking and past surgery never change eligibility on their own', () => {
    fc.assert(
      fc.property(declaration, fc.boolean(), (d, priced) => {
        const base = evaluateEligibility(d, {
          hasPreExistingConditions: priced,
        });
        const flipped = evaluateEligibility(
          {
            ...d,
            isSmoker: !d.isSmoker,
            hadMajorSurgeryLast5Years: !d.hadMajorSurgeryLast5Years,
          },
          { hasPreExistingConditions: priced },
        );
        expect(flipped).toEqual(base);
      }),
    );
  });
});
