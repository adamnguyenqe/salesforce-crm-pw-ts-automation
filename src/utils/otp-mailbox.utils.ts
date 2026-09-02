import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { env } from '@config';
import { DELAYS, TIMEOUTS } from '@constants';
import { logger } from './logger.utils';
import { pause } from './wait.utils';

const log = logger('otp-mailbox');

/** Identified verification code and its corresponding mailbox UID. */
interface FoundCode {
  emailNumber: number;
  code: string;
}

/**
 * Constructs an IMAP UID search sequence for messages arriving after a given UID.
 *
 * @param lastSeenUid - Highest message UID recorded prior to current operation
 * @returns IMAP sequence string (e.g. "58:*")
 */
function getEmailRangeAfter(lastSeenUid: number): string {
  const firstNewUid = lastSeenUid + 1;
  return `${firstNewUid}:*`;
}

/**
 * Manages IMAP connection to retrieve Salesforce email one-time verification codes (OTP).
 */
export class OtpMailbox {
  /** Highest email UID recorded before the login attempt was initiated. */
  private lastSeenUid = 0;

  /** Timestamp recorded immediately prior to triggering the login flow. */
  private loginTimestamp = new Date(0);

  private constructor(private readonly mailboxConnection: ImapFlow) {}

  /**
   * Initializes and connects to the IMAP mailbox.
   *
   * @returns Connected OtpMailbox instance
   * @throws If IMAP configuration settings are missing
   */
  static async open(): Promise<OtpMailbox> {
    const requiredSettings = {
      SF_IMAP_HOST: env.sfImapHost,
      SF_IMAP_USER: env.sfImapUser,
      SF_IMAP_PASSWORD: env.sfImapPassword
    };

    const missingSettings = Object.entries(requiredSettings)
      .filter(([, value]) => !value)
      .map(([name]) => name);

    if (missingSettings.length > 0) {
      throw new Error(
        `Cannot initialize IMAP mailbox: missing required configuration: ${missingSettings.join(', ')}. ` +
          'Configure them in environments/.env.local.'
      );
    }

    const mailboxConnection = new ImapFlow({
      host: env.sfImapHost,
      port: env.sfImapPort,
      secure: env.sfImapPort === 993,
      auth: { user: env.sfImapUser, pass: env.sfImapPassword },
      logger: false
    });

    await mailboxConnection.connect();
    log.info('Connected to mailbox', { host: env.sfImapHost, user: env.sfImapUser });
    return new OtpMailbox(mailboxConnection);
  }

  /**
   * Records current mailbox status and high-water mark UID before triggering login.
   */
  async rememberCurrentInbox(): Promise<void> {
    const inbox = await this.mailboxConnection.getMailboxLock('INBOX');

    try {
      const status = await this.mailboxConnection.status('INBOX', { uidNext: true });

      const nextUid = status.uidNext ?? 1;
      this.lastSeenUid = nextUid - 1;
      this.loginTimestamp = new Date(Date.now() - DELAYS.OTP_TIMESTAMP_DIFF);

      log.debug('Recorded mailbox baseline', {
        lastSeenUid: this.lastSeenUid,
        loginTimestamp: this.loginTimestamp.toISOString()
      });
    } finally {
      inbox.release();
    }
  }

  /**
   * Polls the mailbox until a new Salesforce verification code email arrives.
   *
   * @param timeoutMs - Maximum duration to poll in milliseconds
   * @param pollIntervalMs - Interval between mailbox checks in milliseconds
   * @returns Extracted verification code
   * @throws If no code is received within the timeout window
   */
  async waitForNewCode(
    timeoutMs: number = TIMEOUTS.OTP_DELIVERY,
    pollIntervalMs: number = DELAYS.OTP_POLL_INTERVAL
  ): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    let attempt = 0;

    while (Date.now() < deadline) {
      attempt++;
      const found = await this.findNewestCodeEmail();

      if (found) {
        const selectedCode = await this.preferLaterDuplicate(found);
        this.lastSeenUid = selectedCode.emailNumber;

        log.info('Verification code retrieved', {
          attempt,
          emailNumber: selectedCode.emailNumber,
          codeMasked: `${selectedCode.code.slice(0, 2)}****`
        });
        return selectedCode.code;
      }

      log.debug('No new verification email yet; polling again', { attempt });
      await pause(pollIntervalMs);
    }

    throw new Error(
      `No Salesforce verification email received within ${timeoutMs}ms. ` +
        `Verify that ${env.sfImapUser} is the configured notification address.`
    );
  }

  /**
   * Checks for a second newer message that might have superseded the initial match.
   *
   * @param initialMatch - The initial verification code detected
   * @returns The latest matching code
   */
  private async preferLaterDuplicate(initialMatch: FoundCode): Promise<FoundCode> {
    await pause(DELAYS.OTP_POLL_INTERVAL);

    const followUpMatch = await this.findNewestCodeEmail();
    const newerAvailable =
      followUpMatch !== undefined && followUpMatch.emailNumber >= initialMatch.emailNumber;

    return newerAvailable ? followUpMatch : initialMatch;
  }

  /**
   * Searches the inbox for unread Salesforce messages arriving after the recorded baseline.
   *
   * @returns Newest code detected or undefined if no matching email was found
   */
  private async findNewestCodeEmail(): Promise<FoundCode | undefined> {
    const inbox = await this.mailboxConnection.getMailboxLock('INBOX');

    try {
      const searchRange = getEmailRangeAfter(this.lastSeenUid);
      const uids = (await this.mailboxConnection.search({ uid: searchRange }, { uid: true })) || [];

      // Sort descending to inspect freshest messages first.
      const newestFirst = [...uids].reverse();

      for (const emailUid of newestFirst) {
        const code = await this.readCodeFromEmail(emailUid);
        if (code) {
          return { emailNumber: Number(emailUid), code };
        }
      }

      return undefined;
    } finally {
      inbox.release();
    }
  }

  /**
   * Fetches and parses a single email by UID to extract a verification code.
   *
   * @param emailUid - UID of the email message
   * @returns Verification code if found and valid, otherwise undefined
   */
  private async readCodeFromEmail(emailUid: number): Promise<string | undefined> {
    const rawEmail = await this.mailboxConnection.fetchOne(
      String(emailUid),
      { source: true },
      { uid: true }
    );

    if (!rawEmail || !rawEmail.source) {
      return undefined;
    }

    const email = await simpleParser(rawEmail.source);
    const subject = email.subject ?? '';
    const sender = email.from?.text ?? '';

    const isFromSalesforce = /salesforce/i.test(`${sender} ${subject}`);
    if (!isFromSalesforce) {
      return undefined;
    }

    const isPriorToLogin = email.date !== undefined && email.date < this.loginTimestamp;
    if (isPriorToLogin) {
      log.debug('Skipping message arrived prior to login window', {
        emailUid,
        date: email.date?.toISOString()
      });
      return undefined;
    }

    const code = findCodeInText(`${subject}\n${email.text ?? ''}`);
    if (!code) {
      log.warn('Salesforce notification received but no verification code parsed', { subject });
    }
    return code;
  }

  /** Closes and disposes the IMAP connection. */
  async close(): Promise<void> {
    await this.mailboxConnection.logout().catch(() => this.mailboxConnection.close());
    log.debug('Mailbox connection closed');
  }
}

/**
 * Extracts first captured group from a regex match result.
 *
 * @param matchResult - RegExp match result
 * @returns Captured digits string or undefined
 */
function getCapturedDigits(matchResult: RegExpMatchArray | null): string | undefined {
  const DIGITS_CAPTURE_GROUP = 1;
  return matchResult ? matchResult[DIGITS_CAPTURE_GROUP] : undefined;
}

/**
 * Extracts numeric verification code from email subject or body text.
 *
 * @param emailText - Full text combining subject and email body
 * @returns Parsed verification code string or undefined
 */
export function findCodeInText(emailText: string): string | undefined {
  const VERIFICATION_CODE_PATTERN = /(?:Verification Code)[^\d]{0,20}(\d{5,8})/i;
  const STANDALONE_DIGITS_PATTERN = /^\s*(\d{5,8})\s*$/m;

  const matchByKeyword = getCapturedDigits(emailText.match(VERIFICATION_CODE_PATTERN));
  if (matchByKeyword) {
    return matchByKeyword;
  }

  return getCapturedDigits(emailText.match(STANDALONE_DIGITS_PATTERN));
}
