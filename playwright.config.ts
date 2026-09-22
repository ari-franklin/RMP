import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['**/*.spec.ts', '**/*.test.ts'],
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  use: {
    trace: 'retain-on-failure',
  },
});
