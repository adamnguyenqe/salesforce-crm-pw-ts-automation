import { env } from '@config';
import {
  HOME_PAGE_PATH,
  LIGHTNING_URL_PATTERN,
  SAVED_LOGIN_FILE,
  Tags,
  TIMEOUTS
} from '@constants';
import { ANONYMOUS, expect, test } from '@fixtures';
import { LoginPage } from '@pages';

/**
 * Part A: Salesforce UI authentication using username, password, and email OTP verification.
 * Note: Executed serially to avoid Salesforce email OTP rate limits.
 */

test.describe.configure({ mode: 'serial' });

// Initialize with clean session state.
test.use({ storageState: ANONYMOUS });

const FORM_WAS_SKIPPED = 'Expected login form to be displayed.';
const NO_CODE_WAS_ASKED_FOR = 'Expected Salesforce identity verification (OTP) prompt.';

test(
  'TC01: Authenticates with username, password, and email verification code',
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

    // Persist storageState for subsequent session reuse.
    await context.storageState({ path: SAVED_LOGIN_FILE });
  }
);

test(
  'TC02: Reuses persisted storageState session without prompting for verification',
  { tag: [Tags.PART_A, Tags.OTP] },
  async ({ browser }) => {
    // Validate that persisted storageState grants authenticated access.
    const browserWithSavedLogin = await browser.newContext({
      storageState: SAVED_LOGIN_FILE
    });
    const page = await browserWithSavedLogin.newPage();

    await page.goto(`${env.instanceUrl}${HOME_PAGE_PATH}`, {
      waitUntil: 'domcontentloaded'
    });

    await expect(page).toHaveURL(LIGHTNING_URL_PATTERN);

    // Verify user is not redirected back to the login form.
    await expect(new LoginPage(page).usernameBox).toHaveCount(0);

    await browserWithSavedLogin.close();
  }
);
