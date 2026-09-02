import type { Locator, Page } from '@playwright/test';

import { TIMEOUTS } from '@constants';
import { logger, waitUntilElementVisible } from '@utils';

/** Primary record header selector for Salesforce Lightning record pages. */
export const RECORD_TITLE_SELECTOR = 'records-highlights-details-item, records-entity-label';

/** Retry budget for picklist selections that Lightning fails to commit. */
const PICKLIST_ATTEMPTS = 3;

/**
 * Base page object providing shared locators, waits, and interactions
 * across Salesforce Lightning record and modal pages.
 */
export abstract class BasePage {
  protected readonly log = logger(this.constructor.name);

  constructor(protected readonly page: Page) {}

  // Controls & Form Actions

  /** Primary Save button on Lightning forms and modals. */
  protected get saveButton(): Locator {
    return this.page.getByRole('button', { name: 'Save', exact: true });
  }

  // Field Locators

  /**
   * Locates a Salesforce record field container by its API name.
   *
   * @param apiName - Field API name with object prefix (e.g. 'Lead.LeadSource')
   */
  protected field(apiName: string): Locator {
    return this.page.locator(`[data-target-selection-name="sfdc:RecordField.${apiName}"]`);
  }

  /**
   * Locates an input or textarea within a field container.
   *
   * @param apiName - Field API name (e.g. 'Lead.Company')
   */
  protected textField(apiName: string): Locator {
    return this.field(apiName).locator('input, textarea');
  }

  /**
   * Locates the combobox trigger element for a picklist field.
   *
   * @param apiName - Field API name (e.g. 'Lead.LeadSource')
   */
  protected picklistTrigger(apiName: string): Locator {
    return this.field(apiName).locator('[role="combobox"]');
  }

  /**
   * Locates the static text element displaying a field value in detail view.
   *
   * @param apiName - Field API name (e.g. 'Lead.Company')
   */
  protected fieldValue(apiName: string): Locator {
    return this.field(apiName).locator('.slds-form-element__static');
  }

  /**
   * Selects an option from a Salesforce Lightning picklist combobox.
   * Handles options rendered within the field or portalled to the body.
   *
   * @param apiName - Field API name (e.g. 'Lead.LeadSource')
   * @param value - Option label to select
   */
  protected async selectPicklistValue(apiName: string, value: string): Promise<void> {
    this.log.debug('Selecting picklist option', { apiName, value });

    const trigger = this.picklistTrigger(apiName).first();

    for (let attempt = 1; attempt <= PICKLIST_ATTEMPTS; attempt++) {
      await this.click(trigger);

      // Lightning renders picklist options lazily: the listbox exists but stays empty
      // until the trigger is actually expanded. Waiting on aria-expanded prevents the
      // option lookup from falling through to another field's open dropdown.
      const expanded = await trigger
        .and(this.page.locator('[aria-expanded="true"]'))
        .waitFor({ state: 'visible', timeout: TIMEOUTS.SCREEN_APPEARS })
        .then(() => true)
        .catch(() => false);

      if (!expanded) {
        this.log.info('Picklist trigger did not expand, retrying', { apiName, attempt });
        continue;
      }

      // Scope options to this combobox's own listbox, which it owns via aria-controls.
      const listboxId = await trigger.getAttribute('aria-controls');
      const option = listboxId
        ? this.page.locator(`[id="${listboxId}"]`).getByRole('option', { name: value, exact: true })
        : this.field(apiName).getByRole('option', { name: value, exact: true });

      await this.click(option.first());

      const echoed = await trigger
        .getByText(value, { exact: true })
        .waitFor({ state: 'visible', timeout: TIMEOUTS.SCREEN_APPEARS })
        .then(() => true)
        .catch(() => false);

      if (echoed) {
        return;
      }

      this.log.info('Picklist did not echo value back, retrying selection', {
        apiName,
        value,
        attempt
      });
    }

    throw new Error(
      `Picklist '${apiName}' did not reflect selected value '${value}' after ` +
        `${PICKLIST_ATTEMPTS} attempts; current value: '${await this.getPicklistValue(apiName)}'`
    );
  }

  /**
   * Retrieves the currently selected label of a picklist combobox.
   *
   * @param apiName - Field API name (e.g. 'Lead.Status')
   * @returns Currently selected option label string
   */
  protected async getPicklistValue(apiName: string): Promise<string> {
    return this.getElementInnerText(this.picklistTrigger(apiName).first(), TIMEOUTS.SCREEN_APPEARS);
  }

  // Modals & Dialogs

  /** Active modal container. */
  protected get modal(): Locator {
    return this.page.locator('.slds-modal').last();
  }

  /** The 'Similar Records Exist' duplicate-rule warning dialog. */
  protected get duplicateWarningDialog(): Locator {
    return this.page.getByRole('dialog', { name: 'Similar Records Exist' });
  }

  /**
   * Dismisses the 'Similar Records Exist' dialog if present, unblocking the Save button.
   *
   * @param timeout - Maximum duration to check for dialog visibility
   * @returns True if the dialog appeared and was dismissed, false otherwise
   */
  protected async dismissDuplicateWarning(
    timeout: number = TIMEOUTS.SCREEN_APPEARS
  ): Promise<boolean> {
    const isVisible = await this.isElementVisible(this.duplicateWarningDialog.first(), timeout);
    if (!isVisible) {
      return false;
    }

    this.log.info('Dismissing duplicate warning dialog');
    const closeButtons = await this.page.getByRole('button', { name: 'Close error dialog' }).all();

    for (const btn of closeButtons) {
      await btn.click({ timeout: TIMEOUTS.SCREEN_APPEARS }).catch(() => undefined);
    }

    await this.duplicateWarningDialog
      .first()
      .waitFor({ state: 'hidden', timeout: TIMEOUTS.SCREEN_APPEARS })
      .catch(() => this.log.debug('Duplicate dialog still visible after dismiss attempt'));

    return true;
  }

  /**
   * Retrieves notification toast message text if currently visible.
   *
   * @returns Toast message text or empty string if not visible
   */
  protected async getToastMessage(): Promise<string> {
    return this.getElementInnerText(
      this.page.locator('.slds-notify, [role="status"]').first(),
      TIMEOUTS.SCREEN_APPEARS
    );
  }

  /**
   * Retrieves visible validation error messages under form fields.
   *
   * @returns Array of validation error strings
   */
  protected async getFieldErrors(): Promise<string[]> {
    const errors = this.page.locator('.slds-form-element__help');
    await errors
      .first()
      .waitFor({ state: 'visible', timeout: TIMEOUTS.SCREEN_APPEARS })
      .catch(() => this.log.debug('No field errors appeared'));

    const messages = await errors.allInnerTexts();
    return messages.map((m) => m.trim()).filter(Boolean);
  }

  // Synchronization & Navigation

  /**
   * Waits until all active Lightning spinners have finished and disappeared.
   *
   * @param timeout - Maximum wait duration in milliseconds
   */
  protected async waitUntilIdle(timeout: number = TIMEOUTS.SALESFORCE_LOADING): Promise<void> {
    const spinners = this.page.locator('lightning-spinner, .slds-spinner_container');

    await spinners
      .last()
      .waitFor({ state: 'hidden', timeout })
      .catch(() => this.log.debug('Spinners did not clear in time; carrying on'));
  }

  /**
   * Navigates to a Lightning URL path and waits for DOM stabilization.
   *
   * @param path - Target relative path (e.g. '/lightning/o/Lead/list')
   */
  protected async goToPath(path: string): Promise<void> {
    const destination = new URL(path, this.currentUrl).toString();

    try {
      await this.page.goto(destination, { waitUntil: 'domcontentloaded' });
    } catch (error) {
      const wasIntercepted = String(error).includes('ERR_ABORTED');
      if (!wasIntercepted) {
        throw error;
      }

      this.log.debug('Lightning router intercepted navigation; waiting to settle', { path });
      await this.page.waitForURL((url) => url.pathname.startsWith(path), {
        timeout: TIMEOUTS.SALESFORCE_LOADING
      });
    }
  }

  // Basic Interactions

  /**
   * Checks whether an element is visible within a given timeout.
   *
   * @param element - Target Locator
   * @param timeout - Maximum duration in milliseconds
   * @returns True if element became visible within timeout, false otherwise
   */
  protected async isElementVisible(element: Locator, timeout: number): Promise<boolean> {
    return element
      .first()
      .waitFor({ state: 'visible', timeout })
      .then(() => true)
      .catch(() => false);
  }

  /**
   * Retrieves trimmed innerText from an element if visible.
   *
   * @param element - Target Locator
   * @param timeout - Maximum duration in milliseconds
   * @returns Trimmed inner text, or empty string if element is not visible
   */
  protected async getElementInnerText(element: Locator, timeout: number): Promise<string> {
    const isVisible = await this.isElementVisible(element, timeout);
    if (!isVisible) {
      return '';
    }
    return (await element.innerText()).trim();
  }

  /**
   * Clicks an element with automatic fallback to force-click if blocked by an overlay.
   *
   * @param element - Target Locator to click
   */
  protected async click(element: Locator): Promise<void> {
    await waitUntilElementVisible(element);

    try {
      await element.click({ timeout: TIMEOUTS.SCREEN_APPEARS });
    } catch {
      this.log.warn('Click was blocked, retrying with force click');
      // Bound focus timeout so stale elements during re-renders don't block the retry
      await element.focus({ timeout: TIMEOUTS.SCREEN_APPEARS }).catch(() => undefined);
      // eslint-disable-next-line playwright/no-force-option -- last resort when a Salesforce overlay intercepts the click
      await element.click({ timeout: TIMEOUTS.SCREEN_APPEARS, force: true });
    }
  }

  /**
   * Clears an input element and verifies that its DOM value attribute is empty.
   *
   * @param element - Target input Locator
   */
  protected async clearInput(element: Locator): Promise<void> {
    const input = element.first();
    await input.clear();

    await this.page
      .waitForFunction(
        (node) => (node as HTMLInputElement | HTMLTextAreaElement).value === '',
        await input.elementHandle(),
        { timeout: TIMEOUTS.SCREEN_APPEARS }
      )
      .catch(() => this.log.debug('Input did not empty in time; carrying on'));
  }

  /**
   * Clears and enters text into an input or textarea element.
   *
   * @param element - Target input Locator
   * @param value - Text value to enter
   */
  protected async fill(element: Locator, value: string): Promise<void> {
    await waitUntilElementVisible(element);
    await element.clear();
    await element.fill(value);
  }

  /** Current browser page URL. */
  get currentUrl(): string {
    return this.page.url();
  }
}
