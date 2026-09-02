import { LEAD_LIST_PATH, NEW_LEAD_PATH, TIMEOUTS } from '@constants';

import { BasePage } from './base.page';

const NEW_FORM_ATTEMPTS = 4;

/**
 * Page object representing the Salesforce Lead list view page and navigation actions.
 */
export class LeadListPage extends BasePage {
  private readonly newButton = this.page.getByRole('button', { name: 'New', exact: true });
  private readonly leadsNavItem = this.page.getByRole('link', { name: 'Leads', exact: true });

  /**
   * Clicks the 'New' button from the Lead list view to open the creation modal.
   */
  async startNewLead(): Promise<void> {
    this.log.info('Opening New Lead modal from list view');
    await this.click(this.newButton);
  }

  /**
   * Navigates to the Lead list view via top nav bar or direct URL fallback.
   */
  async open(): Promise<void> {
    this.log.info('Navigating to Lead list view');

    const navItemShowing = await this.isElementVisible(this.leadsNavItem, TIMEOUTS.SCREEN_APPEARS);

    if (navItemShowing) {
      await this.click(this.leadsNavItem);
    } else {
      this.log.info('Leads navigation item not visible; navigating directly via URL');
      await this.goToPath(LEAD_LIST_PATH);
    }

    await this.waitUntilIdle(TIMEOUTS.SALESFORCE_LOADING);
  }

  /**
   * Navigates directly to the New Lead modal URL with retry logic for Lightning settling delays.
   */
  async openNewLeadFormDirectly(): Promise<void> {
    this.log.info('Navigating directly to New Lead form URL');
    await this.goToPath(NEW_LEAD_PATH);
    await this.waitUntilIdle(TIMEOUTS.SALESFORCE_LOADING);

    for (let attempt = 1; attempt <= NEW_FORM_ATTEMPTS; attempt++) {
      const formOpened = await this.isElementVisible(this.saveButton, TIMEOUTS.SCREEN_APPEARS);

      if (formOpened) {
        return;
      }

      this.log.info('New Lead form not rendered; attempting via list view', { attempt });
      await this.goToPath(LEAD_LIST_PATH);
      await this.waitUntilIdle(TIMEOUTS.SALESFORCE_LOADING);
      await this.newButton
        .waitFor({ state: 'visible', timeout: TIMEOUTS.SALESFORCE_LOADING })
        .catch(() => this.log.debug('Lead list view New button did not render'));
      await this.click(this.newButton);
      await this.waitUntilIdle(TIMEOUTS.SALESFORCE_LOADING);
    }

    throw new Error(`Failed to open New Lead form after ${NEW_FORM_ATTEMPTS} attempts.`);
  }
}
