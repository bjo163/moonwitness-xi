import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
import { env } from 'node:process';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const apiPort = env.MW_E2E_API_PORT ?? '3010';
const boardPort = env.MW_E2E_BOARD_PORT ?? '5174';
const baseURL = `http://127.0.0.1:${boardPort}`;
const databaseUrl =
  env.POSTGRES_TEST_URL ?? 'postgresql://postgres:ci-only-password@127.0.0.1:55432/moonwitness_e2e';
const jwtSecret = 'e2e-only-jwt-secret-that-is-never-used-outside-tests';
const superadminPassword = 'e2e-only-password';
const ci = env.CI === 'true';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  workers: ci ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { outputFolder: '../../test-results/playwright-report', open: 'never' }],
  ],
  outputDir: '../../test-results/playwright',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1440, height: 1000 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @moonwitness/api dev',
      cwd: repositoryRoot,
      url: `http://127.0.0.1:${apiPort}/readyz`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        ...env,
        API_HOST: '127.0.0.1',
        API_PORT: apiPort,
        DATABASE_URL: databaseUrl,
        JWT_SECRET: jwtSecret,
        LOG_TO_FILE: 'false',
        PRINT_ROUTES: 'false',
        SUPERADMIN_PASSWORD: superadminPassword,
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
