/**
 * Timeouts
 */
export const TIMEOUTS = {
  // ── Looking for something on the page ──────────────────────────────────────
  /** Reading something already on screen, such as an error message. */
  SMALL_TIMEOUT: 2_000,
  /** Checking whether a screen appeared after a click, such as a pop-up. */
  SCREEN_APPEARS: 10_000,
  /** The normal wait for anything on a page that has finished loading. */
  DEFAULT_TIMEOUT: 30_000,
  /** Salesforce loading fully after login. The slowest thing we wait for. */
  SALESFORCE_LOADING: 60_000,

  // ── Loading a page ─────────────────────────────────────────────────────────
  /** Opening a page, including any redirects along the way. */
  NAVIGATION: 30_000,

  // ── Waiting for the verification email ─────────────────────────────────────
  // OTP = "one-time password", the short code Salesforce emails at login.
  /** Total time allowed for the verification email to arrive and be read. */
  OTP_DELIVERY: 120_000,

  // ── Limits on whole tests ──────────────────────────────────────────────────
  /** Assertion timeout. */
  ASSERTION_TIMEOUT: 15_000,
  /** Default timeout for end-to-end flows. */
  DEFAULT_E2E_FLOW: 180_000
} as const;

/**
 * Pauses where we genuinely sit and wait.
 */
export const DELAYS = {
  /** How long to pause between checks of the inbox. */
  OTP_POLL_INTERVAL: 5_000,

  /**
   * Clock skew allowance when checking for a new email. The email's timestamp is
   * based on the server's clock, which may be a few seconds different from the
   * test machine's clock.
   */
  OTP_CLOCK_SKEW: 30_000
} as const;
