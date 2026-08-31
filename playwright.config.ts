import { defineConfig, devices } from '@playwright/test';

import { env } from './src/config/env.config';

export default defineConfig({
  testDir: './tests',
  outputDir: './.artifacts/test-results',

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,

  timeout: 90_000,
  expect: { timeout: 15_000 },

  reporter: [
    ['list'],
    ['html', { outputFolder: '.artifacts/html-report', open: 'never' }],
    ['json', { outputFile: '.artifacts/results.json' }],
    ['junit', { outputFile: '.artifacts/junit.xml' }],
  ],

  use: {
    baseURL: env.instanceUrl,
    actionTimeout: 30_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    testIdAttribute: 'data-testid',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', grep: /@smoke/, use: { ...devices['Desktop Safari'] } },
  ],
});
