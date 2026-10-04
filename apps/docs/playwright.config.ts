import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: [['list'], ['junit', { outputFile: '../../test-results/junit/docs-portal.xml' }]],
  outputDir: '../../test-results/docs-portal',
  use: {
    baseURL: 'http://127.0.0.1:4178/moonwitness-xi/',
    browserName: 'chromium',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm exec vite preview --host 127.0.0.1 --port 4178 --strictPort',
    url: 'http://127.0.0.1:4178/moonwitness-xi/',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
