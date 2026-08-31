import type { Locator, Page } from '@playwright/test';

import { TIMEOUTS } from '@constants';
import { logger, waitUntilElementVisible } from '@utils';

/**
 * Shared helpers for every page class.
 *
 * Everything a page class needs to read or act on an element lives here, so a
 * page class only has to describe its own screen.
 */
export abstract class BasePage {
  protected readonly log = logger(this.constructor.name);

  constructor(protected readonly page: Page) {}

  /**
   * Check whether an element is visible.
   *
   * @param element - The element to look for
   * @param timeout - How long to wait before giving up, in milliseconds
   * @returns True if the element appeared in time, false if it did not
   */
  protected async isElementVisible(element: Locator, timeout: number): Promise<boolean> {
    return element.isVisible({ timeout }).catch(() => false);
  }

  /**
   * Get the text of an element, or an empty string if it never turned up.
   *
   * @param element - The element to read
   * @param timeout - How long to wait for it, in milliseconds
   * @returns The trimmed text, or '' if the element never appeared
   */
  protected async getElementInnerText(element: Locator, timeout: number): Promise<string> {
    const elementAppeared = await this.isElementVisible(element, timeout);
    if (!elementAppeared) {
      return '';
    }
    return (await element.innerText()).trim();
  }

  /**
   * Click an element.
   *
   * If the normal click fails, we try once more with `force`.
   *
   * @param element - The element to click
   */
  protected async click(element: Locator): Promise<void> {
    await waitUntilElementVisible(element);

    try {
      await element.click({ timeout: TIMEOUTS.SCREEN_APPEARS });
    } catch {
      this.log.warn('Click was blocked, retrying through the overlay');
      await element.focus();
      // eslint-disable-next-line playwright/no-force-option -- last resort when a Salesforce overlay intercepts the click
      await element.click({ timeout: TIMEOUTS.SCREEN_APPEARS, force: true });
    }
  }

  /**
   * Type a value into an element (textbox / textarea / etc.).
   *
   * The value is never logged: this is used for passwords and codes.
   *
   * @param element - The element to type into
   * @param value - The text to enter
   */
  protected async fill(element: Locator, value: string): Promise<void> {
    await waitUntilElementVisible(element);
    await element.clear();
    await element.fill(value);
  }

  /** @returns The browser's current web address */
  get currentUrl(): string {
    return this.page.url();
  }
}
