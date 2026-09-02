import { test as base } from '@playwright/test';

import { buildLead, type LeadData } from '@data';
import {
  AppLauncherPage,
  HomePage,
  LeadConvertModalPage,
  LeadDetailPage,
  LeadFormPage,
  LeadListPage,
  LoginPage,
  OpportunityPage,
  RecordFormPage
} from '@pages';
import { deleteRecord, OtpMailbox } from '@utils';

/**
 * Empty browser session storage state for tests requiring unauthenticated initialization.
 */
export const ANONYMOUS = { cookies: [], origins: [] };

export interface TestFixtures {
  /** Salesforce login page object. */
  loginPage: LoginPage;

  /** Salesforce Lightning home page object. */
  homePage: HomePage;

  /** Salesforce App Launcher navigation page object. */
  appLauncher: AppLauncherPage;

  /** Salesforce Lead list view page object. */
  leadListPage: LeadListPage;

  /** Salesforce Lead creation and edit modal page object. */
  leadFormPage: LeadFormPage;

  /** Salesforce Lead detail view page object. */
  leadDetailPage: LeadDetailPage;

  /** Salesforce Lead conversion modal dialog page object. */
  convertModal: LeadConvertModalPage;

  /** Salesforce Opportunity detail view page object. */
  opportunityPage: OpportunityPage;

  /** Generic record creation modal page object (Accounts, Contacts). */
  recordFormPage: RecordFormPage;

  /** Active IMAP mailbox client for receiving email verification codes. */
  mailbox: OtpMailbox;

  /** Dynamically generated Lead test data payload. */
  leadData: LeadData;

  /** Test teardown registry to delete created sObject records after test execution. */
  cleanup: { add: (objectName: string, recordId: string) => void };
}

export const test = base.extend<TestFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  homePage: async ({ page }, use) => {
    await use(new HomePage(page));
  },

  appLauncher: async ({ page }, use) => {
    await use(new AppLauncherPage(page));
  },

  leadListPage: async ({ page }, use) => {
    await use(new LeadListPage(page));
  },

  leadFormPage: async ({ page }, use) => {
    await use(new LeadFormPage(page));
  },

  leadDetailPage: async ({ page }, use) => {
    await use(new LeadDetailPage(page));
  },

  convertModal: async ({ page }, use) => {
    await use(new LeadConvertModalPage(page));
  },

  opportunityPage: async ({ page }, use) => {
    await use(new OpportunityPage(page));
  },

  recordFormPage: async ({ page }, use) => {
    await use(new RecordFormPage(page));
  },

  // Before `use` is setup; after it is cleanup, which runs even on failure.
  mailbox: async ({}, use) => {
    const mailbox = await OtpMailbox.open();
    await use(mailbox);
    await mailbox.close();
  },

  leadData: async ({}, use) => {
    await use(buildLead());
  },

  cleanup: async ({}, use) => {
    const created: Array<{ objectName: string; recordId: string }> = [];

    await use({
      add: (objectName: string, recordId: string) => {
        created.push({ objectName, recordId });
      }
    });

    // Delete newest-first. Tests register parents before children (Account, then
    // Contact, then Lead), so reverse order clears dependents.
    const undeleted: string[] = [];

    for (const record of [...created].reverse()) {
      const deleted = await deleteRecord(record.objectName, record.recordId);
      if (!deleted) {
        undeleted.push(`${record.objectName} ${record.recordId}`);
      }
    }

    if (undeleted.length > 0) {
      throw new Error(
        `Teardown left ${undeleted.length} record(s) in the org: ${undeleted.join(', ')}`
      );
    }
  }
});

export * from '@playwright/test';
