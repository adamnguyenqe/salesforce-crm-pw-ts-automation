import { env } from '@config';
import { HOME_PAGE_PATH, LIGHTNING_URL_PATTERN, Tags, TIMEOUTS } from '@constants';
import { ANONYMOUS, expect, test } from '@fixtures';
import { LoginPage } from '@pages';

/**
 * PART A — Logging in with a username, a password, and an emailed code.
 *
 * WARNING: Salesforce only sends a limited number of OTP emails.
 * => Run these tests in serial, never in parallel.
 */

test.describe.configure({ mode: 'serial' });

/** Start with blank state. */
test.use({ storageState: ANONYMOUS });

/** Where the first test saves its login, for the second test to reuse. */
const SAVED_LOGIN_FILE = '.auth/storageState.json';

/** Shown when Salesforce lets us in without asking us to log in. */
const FORM_WAS_SKIPPED =
  'Salesforce skipped the login form, so this test never actually logged in. ' +
  'That usually means it still recognises this computer.';

/** Shown when Salesforce trusts the computer and sends no code. */
const NO_CODE_WAS_ASKED_FOR =
  'Salesforce did not ask for an emailed code, so the part this test exists ' +
  'to check never happened.';

test(
  'logs in with a username, password and emailed code',
  { tag: [Tags.PART_A, Tags.OTP] },
  async ({ page, context, loginPage, homePage, mailbox }) => {
    test.setTimeout(TIMEOUTS.DEFAULT_E2E_FLOW);

    await loginPage.open();
    await loginPage.clearSession();

    const loginFormAppeared = await loginPage.open();
    expect(loginFormAppeared, FORM_WAS_SKIPPED).toBe(true);

    await loginPage.loginViaUsername(env.sfUsername, env.sfPassword, () =>
      mailbox.rememberCurrentInbox()
    );
    expect(await loginPage.getLoginErrorText()).toBe('');

    const salesforceAskedForACode = await loginPage.isAskingForEmailCode();
    expect(salesforceAskedForACode, NO_CODE_WAS_ASKED_FOR).toBe(true);

    const code = await mailbox.waitForNewCode();
    await loginPage.enterEmailCode(code);
    expect(await loginPage.getLoginErrorText()).toBe('');

    await homePage.waitUntilHomePageLoaded();

    await expect(page).toHaveURL(LIGHTNING_URL_PATTERN);
    await expect(homePage.searchButton).toBeVisible();
    await expect(homePage.appLauncherButton).toBeVisible();

    // Save the login so the next test can reuse the session and cookies.
    await context.storageState({ path: SAVED_LOGIN_FILE });
  }
);

test(
  'reuses the saved login without needing a second code',
  { tag: [Tags.PART_A, Tags.OTP] },
  async ({ browser }) => {
    // Create new context to make sure storageState is saved and can be reuse.
    const browserWithSavedLogin = await browser.newContext({
      storageState: SAVED_LOGIN_FILE
    });
    const page = await browserWithSavedLogin.newPage();

    await page.goto(`${env.instanceUrl}${HOME_PAGE_PATH}`, {
      waitUntil: 'domcontentloaded'
    });

    await expect(page).toHaveURL(LIGHTNING_URL_PATTERN);

    // If the saved login had not worked, Salesforce would be showing the login
    // form, so the username box would be on the page.
    await expect(new LoginPage(page).usernameBox).toHaveCount(0);

    await browserWithSavedLogin.close();
  }
);
