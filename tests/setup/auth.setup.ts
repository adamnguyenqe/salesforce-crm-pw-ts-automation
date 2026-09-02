import * as fs from 'fs';
import * as path from 'path';

import { HOME_PAGE_PATH, LIGHTNING_URL_PATTERN, SAVED_LOGIN_FILE, TIMEOUTS } from '@constants';
import { expect, test as setup } from '@fixtures';
import { HomePage, LoginPage } from '@pages';

/**
 * Authenticates once via JWT Bearer flow and persists storageState for test projects.
 */

/**
 * Validates whether an existing storageState session remains authenticated.
 *
 * @param page - Playwright Page initialized with existing storageState
 * @returns Promise resolving to true if active session is verified
 */
async function isExistingSessionValid(page: import('@playwright/test').Page): Promise<boolean> {
  const loginPage = new LoginPage(page);

  await page.goto(HOME_PAGE_PATH, {
    waitUntil: 'domcontentloaded',
    timeout: TIMEOUTS.NAVIGATION
  });

  const isLoginPromptVisible = (await loginPage.usernameBox.count()) > 0;
  return !isLoginPromptVisible && LIGHTNING_URL_PATTERN.test(page.url());
}

setup('Authenticate and persist storageState session', async ({ browser }) => {
  const savedLoginPath = path.resolve(SAVED_LOGIN_FILE);
  const sessionFileExists = fs.existsSync(savedLoginPath);

  if (sessionFileExists) {
    const context = await browser.newContext({ storageState: savedLoginPath });
    const page = await context.newPage();

    const isSessionActive = await isExistingSessionValid(page).catch(() => false);
    await context.close();

    if (isSessionActive) {
      setup
        .info()
        .annotations.push({ type: 'auth', description: 'Reused existing storageState session' });
      return;
    }
  }

  const context = await browser.newContext();
  const page = await context.newPage();

  const loginPage = new LoginPage(page);
  const homePage = new HomePage(page);

  await loginPage.loginViaJWT();
  await homePage.waitUntilHomePageLoaded();
  await expect(page).toHaveURL(LIGHTNING_URL_PATTERN);

  fs.mkdirSync(path.dirname(savedLoginPath), { recursive: true });
  await context.storageState({ path: savedLoginPath });
  await context.close();

  setup.info().annotations.push({
    type: 'auth',
    description: sessionFileExists
      ? 'Re-authenticated after session expiration'
      : 'Initial authentication complete'
  });
});
