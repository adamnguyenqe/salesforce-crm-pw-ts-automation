/** Application and test timeout configurations (in milliseconds). */
export const TIMEOUTS = {
  // Element & UI Interactions
  /** Quick lookup for elements already present in DOM (e.g. error labels). */
  SMALL_TIMEOUT: 2_000,

  /** Wait duration for dynamic modals, popups, and dropdown menus to appear. */
  SCREEN_APPEARS: 10_000,

  /** Standard timeout for UI actions and element state assertions. */
  DEFAULT_TIMEOUT: 30_000,

  /** Extended timeout for full Salesforce Lightning page transitions and initial app loads. */
  SALESFORCE_LOADING: 60_000,

  // Navigation
  /** Maximum duration for page navigation and redirect chains. */
  NAVIGATION: 30_000,

  // Email & MFA
  /** Maximum window for email verification code arrival and IMAP retrieval. */
  OTP_DELIVERY: 120_000,

  // Test Execution
  /** Default assertion timeout. */
  ASSERTION_TIMEOUT: 15_000,

  /** Global timeout for full multi-step E2E user journeys. */
  DEFAULT_E2E_FLOW: 180_000
} as const;

/** Polling intervals and time synchronization thresholds (in milliseconds). */
export const DELAYS = {
  /** Polling interval between successive IMAP inbox checks. */
  OTP_POLL_INTERVAL: 5_000,

  /** Time buffer applied when matching message arrival timestamps. */
  OTP_TIMESTAMP_DIFF: 30_000
} as const;
