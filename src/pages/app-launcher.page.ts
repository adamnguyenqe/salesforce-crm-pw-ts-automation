import { LIGHTNING_URL_PATTERN, TIMEOUTS } from '@constants';

import { BasePage } from './base.page';

const OPEN_ATTEMPTS = 3;
const SEARCH_ATTEMPTS = 3;

/**
 * Page object representing the Salesforce App Launcher (grid menu) and app switcher.
 */
export class AppLauncherPage extends BasePage {
  private readonly launcherButton = this.page.locator(
    'one-app-launcher-header button[title="App Launcher"]'
  );

  private readonly searchBox = this.page.getByPlaceholder('Search apps and items...');

  /**
   * Opens the App Launcher panel overlay.
   */
  private async openPanel(): Promise<void> {
    const panel = this.page.locator('one-app-launcher-menu');

    for (let attempt = 1; attempt <= OPEN_ATTEMPTS; attempt++) {
      if (await this.isElementVisible(this.searchBox, TIMEOUTS.SCREEN_APPEARS)) {
        return;
      }

      this.log.info('App Launcher panel not ready, retrying open', { attempt });
      if (await this.isElementVisible(panel, TIMEOUTS.SMALL_TIMEOUT)) {
        await this.click(this.launcherButton);
        await panel
          .waitFor({ state: 'hidden', timeout: TIMEOUTS.SCREEN_APPEARS })
          .catch(() => this.log.debug('App Launcher panel close timeout'));
      }

      await this.click(this.launcherButton);
    }

    await this.searchBox.waitFor({ state: 'visible', timeout: TIMEOUTS.SCREEN_APPEARS });
  }

  /**
   * Searches for and opens a Salesforce application by name from App Launcher.
   *
   * @param appName - Target application name (e.g. 'Sales')
   */
  async openApp(appName: string): Promise<void> {
    this.log.info('Switching application via App Launcher', { appName });

    await this.openPanel();
    await this.fill(this.searchBox, appName);

    const appLink = this.page
      .locator('one-app-launcher-menu-item a')
      .filter({ hasText: new RegExp(`^${appName}$`) });

    for (let attempt = 1; attempt <= SEARCH_ATTEMPTS; attempt++) {
      const linkAppeared = await this.isElementVisible(appLink.first(), TIMEOUTS.SCREEN_APPEARS);

      if (linkAppeared) {
        break;
      }

      this.log.info('App item search result not visible yet, retrying query', { appName, attempt });
      await this.clearInputElementAndWait(this.searchBox);
      await this.fill(this.searchBox, appName);
    }

    await appLink.first().waitFor({ state: 'visible', timeout: TIMEOUTS.SCREEN_APPEARS });
    await this.click(appLink.first());

    await this.page.waitForURL(LIGHTNING_URL_PATTERN, { timeout: TIMEOUTS.SALESFORCE_LOADING });
    await this.waitUntilIdle(TIMEOUTS.SALESFORCE_LOADING);

    this.log.info('Application switched successfully', { appName, url: this.currentUrl });
  }
}
