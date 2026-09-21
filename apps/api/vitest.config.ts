import { defineConfig } from 'vitest/config';

/**
 * Three test suites, one config:
 *   unit  — pure logic next to the code (src/**\/*.spec.ts), no database
 *   db    — schema rules against a migrated PostgreSQL (test/db/*.int-spec.ts)
 *   e2e   — the whole API over HTTP (test/*.e2e-spec.ts)
 * db and e2e share one database, so their files run one at a time.
 */
export default defineConfig({
  test: {
    globals: true,
    projects: [
      { extends: true, test: { name: 'unit', include: ['src/**/*.spec.ts'] } },
      {
        extends: true,
        test: {
          name: 'db',
          include: ['test/db/*.int-spec.ts'],
          setupFiles: ['dotenv/config'],
          fileParallelism: false,
        },
      },
      {
        extends: true,
        test: {
          name: 'e2e',
          include: ['test/*.e2e-spec.ts'],
          setupFiles: ['dotenv/config'],
          fileParallelism: false,
        },
      },
    ],
  },
});
