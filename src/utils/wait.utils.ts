import type { Locator } from '@playwright/test';

import { TIMEOUTS } from '@constants';

/** Waiting for something to happen. */

/**
 * Wait until an element is visible.
 *
 * Visible, not just present: Salesforce adds elements to the page before they
 * can be clicked, and clicking too early fails.
 *
 * @param element - The element to wait for
 * @param timeout - How long to wait before failing, in milliseconds
 */
export async function waitUntilElementVisible(
  element: Locator,
  timeout: number = TIMEOUTS.DEFAULT_TIMEOUT
): Promise<void> {
  await element.waitFor({ state: 'visible', timeout });
}

/**
 * Pause for a fixed time.
 *
 * ONLY for waiting on something outside our control, such as an email being
 * delivered. Never use it to "fix" a flaky test — wait for the thing you
 * actually need with waitUntilElementVisible() instead, or the suite gets slower
 * every time someone reaches for this.
 *
 * @param milliseconds - How long to pause
 */
export function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
