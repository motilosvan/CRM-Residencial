import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['apps/api/**/*.test.ts', 'apps/gateway/**/*.test.ts'],
    // Las pruebas de integración comparten un único SQL Server: se ejecutan en serie.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
