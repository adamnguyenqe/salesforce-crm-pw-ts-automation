import type { Locator } from '@playwright/test';

import { env } from '@config';
import { TIMEOUTS } from '@constants';
import { buildLoggedInBrowserUrl, requestAccessToken } from '@utils';

import { BasePage } from './base.page';

/**
 * Sanitizes Salesforce frontdoor session URL for safe console logging.
 *
 * @param url - URL containing session identifier (sid parameter)
 * @returns Masked URL string with sid value redacted
 */
export function hideSecretFromUrl(url: string): string {
  return url.replace(/sid=[^&]+/, 'sid=***');
}

/**
 * Page object representing the Salesforce Login and identity verification screens.
 */
export class LoginPage extends BasePage {
  // ── Login screen locators ──────────────────────────────────────────────────
  readonly usernameBox = this.page.locator('#username');
  private readonly passwordBox = this.page.locator('#password');
  private readonly logInButton = this.page.locator('#Login');
  private readonly errorText = this.page.locator('#error, .loginError');

  // ── Verification screen locators ───────────────────────────────────────────
  private readonly verificationCodeBox = this.page.locator('#emc, input[name="emc"]').first();
  private readonly verifyButton = this.page.locator('#save, input[value="Verify"]').first();

  /**
   * Retrieves visible login error message text.
   *
   * @returns Error string or empty string if none displayed
   */
  async getLoginErrorText(): Promise<string> {
    return this.getElementInnerText(this.errorText, TIMEOUTS.SMALL_TIMEOUT);
  }

  /**
   * Checks whether the two-factor 'Verify Your Identity' screen is displayed.
   *
   * @returns True if verification code input is visible, false otherwise
   */
  async isAskingForEmailCode(): Promise<boolean> {
    const isAsking = await this.isElementVisible(this.verificationCodeBox, TIMEOUTS.SCREEN_APPEARS);
    this.log.info('Identity verification prompt status', { isAsking });
    return isAsking;
  }

  /**
   * Navigates to the Salesforce login endpoint.
   *
   * @returns True if username input rendered; false if existing trusted session bypassed login
   */
  async open(): Promise<boolean> {
    const loginUrl = env.instanceUrl || 'https://login.salesforce.com';
    this.log.info('Navigating to login page', { loginUrl });

    await this.page.goto(`${loginUrl}/`, { waitUntil: 'domcontentloaded' });

    const loginFormAppeared = await this.isElementVisible(
      this.usernameBox,
      TIMEOUTS.SCREEN_APPEARS
    );
    if (!loginFormAppeared) {
      this.log.info('Login form bypassed: active session already present');
    }
    return loginFormAppeared;
  }

  /**
   * Performs standard username and password UI authentication flow.
   *
   * @param username - Salesforce username (defaults to env.sfUsername)
   * @param password - Salesforce password (defaults to env.sfPassword)
   * @param prepareForVerificationEmail - Optional callback invoked prior to form submission
   */
  async loginViaUsername(
    username: string = env.sfUsername,
    password: string = env.sfPassword,
    prepareForVerificationEmail?: () => Promise<void>
  ): Promise<void> {
    this.log.info('Submitting username and password credentials', { username });

    await this.fill(this.usernameBox, username);
    await this.clickLoginButton();
    await this.fill(this.passwordBox, password);

    await prepareForVerificationEmail?.();
    await this.clickLoginButton();
  }

  /**
   * Enters and submits an emailed one-time verification code.
   *
   * @param code - 6-digit numeric verification code
   */
  async enterEmailCode(code: string): Promise<void> {
    this.log.info('Submitting email verification code');
    await this.fill(this.verificationCodeBox, code);
    await this.clickLoginButton(this.verifyButton);
  }

  /**
   * Authenticates by obtaining an OAuth access token and navigating directly via frontdoor.jsp.
   *
   * @param maxAttempts - Maximum retry attempts upon navigation failure
   * @returns Frontdoor login URL navigated to
   */
  async loginViaJWT(maxAttempts = 3): Promise<string> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const token = await requestAccessToken();
      const loginUrl = buildLoggedInBrowserUrl(token);

      try {
        await this.page.goto(loginUrl, {
          waitUntil: 'domcontentloaded',
          timeout: TIMEOUTS.SALESFORCE_LOADING
        });

        // Salesforce indicates failed frontdoor redirection via 'ec' query param.
        const refusalCode = new URL(this.page.url()).searchParams.get('ec');
        if (refusalCode) {
          throw new Error(
            `Salesforce frontdoor authentication rejected (error code ${refusalCode})`
          );
        }

        this.log.info('Frontdoor authentication successful', {
          attempt,
          landedOn: hideSecretFromUrl(this.currentUrl)
        });
        return loginUrl;
      } catch (error) {
        lastError = error as Error;
        this.log.warn('Frontdoor navigation attempt failed, retrying', {
          attempt,
          reason: lastError.message
        });
      }
    }

    throw new Error(
      `JWT authentication failed after ${maxAttempts} attempts. ` +
        `Last error: ${lastError?.message ?? 'unknown'}`
    );
  }

  /**
   * Clears browser cookies and localStorage to reset authentication state.
   */
  async clearSession(): Promise<void> {
    this.log.info('Clearing browser cookies and storage state');
    await this.page.context().clearCookies();
    await this.page.evaluate(() => window.localStorage.clear()).catch(() => undefined);
  }

  /**
   * Submits a form button and waits for DOM load state stabilization.
   *
   * @param button - Target button Locator (defaults to Log In button)
   */
  private async clickLoginButton(button: Locator = this.logInButton): Promise<void> {
    await this.click(button);
    await this.page.waitForLoadState('domcontentloaded');
  }
}
