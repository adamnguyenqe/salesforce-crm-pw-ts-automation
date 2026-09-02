import type { Locator } from '@playwright/test';

import { TIMEOUTS } from '@constants';

/**
 * Waits until the specified Locator element reaches visible state.
 *
 * @param element - Target Playwright Locator
 * @param timeout - Maximum duration to wait in milliseconds
 */
export async function waitUntilElementVisible(
  element: Locator,
  timeout: number = TIMEOUTS.DEFAULT_TIMEOUT
): Promise<void> {
  await element.waitFor({ state: 'visible', timeout });
}

/**
 * Pauses execution for a specified duration.
 * Use sparingly for asynchronous external dependencies (e.g. email delivery).
 *
 * @param milliseconds - Pause duration in milliseconds
 * @returns Promise that resolves after the specified duration
 */
export function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
