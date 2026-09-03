# Notes on Salesforce Login & 2FA: Email OTP vs JWT

Written 2026-09-02 against `orgfarm-f2434b94ef-dev-ed` (Winter '26).

When running automated tests from a headless runner or clean Docker container, Salesforce flags the session as an unrecognized IP/device and halts on the **"Verify Your Identity"** (`#emc`) screen. Since disabling 2FA on the dev org (`orgfarm-f2434b94ef-dev-ed`) isn't realistic for real-world testing, I set up two ways to handle authentication:

1. An IMAP client to fetch the email OTP for the UI login test (`login-email-otp.spec.ts`)
2. A JWT Bearer flow to bypass the UI login form entirely for the rest of the suite (`login-jwt-bearer.spec.ts`)

Here is how both work and why JWT is what actually runs the regression suite.

### The Email OTP flow (`src/utils/otp-mailbox.utils.ts`)

For Part A's human login flow, the test enters the username and password on the UI, waits for the `#emc` screen, connects to a dedicated Gmail account over IMAP (TLS 993) using a Google App Password, and retrieves the verification code.

The main issue I hit during development was stale emails: running tests back-to-back meant a new test run would often pick up the verification code from 5 minutes earlier. To fix this:

1. Right before clicking Log In, `rememberCurrentInbox()` captures the mailbox's current `uidNext` and timestamp:
   ```typescript
   const status = await this.mailboxConnection.status('INBOX', { uidNext: true });
   this.lastSeenUid = (status.uidNext ?? 1) - 1;
   this.loginTimestamp = new Date(Date.now() - DELAYS.OTP_TIMESTAMP_DIFF);
   ```
2. On the verification screen, `waitForNewCode()` polls every 1.5s, filtering strictly for messages where `UID > lastSeenUid` and sorting descending so the newest message is checked first.
3. Once an email arrives, `findCodeInText()` extracts the code via regex (`(?:Verification Code)[^\d]{0,20}(\d{5,8})`). A brief pause in `preferLaterDuplicate()` checks whether a second email arrived right behind it, preventing the test from submitting an invalidated code.
4. After logging in, TC01 writes browser cookies and localStorage to `savedLoginFile('otp')` via `storageState`, so TC02 can reuse the session without going through 2FA again.

### Why IMAP doesn't scale for the whole test suite

While the IMAP helper works reliably for a single test, trying to run the entire test suite through email OTP ran into several practical walls:

- **Parallel test runs broke down immediately:** When Playwright runs multiple workers, two workers logging in at the same time receive two verification emails in the same inbox. Worker 1 grabs Worker 2's code and both tests fail. On top of that, Google enforces concurrent connection limits on IMAP — having 3–4 workers connect at once starts throwing `Too many simultaneous connections` errors.
- **Salesforce Dev Org email latency:** Developer Edition orgs route system emails through shared mail pools. Depending on queue load, a verification email can take 3 seconds or 30+ seconds to arrive. Doing that on every test adds minutes of pure idle waiting to CI.

### The JWT Bearer alternative (`src/utils/jwt.utils.ts`)

To avoid those bottlenecks during regression testing and API data seeding, I set up an authorized Connected App in Salesforce with a self-signed certificate (`server.crt`):

1. The test signs a JWT assertion in memory using a local RSA private key (`server.pass.key`).
2. It POSTs the assertion to `/services/oauth2/token` and gets back an `access_token` in a quick sub-second roundtrip.
3. The browser navigates directly to `/secur/frontdoor.jsp?sid=<access_token>`. Salesforce sets session cookies and drops straight into Lightning Experience without any login form or 2FA challenge.

Because each worker signs its own token in memory and hits the OAuth endpoint directly, there is no shared mailbox, no email delay, and no worker contention during parallel runs.

### Security notes & practical tradeoffs

Both approaches come with different security realities:

Email OTP requires putting the actual Salesforce account password (`SF_PASSWORD`) plus the Gmail App Password in CI secrets. Storing interactive passwords in CI isn't great practice (Salesforce is deprecating the username-password flow in Winter '27 anyway), and org password rotation policies (like 90-day resets) will eventually break automated runs. But it does provide two-channel isolation: an attacker who steals the Salesforce password alone still can't log in from an unknown IP without also having the Gmail credentials.

JWT avoids storing any user passwords in CI, and password expiration policies have no effect on it. The tradeoff is that `server.pass.key` is effectively a master key for that Connected App — if that private key and the client ID leak, an attacker can authenticate headlessly as the pre-authorized user without any 2FA challenge. There is also the quirk that `frontdoor.jsp` passes the access token in the URL query string (`?sid=...`), which is why I added `hideSecretFromUrl()` in `LoginPage` to scrub `sid=***` before any frontdoor URL gets logged.

### Things that didn't work

- Trying to skip the problem by reusing one `storageState` file for every spec. The session does expire, and when it does every spec fails at once with no useful error — TC01 has to be able to re-earn it.
- Filtering the inbox by subject line alone. Salesforce reuses the same subject for every verification email, so a stale one from minutes earlier matches just as well. UID baseline is what actually fixes it.
- Searching IMAP by received timestamp. Clock skew between the runner and Gmail meant borderline emails were sometimes filtered out — hence `DELAYS.OTP_TIMESTAMP_DIFF` as a fudge factor, which I'm not thrilled about.

### Open questions

- The `preferLaterDuplicate()` pause is a fixed wait tuned by observation, not a real signal. If Salesforce's duplicate email lands slower than that window, the test still submits the invalidated code.
- Haven't tested what happens when the Connected App certificate approaches expiry — the failure mode from `/services/oauth2/token` is unverified.
- Username-password flow deprecation in Winter '27 is from Salesforce release notes, not something I've hit yet.

### Summary

Email OTP (`login-email-otp.spec.ts`) proves the human 2FA path works end-to-end for Part A. JWT Bearer (`login-jwt-bearer.spec.ts`) is what powers the rest of the test suite and API data seeding so regression runs stay fast, deterministic, and parallelizable.