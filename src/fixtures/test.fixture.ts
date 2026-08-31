import { test as base } from '@playwright/test';

import { HomePage, LoginPage } from '@pages';
import { OtpMailbox } from '@utils';

/**
 * An empty browser session, for tests that must log in for real:
 *   test.use({ storageState: ANONYMOUS });
 */
export const ANONYMOUS = { cookies: [], origins: [] };

export interface TestFixtures {
  /** The Salesforce login screen. */
  loginPage: LoginPage;

  /** The main Salesforce screen you see after logging in. */
  homePage: HomePage;

  /** A connected inbox for reading codes. Disconnects when the test ends. */
  mailbox: OtpMailbox;
}

export const test = base.extend<TestFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  homePage: async ({ page }, use) => {
    await use(new HomePage(page));
  },

  // Before `use` is setup; after it is cleanup, which runs even on failure.
  mailbox: async ({}, use) => {
    const mailbox = await OtpMailbox.open();
    await use(mailbox);
    await mailbox.close();
  }
});

export * from '@playwright/test';
