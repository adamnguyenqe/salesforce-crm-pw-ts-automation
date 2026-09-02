import { env } from '@config';
import { HOME_PAGE_PATH, LIGHTNING_URL_PATTERN, Tags } from '@constants';
import { ANONYMOUS, expect, test } from '@fixtures';
import { hideSecretFromUrl } from '@pages';

test.describe.configure({ mode: 'serial' });
test.use({ storageState: ANONYMOUS });

const EXPECTED_FRONTDOOR_URL =
  `${env.instanceUrl}/secur/frontdoor.jsp?sid=***` +
  `&retURL=${encodeURIComponent(HOME_PAGE_PATH)}`;

test.describe('Part A — Salesforce Login via JWT Bearer Flow', () => {
  test(
    'TC01: Authenticates via JWT assertion and verifies redirection to home page',
    { tag: [Tags.PART_A, Tags.JWT] },
    async ({ page, loginPage, homePage }) => {
      await test.step('Step 1: Authenticate to Salesforce using JWT Bearer flow', async () => {
        const frontdoorUrl = hideSecretFromUrl(await loginPage.loginViaJWT());
        await homePage.waitUntilHomePageLoaded();

        expect(frontdoorUrl).toBe(EXPECTED_FRONTDOOR_URL);
      });

      await test.step('Step 2: Validate successful login via global search bar and App Launcher', async () => {
        await expect(page).toHaveURL(LIGHTNING_URL_PATTERN);
        await expect(homePage.searchButton).toBeVisible();
        await expect(homePage.appLauncherButton).toBeVisible();
      });
    }
  );

  test(
    'TC02: Re-authenticates successfully via JWT after session is cleared',
    { tag: [Tags.PART_A, Tags.JWT] },
    async ({ page, loginPage, homePage }) => {
      await test.step('Step 1: Clear session and re-authenticate via JWT Bearer flow', async () => {
        await loginPage.clearSession();

        const frontdoorUrl = hideSecretFromUrl(await loginPage.loginViaJWT());
        await homePage.waitUntilHomePageLoaded();

        expect(frontdoorUrl).toBe(EXPECTED_FRONTDOOR_URL);
      });

      await test.step('Step 2: Validate successful login via global search bar and App Launcher', async () => {
        await expect(page).toHaveURL(LIGHTNING_URL_PATTERN);
        await expect(homePage.searchButton).toBeVisible();
        await expect(homePage.appLauncherButton).toBeVisible();
      });
    }
  );
});
