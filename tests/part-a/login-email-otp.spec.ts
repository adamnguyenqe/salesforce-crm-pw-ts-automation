import { env } from '@config';
import {
  HOME_PAGE_PATH,
  LIGHTNING_URL_PATTERN,
  savedLoginFile,
  Tags,
  TIMEOUTS
} from '@constants';
import { ANONYMOUS, expect, test } from '@fixtures';
import { LoginPage } from '@pages';

test.describe.configure({ mode: 'serial' });

/** Session cached by TC01 and replayed by TC02; kept apart from the JWT setup files. */
const OTP_LOGIN_FILE = savedLoginFile('otp');
test.use({ storageState: ANONYMOUS });

test.describe('Part A — Salesforce Login & Verification (Email OTP)', () => {
  test(
    'TC01: Authenticates with username, password, and email verification code',
    { tag: [Tags.PART_A, Tags.OTP] },
    async ({ page, context, loginPage, homePage, mailbox }) => {
      test.setTimeout(TIMEOUTS.DEFAULT_E2E_FLOW);

      await test.step('Step 1: Navigate to login page', async () => {
        const loginFormAppeared = await loginPage.open();
        expect(loginFormAppeared).toBe(true);
      });

      await test.step('Step 2: Submit username and password credentials', async () => {
        await loginPage.loginViaUsername(env.sfUsername, env.sfPassword, () =>
          mailbox.rememberCurrentInbox()
        );
        expect(await loginPage.getLoginErrorText()).toBe('');
      });

      await test.step('Step 3: Retrieve email verification code over IMAP and submit', async () => {
        const isAskingForCode = await loginPage.isAskingForEmailCode();
        expect(isAskingForCode).toBe(true);

        const code = await mailbox.waitForNewCode();
        await loginPage.enterEmailCode(code);
        expect(await loginPage.getLoginErrorText()).toBe('');

        await homePage.waitUntilHomePageLoaded();
      });

      await test.step('Step 4: Validate successful login via global search bar and App Launcher', async () => {
        await expect(page).toHaveURL(LIGHTNING_URL_PATTERN);
        await expect(homePage.searchButton).toBeVisible();
        await expect(homePage.appLauncherButton).toBeVisible();
      });

      await test.step('Step 5: Cache storageState so subsequent runs skip verification', async () => {
        await context.storageState({ path: OTP_LOGIN_FILE });
      });
    }
  );

  test(
    'TC02: Reuses persisted storageState session without prompting for verification',
    { tag: [Tags.PART_A, Tags.OTP] },
    async ({ browser }) => {
      const authContext = await browser.newContext({
        storageState: OTP_LOGIN_FILE
      });
      const page = await authContext.newPage();

      await test.step('Step 1: Open Salesforce using cached storageState', async () => {
        await page.goto(`${env.instanceUrl}${HOME_PAGE_PATH}`, {
          waitUntil: 'domcontentloaded'
        });
      });

      await test.step('Step 2: Validate cached session skips verification and accesses Lightning', async () => {
        await expect(page).toHaveURL(LIGHTNING_URL_PATTERN);
        await expect(new LoginPage(page).usernameBox).toHaveCount(0);
      });

      await authContext.close();
    }
  );
});
