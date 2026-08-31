/**
 * Test tags, which are used to select which tests to run.
 */
export const Tags = {
  // ── Suites ─────────────────────────────────────────────────────────────────
  /** Part A — Salesforce login. */
  PART_A: '@part-a',

  // ── Login solutions ────────────────────────────────────────────────────────
  /** JWT Bearer flow: no UI, no email, no rate limit. */
  JWT: '@jwt',
  /**
   * Email OTP flow.
   *
   * Salesforce rate-limits verification emails per user, so these run one
   * at a time and are not for routine runs — invoke them deliberately.
   */
  OTP: '@otp'
} as const;
