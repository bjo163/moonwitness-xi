import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { env } from 'node:process';
import { E2E_JWT_SECRET, E2E_SUPERADMIN_PASSWORD } from './e2e/constants.js';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const apiPort = env.MW_E2E_API_PORT ?? '3010';
const boardPort = env.MW_E2E_BOARD_PORT ?? '5174';
const baseURL = `http://127.0.0.1:${boardPort}`;
const databaseUrl =
  env.POSTGRES_TEST_URL ?? 'postgresql://postgres:ci-only-password@127.0.0.1:55432/moonwitness_e2e';
const ci = env.CI === 'true';
const buildScript = resolve(repositoryRoot, 'scripts/build-api-workspace.mjs');
const flakyPolicyPath = resolve(repositoryRoot, 'docs/testing/flaky-tests.json');
const flakyPolicyValue: unknown = JSON.parse(readFileSync(flakyPolicyPath, 'utf8'));
if (
  typeof flakyPolicyValue !== 'object' ||
  flakyPolicyValue === null ||
  !('maxRetries' in flakyPolicyValue) ||
  typeof flakyPolicyValue.maxRetries !== 'number'
) {
  throw new Error('docs/testing/flaky-tests.json must define a numeric maxRetries value.');
}
const maxRetries = flakyPolicyValue.maxRetries;
if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 1) {
  throw new Error('Playwright CI retries must be an integer between 0 and 1.');
}
const flakeReporter = resolve(repositoryRoot, 'scripts/playwright-flake-reporter.mjs');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: ci,
  retries: ci ? maxRetries : 0,
  workers: ci ? 1 : undefined,
  reporter: [
    ['list'],
    ['junit', { outputFile: '../../test-results/junit/board-e2e.xml' }],
    [
      flakeReporter,
      { outputFile: resolve(repositoryRoot, 'test-results/junit/board-e2e-retries.json') },
    ],
  ],
  outputDir: '../../test-results/playwright',
  use: {
    baseURL,
    // Traces include request headers and cookies; CI uploads only sanitized JUnit and screenshots.
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1440, height: 1000 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `pnpm exec node "${buildScript}" && pnpm --filter @moonwitness/api dev`,
      cwd: repositoryRoot,
      url: `http://127.0.0.1:${apiPort}/readyz`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        ...env,
        API_HOST: '127.0.0.1',
        API_PORT: apiPort,
        DATABASE_URL: databaseUrl,
        JWT_SECRET: E2E_JWT_SECRET,
        LOG_TO_FILE: 'false',
        PRINT_ROUTES: 'false',
        SUPERADMIN_PASSWORD: E2E_SUPERADMIN_PASSWORD,
      },
    },
    {
      command: `pnpm --filter @moonwitness/board exec vite --host 127.0.0.1 --port ${boardPort} --strictPort`,
      cwd: repositoryRoot,
      url: `${baseURL}/login`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: { ...env, API_PORT: apiPort, BOARD_API_TARGET: `http://127.0.0.1:${apiPort}` },
    },
  ],
});
