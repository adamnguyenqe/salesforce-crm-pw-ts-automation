import { TIMEOUTS } from '@constants';
import { waitUntilElementVisible } from '@utils';

import { BasePage } from './base.page';

/**
 * Page object representing the default Salesforce Lightning Home landing page.
 */
export class HomePage extends BasePage {
  /** Global search button rendered in the Lightning utility bar. */
  readonly searchButton = this.page.getByRole('button', { name: 'Search', exact: true });

  /** App Launcher (grid menu) button in the Lightning utility bar. */
  readonly appLauncherButton = this.page.locator(
    'one-app-launcher-header button[title="App Launcher"]'
  );

  /** Combined Locator for primary top navigation controls used for page readiness check. */
  readonly anyTopBarButton = this.searchButton.or(this.appLauncherButton).first();

  /**
   * Waits until the Lightning navigation bar loads and stabilizes.
   */
  async waitUntilHomePageLoaded(): Promise<void> {
    await waitUntilElementVisible(this.anyTopBarButton, TIMEOUTS.SALESFORCE_LOADING);
    this.log.info('Salesforce home page loaded', { url: this.currentUrl });
  }
}
