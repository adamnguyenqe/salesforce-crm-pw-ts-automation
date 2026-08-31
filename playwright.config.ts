import { defineConfig, devices } from '@playwright/test';

import { env } from './src/config';
import { Tags, TIMEOUTS } from './src/constants';

export default defineConfig({
  testDir: './tests',
  outputDir: './.artifacts/test-results',

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,

  timeout: TIMEOUTS.DEFAULT_E2E_FLOW,
  expect: { timeout: TIMEOUTS.ASSERTION_TIMEOUT },

  reporter: [
    ['list'],
    ['html', { outputFolder: '.artifacts/html-report', open: 'never' }],
    ['json', { outputFile: '.artifacts/results.json' }],
    ['junit', { outputFile: '.artifacts/junit.xml' }]
  ],

  use: {
    baseURL: env.instanceUrl,
    actionTimeout: TIMEOUTS.DEFAULT_TIMEOUT,
    navigationTimeout: TIMEOUTS.NAVIGATION,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    testIdAttribute: 'data-testid'
  },

  projects: [
    /**
     * Part A — the login solutions themselves. These specs perform the login
     * they are testing, so they authenticate for themselves rather than
     * inheriting a session.
     */
    {
      name: 'part-a-jwt',
      testDir: './tests/part-a',
      grep: new RegExp(Tags.JWT),
      use: { ...devices['Desktop Chrome'], channel: 'chrome' }
    },
    {
      name: 'part-a-otp',
      testDir: './tests/part-a',
      grep: new RegExp(Tags.OTP),
      // Salesforce rate-limits verification emails per user, so never run two
      // of these at once.
      workers: 1,
      use: { ...devices['Desktop Chrome'], channel: 'chrome' }
    }
  ]
});
