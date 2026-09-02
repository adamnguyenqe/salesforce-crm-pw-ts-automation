import type { LeadData } from '@data';
import { LEAD_FIELDS, RECORD_PAGE_URL_PATTERN, TIMEOUTS } from '@constants';

import { BasePage } from './base.page';

/**
 * Page object representing the Salesforce New / Edit Lead modal form.
 */
export class LeadFormPage extends BasePage {
  private readonly cancelButton = this.page.getByRole('button', { name: 'Cancel', exact: true });
  private readonly firstNameBox = this.textField(LEAD_FIELDS.NAME).first();
  private readonly lastNameBox = this.textField(LEAD_FIELDS.NAME).last();

  /**
   * Checks whether the Lead form modal is visible and ready for interaction.
   *
   * @returns True if visible, false otherwise
   */
  async isOpen(): Promise<boolean> {
    return this.isElementVisible(this.lastNameBox, TIMEOUTS.SCREEN_APPEARS);
  }

  /**
   * Populates form input and picklist fields with provided Lead data attributes.
   *
   * @param lead - Partial LeadData object containing fields to fill
   */
  async fillForm(lead: Partial<LeadData>): Promise<void> {
    this.log.info('Populating Lead form fields', { company: lead.company });

    const textBoxes = [
      [this.firstNameBox, lead.firstName],
      [this.lastNameBox, lead.lastName],
      [this.textField(LEAD_FIELDS.COMPANY).first(), lead.company],
      [this.textField(LEAD_FIELDS.EMAIL).first(), lead.email],
      [this.textField(LEAD_FIELDS.PHONE).first(), lead.phone],
      [this.textField(LEAD_FIELDS.TITLE).first(), lead.title]
    ] as const;

    for (const [box, value] of textBoxes) {
      if (value !== undefined) {
        await this.fill(box, value);
      }
    }

    if (lead.leadSource !== undefined) {
      await this.selectPicklistValue(LEAD_FIELDS.LEAD_SOURCE, lead.leadSource);
    }
  }

  /**
   * Selects a status option from the Lead Status picklist.
   *
   * @param status - Target status label (e.g. 'Working - Contacted')
   */
  async setStatus(status: string): Promise<void> {
    await this.selectPicklistValue(LEAD_FIELDS.STATUS, status);
  }

  /**
   * Submits the Lead form, handling duplicate warning dialogs if encountered.
   */
  async save(): Promise<void> {
    this.log.info('Submitting Lead form');
    await this.click(this.saveButton);
    await this.confirmSaveIfDuplicateWarned();
  }

  /**
   * Dismisses duplicate warning dialogs if prompted and re-triggers save.
   */
  private async confirmSaveIfDuplicateWarned(): Promise<void> {
    const warningDialog = this.page.getByRole('dialog', { name: 'Similar Records Exist' });
    const savedCleanly = await this.page
      .waitForURL(RECORD_PAGE_URL_PATTERN, { timeout: TIMEOUTS.SCREEN_APPEARS })
      .then(() => true)
      .catch(() => false);

    if (savedCleanly) {
      return;
    }

    const wasWarned = await this.isElementVisible(warningDialog.first(), TIMEOUTS.SCREEN_APPEARS);
    if (!wasWarned) {
      return;
    }

    this.log.info('Duplicate record warning encountered; dismissing dialog and proceeding');
    for (const closeButton of await this.page
      .getByRole('button', { name: 'Close error dialog' })
      .all()) {
      await closeButton.click({ timeout: TIMEOUTS.SCREEN_APPEARS }).catch(() => undefined);
    }

    await warningDialog
      .first()
      .waitFor({ state: 'hidden', timeout: TIMEOUTS.SCREEN_APPEARS })
      .catch(() => this.log.debug('Duplicate warning dialog still visible'));

    await this.click(this.saveButton);
  }

  /** Cancels and closes the Lead modal form without saving. */
  async cancel(): Promise<void> {
    await this.click(this.cancelButton);
  }

  /**
   * Submits the form expecting validation failure and captures field-level error messages.
   *
   * @returns Array of validation error strings displayed under fields
   */
  async saveExpectingErrors(): Promise<string[]> {
    await this.click(this.saveButton);
    return this.getFieldErrors();
  }

  /**
   * Retrieves page-level error banner message text if present.
   *
   * @returns Error banner text or empty string if not displayed
   */
  async getErrorBanner(): Promise<string> {
    return this.getElementInnerText(
      this.page.locator('records-record-edit-error, .forceFormPageError').first(),
      TIMEOUTS.SCREEN_APPEARS
    );
  }

  /**
   * Checks whether the 'Similar Records Exist' duplicate warning dialog is currently visible.
   *
   * @returns True if dialog is visible, false otherwise
   */
  async isDuplicateWarningShown(): Promise<boolean> {
    return this.isElementVisible(
      this.page.getByRole('dialog', { name: 'Similar Records Exist' }).first(),
      TIMEOUTS.SCREEN_APPEARS
    );
  }

  /**
   * Retrieves text from the duplicate warning dialog.
   *
   * @returns Warning dialog text or empty string if not displayed
   */
  async getDuplicateWarningText(): Promise<string> {
    return this.getElementInnerText(
      this.page.getByRole('dialog', { name: 'Similar Records Exist' }).first(),
      TIMEOUTS.SCREEN_APPEARS
    );
  }
}
