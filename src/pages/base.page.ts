import type { Locator, Page } from '@playwright/test';

import { TIMEOUTS } from '@constants';
import { logger, waitUntilElementVisible } from '@utils';

/**
 * Heading container selectors rendered on Salesforce record pages.
 */
export const RECORD_TITLE_SELECTOR = 'records-highlights-details-item, records-entity-label';

/**
 * Common foundation class providing shared locators and interactions for Salesforce Lightning pages.
 */
export abstract class BasePage {
  protected readonly log = logger(this.constructor.name);

  constructor(protected readonly page: Page) {}

  // ── Common Controls ────────────────────────────────────────────────────────

  /** Primary Save button rendered on Lightning forms and inline editors. */
  protected get saveButton(): Locator {
    return this.page.getByRole('button', { name: 'Save', exact: true });
  }

  // ── Field Locators ─────────────────────────────────────────────────────────

  /**
   * Locates a Salesforce record field container by its API name.
   *
   * @param apiName - Field API name with object prefix (e.g. 'Lead.LeadSource')
   * @returns Field wrapper Locator
   */
  protected field(apiName: string): Locator {
    return this.page.locator(`[data-target-selection-name="sfdc:RecordField.${apiName}"]`);
  }

  /**
   * Locates an input or textarea element within a field container.
   *
   * @param apiName - Field API name (e.g. 'Lead.Company')
   * @returns Input Locator
   */
  protected textField(apiName: string): Locator {
    return this.field(apiName).locator('input, textarea');
  }

  /**
   * Locates the combobox trigger element for a Salesforce picklist field.
   *
   * @param apiName - Field API name (e.g. 'Lead.LeadSource')
   * @returns Combobox trigger Locator
   */
  protected picklistTrigger(apiName: string): Locator {
    return this.field(apiName).locator('[role="combobox"]');
  }

  /**
   * Locates the static text element displaying a field value in record view.
   *
   * @param apiName - Field API name (e.g. 'Lead.Company')
   * @returns Field value Locator
   */
  protected fieldValue(apiName: string): Locator {
    return this.field(apiName).locator('.slds-form-element__static');
  }

  /**
   * Selects an option from a Salesforce Lightning picklist combobox.
   * Handles dynamic popover rendering outside the combobox DOM subtree.
   *
   * @param apiName - Field API name (e.g. 'Lead.LeadSource')
   * @param value - Option label to select (e.g. 'Web')
   */
  protected async selectPicklistValue(apiName: string, value: string): Promise<void> {
    this.log.debug('Selecting picklist option', { apiName, value });

    await this.click(this.picklistTrigger(apiName).first());
    const scopedOption = this.field(apiName).getByRole('option', { name: value, exact: true });
    const option = (await scopedOption.count())
      ? scopedOption.first()
      : this.page.getByRole('option', { name: value, exact: true }).first();
    await this.click(option);

    await this.picklistTrigger(apiName)
      .first()
      .getByText(value, { exact: true })
      .waitFor({ state: 'visible', timeout: TIMEOUTS.SCREEN_APPEARS })
      .catch(() => this.log.debug('Picklist did not echo the value back', { apiName }));
  }

  /**
   * Retrieves the currently selected label of a picklist combobox.
   *
   * @param apiName - Field API name (e.g. 'Lead.Status')
   * @returns Selected value string, or empty string if unselected
   */
  protected async getPicklistValue(apiName: string): Promise<string> {
    return this.getElementInnerText(this.picklistTrigger(apiName).first(), TIMEOUTS.SCREEN_APPEARS);
  }

  // ── Modals & Notifications ─────────────────────────────────────────────────

  /**
   * Locates the active SLDS modal container.
   * Uses `.slds-modal` to avoid targeting invisible background dialog containers.
   */
  protected get modal(): Locator {
    return this.page.locator('.slds-modal').last();
  }

  /**
   * Retrieves notification toast text if currently displayed.
   *
   * @returns Notification message text, or empty string if absent
   */
  protected async getToastMessage(): Promise<string> {
    return this.getElementInnerText(
      this.page.locator('.slds-notify, [role="status"]').first(),
      TIMEOUTS.SCREEN_APPEARS
    );
  }

  /**
   * Retrieves visible validation error messages displayed under individual fields.
   *
   * @returns Array of trimmed error message strings
   */
  protected async getFieldErrors(): Promise<string[]> {
    const errors = this.page.locator('.slds-form-element__help');
    await errors
      .first()
      .waitFor({ state: 'visible', timeout: TIMEOUTS.SCREEN_APPEARS })
      .catch(() => this.log.debug('No field errors appeared'));

    const messages = await errors.allInnerTexts();
    return messages.map((message) => message.trim()).filter(Boolean);
  }

  // ── Synchronization ────────────────────────────────────────────────────────

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

  // ── Navigation ─────────────────────────────────────────────────────────────

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

  // ── Basic Interactions ─────────────────────────────────────────────────────

  /**
   * Determines whether an element is visible within a given timeout.
   *
   * @param element - Target Locator
   * @param timeout - Maximum duration to wait in milliseconds
   * @returns Promise resolving to true if visible, false otherwise
   */
  protected async isElementVisible(element: Locator, timeout: number): Promise<boolean> {
    return element
      .first()
      .waitFor({ state: 'visible', timeout })
      .then(() => true)
      .catch(() => false);
  }

  /**
   * Retrieves trimmed innerText from an element if it becomes visible.
   *
   * @param element - Target Locator
   * @param timeout - Maximum duration to wait in milliseconds
   * @returns Trimmed text content or empty string if element is not visible
   */
  protected async getElementInnerText(element: Locator, timeout: number): Promise<string> {
    const elementAppeared = await this.isElementVisible(element, timeout);
    if (!elementAppeared) {
      return '';
    }
    return (await element.innerText()).trim();
  }

  /**
   * Clicks an element with automatic fallback to force-click if an overlay intercepts.
   *
   * @param element - Target Locator to click
   */
  protected async click(element: Locator): Promise<void> {
    await waitUntilElementVisible(element);

    try {
      await element.click({ timeout: TIMEOUTS.SCREEN_APPEARS });
    } catch {
      this.log.warn('Click was blocked, retrying with force click');
      await element.focus();
      // eslint-disable-next-line playwright/no-force-option -- last resort when a Salesforce overlay intercepts the click
      await element.click({ timeout: TIMEOUTS.SCREEN_APPEARS, force: true });
    }
  }

  /**
   * Clears an input element and verifies that its DOM value attribute is empty.
   *
   * @param element - Target input Locator
   */
  protected async clearInputElementAndWait(element: Locator): Promise<void> {
    const inputElement = element.first();
    await inputElement.clear();

    await this.page
      .waitForFunction(
        (node) => (node as HTMLInputElement | HTMLTextAreaElement).value === '',
        await inputElement.elementHandle(),
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
