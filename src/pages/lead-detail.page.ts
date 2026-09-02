import { TIMEOUTS } from '@constants';

import { RecordPage } from './record.page';

/**
 * Page object representing the Salesforce Lead detail view page.
 */
export class LeadDetailPage extends RecordPage {
  protected readonly objectName = 'Lead';

  private readonly editButton = this.page.getByRole('button', { name: 'Edit', exact: true });
  private readonly moreActionsButton = this.page.getByRole('button', { name: 'Show more actions' });

  /**
   * Retrieves a field value from the top highlights panel.
   *
   * @param fieldLabel - Display label of the highlights field (e.g. 'Company')
   * @returns Field value text, or empty string if not rendered
   */
  async getHighlightValue(fieldLabel: string): Promise<string> {
    const item = this.page
      .locator('records-highlights-details-item')
      .filter({ hasText: fieldLabel });
    const wholeBlock = await this.getElementInnerText(item.first(), TIMEOUTS.SCREEN_APPEARS);

    return wholeBlock
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(1)
      .join(' ');
  }

  /** Opens the full record edit modal dialog. */
  async startEditing(): Promise<void> {
    this.log.info('Opening Lead edit modal');
    await this.click(this.editButton);
  }

  /**
   * Updates a picklist field inline from the Details tab without opening full edit modal.
   *
   * @param apiName - Picklist field API name (e.g. 'Lead.Status')
   * @param fieldLabel - Display label associated with the inline edit trigger
   * @param value - Target picklist option to select
   */
  async editPicklistInline(apiName: string, fieldLabel: string, value: string): Promise<void> {
    this.log.info('Updating picklist field inline', { apiName, value });

    await this.openDetailsTab();
    await this.click(this.page.getByRole('button', { name: `Edit ${fieldLabel}`, exact: true }));
    await this.selectPicklistValue(apiName, value);
    await this.click(this.saveButton);
    await this.picklistTrigger(apiName)
      .first()
      .waitFor({ state: 'detached', timeout: TIMEOUTS.SALESFORCE_LOADING })
      .catch(() => this.log.debug('Inline picklist trigger still attached', { apiName }));

    await this.waitUntilIdle();
  }

  /**
   * Triggers the Convert action from the top actions bar or overflow menu.
   */
  async startConverting(): Promise<void> {
    this.log.info('Triggering Lead conversion modal');

    const directButton = this.page.getByRole('button', { name: 'Convert', exact: true });
    if (await this.isElementVisible(directButton, TIMEOUTS.SMALL_TIMEOUT)) {
      await this.click(directButton);
      return;
    }

    await this.click(this.moreActionsButton.first());
    await this.click(this.page.getByRole('menuitem', { name: 'Convert' }).first());
  }
}
