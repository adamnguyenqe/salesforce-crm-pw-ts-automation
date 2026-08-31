import { env } from '@config';
import { HOME_PAGE_PATH, LIGHTNING_URL_PATTERN, Tags } from '@constants';
import { ANONYMOUS, expect, test } from '@fixtures';
import { hideSecretFromUrl } from '@pages';

/**
 * PART A — Logging in with a signed certificate instead of a password.
 *
 */

/** Run these in order: the second test compares against the first one's result. */
test.describe.configure({ mode: 'serial' });

/**
 * Start with no saved login.
 *
 * This login method works fine with an existing session, so this is not needed
 * to make it succeed. It is here to make the test HONEST: starting from a
 * saved login, a broken login would still pass, because the browser would
 * already be logged in.
 */
test.use({ storageState: ANONYMOUS });

const EXPECTED_LOGIN_URL =
  `${env.instanceUrl}/secur/frontdoor.jsp?sid=***` +
  `&retURL=${encodeURIComponent(HOME_PAGE_PATH)}`;

let loginUrlFromFirstTest: string;

test(
  'logs in with a signed certificate and lands in Salesforce',
  { tag: [Tags.PART_A, Tags.JWT] },
  async ({ page, loginPage, homePage }) => {
    loginUrlFromFirstTest = hideSecretFromUrl(await loginPage.loginViaJWT());
    await homePage.waitUntilHomePageLoaded();

    expect(loginUrlFromFirstTest).toBe(EXPECTED_LOGIN_URL);

    // We are logged in if we reached Salesforce and both top-bar buttons show.
    await expect(page).toHaveURL(LIGHTNING_URL_PATTERN);
    await expect(homePage.searchButton).toBeVisible();
    await expect(homePage.appLauncherButton).toBeVisible();
  }
);

test(
  'can log in a second time after the first login is cleared',
  { tag: [Tags.PART_A, Tags.JWT] },
  async ({ page, loginPage, homePage }) => {
    await loginPage.clearSession();

    const secondLoginUrl = hideSecretFromUrl(await loginPage.loginViaJWT());
    await homePage.waitUntilHomePageLoaded();

    // The address should be exactly the same as the first time. Salesforce
    // gives back the same token while the old one is still valid, which is
    // what lets several tests log in side by side without disturbing each
    // other.
    expect(secondLoginUrl).toBe(loginUrlFromFirstTest);

    await expect(page).toHaveURL(LIGHTNING_URL_PATTERN);
    await expect(homePage.searchButton).toBeVisible();
    await expect(homePage.appLauncherButton).toBeVisible();
  }
);
