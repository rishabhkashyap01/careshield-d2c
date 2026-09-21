import { defineConfig } from 'vitest/config';

// Integration tests that need a migrated PostgreSQL (DATABASE_URL).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.int-spec.ts'],
    fileParallelism: false,
  },
});
