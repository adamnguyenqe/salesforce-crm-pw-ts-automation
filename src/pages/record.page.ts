import { extractRecordIdFromUrl, RECORD_PAGE_URL_PATTERN, TIMEOUTS } from '@constants';

import { BasePage, RECORD_TITLE_SELECTOR } from './base.page';

/**
 * Abstract page object representing a Salesforce record view page (e.g. Lead, Opportunity, Account).
 */
export abstract class RecordPage extends BasePage {
  /** sObject API name identifier (e.g. 'Lead', 'Account'). */
  protected abstract readonly objectName: string;

  /** Primary record title / header element. */
  protected readonly recordTitle = this.page.locator(RECORD_TITLE_SELECTOR).first();

  /** Record view 'Details' tab button. */
  protected readonly detailsTab = this.page.getByRole('tab', { name: 'Details' });

  /**
   * Waits for the record view page to load and display the record title.
   */
  async waitUntilLoaded(): Promise<void> {
    await this.page.waitForURL(RECORD_PAGE_URL_PATTERN, {
      timeout: TIMEOUTS.SALESFORCE_LOADING
    });

    await this.waitUntilIdle();
    await this.recordTitle.waitFor({ state: 'visible', timeout: TIMEOUTS.SALESFORCE_LOADING });

    this.log.info('Record page loaded', {
      objectName: this.objectName,
      url: this.currentUrl
    });
  }

  /**
   * Extracts the 18-character record ID from the current page URL.
   *
   * @returns Salesforce 18-character record ID
   * @throws If the URL does not match a valid Salesforce record pattern
   */
  getRecordId(): string {
    const recordId = extractRecordIdFromUrl(this.currentUrl);
    if (!recordId) {
      throw new Error(`Failed to extract record ID from current URL: ${this.currentUrl}`);
    }
    return recordId;
  }

  /**
   * Navigates directly to a record view page by record ID.
   *
   * @param recordId - 18-character Salesforce record ID
   */
  async open(recordId: string): Promise<void> {
    await this.goToPath(`/lightning/r/${this.objectName}/${recordId}/view`);
    await this.waitUntilLoaded();
  }

  /**
   * Activates the Details tab on the record page if not currently selected.
   */
  async openDetailsTab(): Promise<void> {
    const isAlreadyActive = await this.detailsTab
      .getAttribute('aria-selected', { timeout: TIMEOUTS.SCREEN_APPEARS })
      .catch(() => null);

    if (isAlreadyActive !== 'true') {
      await this.click(this.detailsTab);
    }

    await this.page
      .locator('records-record-layout-item')
      .first()
      .waitFor({ state: 'visible', timeout: TIMEOUTS.SALESFORCE_LOADING });
  }

  /**
   * Reads the text value of a field from the Details tab.
   *
   * @param apiName - Field API name (e.g. 'Lead.Company')
   * @returns Field text value, or empty string if unpopulated
   */
  async getFieldValue(apiName: string): Promise<string> {
    await this.openDetailsTab();

    const rawValue = await this.getElementInnerText(
      this.fieldValue(apiName).first(),
      TIMEOUTS.SCREEN_APPEARS
    );

    return rawValue.split('\n')[0]?.trim() ?? '';
  }
}
