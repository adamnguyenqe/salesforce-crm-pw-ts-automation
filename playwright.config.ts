import { defineConfig, devices } from '@playwright/test';

import { env } from './src/config';
import { SAVED_LOGIN_FILE, Tags, TIMEOUTS } from './src/constants';

export default defineConfig({
  testDir: './tests',
  outputDir: './.artifacts/test-results',

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 2,

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
    screenshot: 'only-on-failure'
  },

  projects: [
    {
      name: 'part-a-jwt-chromium',
      testDir: './tests/part-a',
      grep: new RegExp(Tags.JWT),
      use: { ...devices['Desktop Chrome'], channel: 'chrome' }
    },
    {
      name: 'part-a-jwt-webkit',
      testDir: './tests/part-a',
      grep: new RegExp(Tags.JWT),
      use: { ...devices['Desktop Safari'] }
    },
    {
      name: 'part-a-otp-chromium',
      testDir: './tests/part-a',
      grep: new RegExp(Tags.OTP),
      workers: 1,
      use: { ...devices['Desktop Chrome'], channel: 'chrome' }
    },
    {
      name: 'part-a-otp-webkit',
      testDir: './tests/part-a',
      grep: new RegExp(Tags.OTP),
      workers: 1,
      dependencies: ['part-a-otp-chromium'],
      use: { ...devices['Desktop Safari'] }
    },

    {
      name: 'setup',
      testDir: './tests/setup',
      testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'], channel: 'chrome' }
    },
    {
      name: 'part-b-chromium',
      testDir: './tests/part-b',
      testIgnore: /lead-journey\.ui\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        storageState: SAVED_LOGIN_FILE
      }
    },
    {
      name: 'part-b-ui-chromium',
      testDir: './tests/part-b',
      testMatch: /lead-journey\.ui\.spec\.ts/,
      workers: 1,
      dependencies: ['part-b-chromium'],
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        storageState: SAVED_LOGIN_FILE
      }
    },
    {
      name: 'part-b-webkit',
      testDir: './tests/part-b',
      testIgnore: /lead-journey\.ui\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Safari'], storageState: SAVED_LOGIN_FILE }
    },
    {
      name: 'part-b-ui-webkit',
      testDir: './tests/part-b',
      testMatch: /lead-journey\.ui\.spec\.ts/,
      workers: 1,
      dependencies: ['part-b-webkit'],
      use: { ...devices['Desktop Safari'], storageState: SAVED_LOGIN_FILE }
    }
  ]
});
