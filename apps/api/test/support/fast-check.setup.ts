/**
 * Global settings for the generated (property-based) tests.
 *
 *   FC_NUM_RUNS=5000 npm test   → try 5,000 random cases per property instead of the default
 *   FC_SEED=123 npm test        → replay the exact random cases of an earlier run
 *
 * When a property fails, fast-check shrinks the input to the smallest case
 * that still fails and prints its seed and path, so the failure is reproducible.
 */
import fc from 'fast-check';

const numRuns = Number(process.env.FC_NUM_RUNS) || undefined;
const seed = Number(process.env.FC_SEED) || undefined;

fc.configureGlobal({
  ...(numRuns ? { numRuns } : {}),
  ...(seed ? { seed } : {}),
  verbose: 1, // on failure, show the shrunk counter-example and how it was found
});
