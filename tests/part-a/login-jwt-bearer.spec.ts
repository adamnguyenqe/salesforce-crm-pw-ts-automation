import { env } from '@config';
import { HOME_PAGE_PATH, LIGHTNING_URL_PATTERN, Tags } from '@constants';
import { ANONYMOUS, expect, test } from '@fixtures';
import { hideSecretFromUrl } from '@pages';

/**
 * Part A: Salesforce OAuth 2.0 JWT Bearer flow authentication tests.
 */

test.describe.configure({ mode: 'serial' });
test.use({ storageState: ANONYMOUS });

const EXPECTED_LOGIN_URL =
  `${env.instanceUrl}/secur/frontdoor.jsp?sid=***` +
  `&retURL=${encodeURIComponent(HOME_PAGE_PATH)}`;

let loginUrlFromFirstTest: string;

test(
  'TC01: Authenticates via JWT assertion and verifies redirection to home page',
  { tag: [Tags.PART_A, Tags.JWT] },
  async ({ page, loginPage, homePage }) => {
    loginUrlFromFirstTest = hideSecretFromUrl(await loginPage.loginViaJWT());
    await homePage.waitUntilHomePageLoaded();

    expect(loginUrlFromFirstTest).toBe(EXPECTED_LOGIN_URL);

    await expect(page).toHaveURL(LIGHTNING_URL_PATTERN);
    await expect(homePage.searchButton).toBeVisible();
    await expect(homePage.appLauncherButton).toBeVisible();
  }
);

test(
  'TC02: Re-authenticates successfully via JWT after session is cleared',
  { tag: [Tags.PART_A, Tags.JWT] },
  async ({ page, loginPage, homePage }) => {
    await loginPage.clearSession();

    const secondLoginUrl = hideSecretFromUrl(await loginPage.loginViaJWT());
    await homePage.waitUntilHomePageLoaded();

    // Verify token consistency while assertion window remains active.
    expect(secondLoginUrl).toBe(loginUrlFromFirstTest);

    await expect(page).toHaveURL(LIGHTNING_URL_PATTERN);
    await expect(homePage.searchButton).toBeVisible();
    await expect(homePage.appLauncherButton).toBeVisible();
  }
);
