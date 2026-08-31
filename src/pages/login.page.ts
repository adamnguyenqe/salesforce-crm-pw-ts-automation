import type { Locator } from '@playwright/test';

import { env } from '@config';
import { TIMEOUTS } from '@constants';
import { buildLoggedInBrowserUrl, requestAccessToken } from '@utils';

import { BasePage } from './base.page';

/**
 * Blank out the token in a login address.
 *
 * @param url - The address to clean up
 * @returns The same address with the token replaced by ***
 */
export function hideSecretFromUrl(url: string): string {
  return url.replace(/sid=[^&]+/, 'sid=***');
}

/**
 * The Salesforce login page.
 *
 * Two ways to log in:
 *   loginViaUsername() — types username and password. Salesforce may then
 *                        email a code to confirm it is you.
 *   loginViaJWT()      — skips the form using a signed certificate. Faster,
 *                        and never sends an email.
 */
export class LoginPage extends BasePage {
  // ── Login screen ─────────────────────────────────────────────────
  readonly usernameBox = this.page.locator('#username');
  private readonly passwordBox = this.page.locator('#password');
  private readonly logInButton = this.page.locator('#Login');
  private readonly errorText = this.page.locator('#error, .loginError');

  // ── The "Verify Your Identity" screen ────────────────────────────
  private readonly verificationCodeBox = this.page.locator('#emc, input[name="emc"]').first();
  private readonly verifyButton = this.page.locator('#save, input[value="Verify"]').first();

  /** @returns The error Salesforce is showing, or '' if there is none */
  async getLoginErrorText(): Promise<string> {
    return this.getElementInnerText(this.errorText, TIMEOUTS.SMALL_TIMEOUT);
  }

  /** @returns True if the "Verify Your Identity" screen is on show */
  async isAskingForEmailCode(): Promise<boolean> {
    const isAsking = await this.isElementVisible(this.verificationCodeBox, TIMEOUTS.SCREEN_APPEARS);
    this.log.info('Is Salesforce asking for an email code?', { isAsking });
    return isAsking;
  }

  /**
   * Go to the login page.
   *
   * @returns True if the login form appeared.
   *          False means Salesforce skipped it and let us straight in, which it does for browsers it already
   *          trusts — so a form is never guaranteed.
   */
  async open(): Promise<boolean> {
    const loginUrl = env.instanceUrl || 'https://login.salesforce.com';
    this.log.info('Opening the login page', { loginUrl });

    await this.page.goto(`${loginUrl}/`, { waitUntil: 'domcontentloaded' });

    const loginFormAppeared = await this.isElementVisible(
      this.usernameBox,
      TIMEOUTS.SCREEN_APPEARS
    );
    if (!loginFormAppeared) {
      this.log.info('No login form appeared — we are already logged in');
    }
    return loginFormAppeared;
  }

  /**
   * Log in by typing a username and password.
   *
   * @param username Defaults to the SF_USERNAME setting.
   * @param password Defaults to the SF_PASSWORD setting.
   * @param prepareForVerificationEmail Runs just before the click that sends
   *        the email — the only moment to note what was in the inbox before.
   */
  async loginViaUsername(
    username: string = env.sfUsername,
    password: string = env.sfPassword,
    prepareForVerificationEmail?: () => Promise<void>
  ): Promise<void> {
    this.log.info('Typing the username and password', { username });

    await this.fill(this.usernameBox, username);
    await this.clickLoginButton();
    await this.fill(this.passwordBox, password);

    await prepareForVerificationEmail?.();
    await this.clickLoginButton();
  }

  /**
   * Enter the emailed code and submit it.
   *
   * @param code - The verification code from the email
   */
  async enterEmailCode(code: string): Promise<void> {
    this.log.info('Entering the code from the email');
    await this.fill(this.verificationCodeBox, code);
    await this.clickLoginButton(this.verifyButton);
  }

  /**
   * Log in without the form, using a signed certificate instead of a password.
   *
   * Retries because the redirects can fail transiently. Each attempt asks for
   * a fresh token, since an already-used one is a likely cause.
   *
   * @param maxAttempts - How many times to try before giving up
   * @returns The web address used to log in (using for test)
   */
  async loginViaJWT(maxAttempts = 3): Promise<string> {
    let lastProblem: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const token = await requestAccessToken();
      const loginUrl = buildLoggedInBrowserUrl(token);

      try {
        await this.page.goto(loginUrl, {
          waitUntil: 'domcontentloaded',
          timeout: TIMEOUTS.SALESFORCE_LOADING
        });

        // A refused login shows as "ec" in the address, readable only after
        // the redirects finish.
        const refusalCode = new URL(this.page.url()).searchParams.get('ec');
        if (refusalCode) {
          throw new Error(`Salesforce refused this login (code ${refusalCode})`);
        }

        this.log.info('Logged in without the form', {
          attempt,
          landedOn: hideSecretFromUrl(this.currentUrl)
        });
        return loginUrl;
      } catch (problem) {
        lastProblem = problem as Error;
        this.log.warn('That attempt failed, trying again', {
          attempt,
          reason: lastProblem.message
        });
      }
    }

    throw new Error(
      `Could not log in after ${maxAttempts} attempts. ` +
        `Last problem: ${lastProblem?.message ?? 'unknown'}`
    );
  }

  /**
   * Clear the browser's cookies and local storage.
   */
  async clearSession(): Promise<void> {
    this.log.info('Clearing the saved login');
    await this.page.context().clearCookies();
    await this.page.evaluate(() => window.localStorage.clear()).catch(() => undefined);
  }

  /**
   * Click and wait for the page it loads.
   *
   * @param button - Which button to click, defaulting to Log In
   */
  private async clickLoginButton(button: Locator = this.logInButton): Promise<void> {
    await this.click(button);
    await this.page.waitForLoadState('domcontentloaded');
  }
}
