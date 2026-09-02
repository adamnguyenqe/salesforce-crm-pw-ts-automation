/**
 * Test tags, which are used to select which tests to run.
 */
export const Tags = {
  // Suites
  /** Part A — Salesforce login. */
  PART_A: '@part-a',

  /** Part B — Lead creation, management and conversion. */
  PART_B: '@part-b',

  // Login solutions
  /** JWT Bearer flow: no UI, no email, no rate limit. */
  JWT: '@jwt',

  /** Email OTP flow. */
  OTP: '@otp',

  // Part B areas
  /** Creating, reading and editing a Lead. */
  LEAD: '@lead',

  /** Converting a Lead into an Account, Contact and Opportunity. */
  CONVERSION: '@conversion',

  /** Checks that something is correctly refused. */
  NEGATIVE: '@negative',

  /** Assertions against the browser's own Aura/XHR traffic. */
  API: '@api',

  // Selections
  /** The short run: one lead-creation and one conversion test. */
  SMOKE: '@smoke'
} as const;
