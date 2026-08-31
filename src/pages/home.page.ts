import { TIMEOUTS } from '@constants';
import { waitUntilElementVisible } from '@utils';

import { BasePage } from './base.page';

/**
 * The main Salesforce screen after logging in.
 */
export class HomePage extends BasePage {
  /** Search button in the top bar. It is a button, not a text box. */
  readonly searchButton = this.page.getByRole('button', { name: 'Search', exact: true });

  /** The grid-of-dots button in the top bar that opens the list of apps. */
  readonly appLauncherButton = this.page.locator(
    'one-app-launcher-header button[title="App Launcher"]'
  );

  /** Either button above — enough to know the page loaded. */
  readonly anyTopBarButton = this.searchButton.or(this.appLauncherButton).first();

  /**
   * Wait for Salesforce to finish loading. Can be slow: it draws an empty
   * frame first, then fills in the content.
   */
  async waitUntilHomePageLoaded(): Promise<void> {
    await waitUntilElementVisible(this.anyTopBarButton, TIMEOUTS.SALESFORCE_LOADING);
    this.log.info('Salesforce has finished loading', { url: this.currentUrl });
  }
}
