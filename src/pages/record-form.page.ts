import {
  ACCOUNT_FIELDS,
  CONTACT_FIELDS,
  extractRecordIdFromUrl,
  FIELD_LABELS,
  RECORD_PAGE_URL_PATTERN,
  TIMEOUTS
} from '@constants';

import { BasePage, RECORD_TITLE_SELECTOR } from './base.page';

const LOOKUP_ATTEMPTS = 6;

/**
 * Page object representing Salesforce generic new record modal forms (e.g. Account, Contact).
 */
export class RecordFormPage extends BasePage {
  /**
   * Creates an Account record via UI modal form.
   *
   * @param accountName - Name of the Account to create
   * @returns Newly created 18-character Account record ID
   */
  async createAccount(accountName: string): Promise<string> {
    this.log.info('Creating Account via UI form', { accountName });

    await this.openNewRecordForm('Account');
    await this.fill(this.textField(ACCOUNT_FIELDS.NAME).first(), accountName);
    return this.saveAndReadId();
  }

  /**
   * Creates a Contact record via UI modal form.
   *
   * @param details - Contact attributes including firstName, lastName, email, and optional accountName
   * @returns Newly created 18-character Contact record ID
   */
  async createContact(details: {
    firstName: string;
    lastName: string;
    email: string;
    accountName?: string;
  }): Promise<string> {
    this.log.info('Creating Contact via UI form', { lastName: details.lastName });
    await this.openNewRecordForm('Contact');
    await this.fill(this.textField(CONTACT_FIELDS.NAME).first(), details.firstName);
    await this.fill(this.textField(CONTACT_FIELDS.NAME).last(), details.lastName);
    await this.fill(this.textField(CONTACT_FIELDS.EMAIL).first(), details.email);
    if (details.accountName) {
      await this.selectLookup(
        CONTACT_FIELDS.ACCOUNT,
        FIELD_LABELS.ACCOUNT_NAME,
        details.accountName
      );
    }

    return this.saveAndReadId();
  }

  /**
   * Opens the new record creation modal for a specified sObject.
   *
   * @param objectName - sObject API name (e.g. 'Account', 'Contact')
   */
  private async openNewRecordForm(objectName: string): Promise<void> {
    await this.goToPath(`/lightning/o/${objectName}/new`);
    await this.modal.waitFor({ state: 'visible', timeout: TIMEOUTS.SALESFORCE_LOADING });
  }

  /**
   * Searches and selects an item from a Salesforce lookup combobox field.
   *
   * @param apiName - Lookup field API name (e.g. 'Contact.AccountId')
   * @param fieldLabel - Display label of the lookup combobox
   * @param recordName - Target record name to select from options
   */
  private async selectLookup(
    apiName: string,
    fieldLabel: string,
    recordName: string
  ): Promise<void> {
    const lookupInput = this.field(apiName).getByRole('combobox', { name: fieldLabel }).first();
    for (let attempt = 1; attempt <= LOOKUP_ATTEMPTS; attempt++) {
      await this.fill(lookupInput, recordName);

      const suggestion = this.page.getByRole('option', { name: recordName, exact: true });
      const suggestionAppeared = await this.isElementVisible(
        suggestion.first(),
        TIMEOUTS.SCREEN_APPEARS
      );

      if (suggestionAppeared) {
        // Salesforce re-renders the dropdown as debounced search results land, so a
        // located option can go stale before it is clicked. Treat a failed click as
        // a retryable outcome rather than letting it fail the whole test.
        const clicked = await this.click(suggestion.first())
          .then(() => true)
          .catch(() => false);

        if (clicked) {
          return;
        }

        this.log.debug('Lookup option went stale before it could be clicked; retrying', {
          apiName,
          attempt
        });
      } else {
        this.log.debug('Lookup option not found, retrying search', { apiName, attempt });
      }
      await this.clearInput(lookupInput);
    }

    throw new Error(
      `Lookup failed: "${recordName}" did not appear in ${fieldLabel} options after ${LOOKUP_ATTEMPTS} attempts.`
    );
  }

  /**
   * Submits the record form and extracts the generated record ID from the redirection URL.
   *
   * @returns 18-character Salesforce record ID
   */
  private async saveAndReadId(): Promise<string> {
    // A duplicate rule can raise 'Similar Records Exist' as soon as the form is
    // filled, overlaying the Save button before it is ever clicked.
    await this.dismissDuplicateWarning(TIMEOUTS.SMALL_TIMEOUT);
    await this.click(this.saveButton);

    // The same dialog can also appear in response to the save itself. Only look for
    // it when the save did not navigate, so a clean save costs no extra wait.
    const savedCleanly = await this.page
      .waitForURL(RECORD_PAGE_URL_PATTERN, { timeout: TIMEOUTS.SCREEN_APPEARS })
      .then(() => true)
      .catch(() => false);

    if (!savedCleanly) {
      if (await this.dismissDuplicateWarning()) {
        await this.click(this.saveButton);
      }
      await this.page.waitForURL(RECORD_PAGE_URL_PATTERN, {
        timeout: TIMEOUTS.SALESFORCE_LOADING
      });
    }

    const recordId = extractRecordIdFromUrl(this.currentUrl);
    if (!recordId) {
      throw new Error(`Failed to extract record ID after saving form: ${this.currentUrl}`);
    }

    await this.waitUntilIdle();
    await this.page
      .locator(RECORD_TITLE_SELECTOR)
      .first()
      .waitFor({ state: 'visible', timeout: TIMEOUTS.SALESFORCE_LOADING })
      .catch(() => this.log.debug('Record header did not stabilize in time; continuing'));

    this.log.info('Record created successfully', { recordId });
    return recordId;
  }
}
