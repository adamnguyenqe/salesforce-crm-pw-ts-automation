import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { env } from '@config';
import { DELAYS, TIMEOUTS } from '@constants';
import { logger } from './logger';
import { pause } from './wait.utils';

const log = logger('otp-mailbox');

/** A code we found, plus its inbox number. Higher number = newer email. */
interface FoundCode {
  emailNumber: number;
  code: string;
}

/**
 * Get the range of emails that arrived after a given email number.
 *
 * @param lastEmailAlreadySeen - Number of the newest email we had already seen
 * @returns A range such as "58:*", meaning email 58 onwards
 */
function emailsArrivingAfter(lastEmailAlreadySeen: number): string {
  const firstNewEmail = lastEmailAlreadySeen + 1;
  return `${firstNewEmail}:*`;
}

/**
 * Reads the login code Salesforce emails when it does not recognise a computer.
 *
 * Gmail setup: turn on IMAP in Gmail settings, and use an App Password from
 * https://myaccount.google.com/apppasswords — the normal password is rejected.
 *
 */
export class OtpMailbox {
  /** Latest email number before login. */
  private lastEmailBeforeLogin = 0;

  /** Time used for checking email timestamps. Make sure it's before the login. */
  private timeBeforeLogin = new Date(0);

  private constructor(private readonly mailboxConnection: ImapFlow) {}

  /**
   * Connect to the mailbox.
   *
   * @returns A connected mailbox. Call close() on it when finished.
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
        `Cannot read the verification email: ${missingSettings.join(', ')} ` +
          'is not set. Add it to environments/.env.local.'
      );
    }

    const mailboxConnection = new ImapFlow({
      host: env.sfImapHost,
      port: env.sfImapPort,
      // Port 993 is the standard encrypted port IMAP.
      secure: env.sfImapPort === 993,
      auth: { user: env.sfImapUser, pass: env.sfImapPassword },
      logger: false
    });

    await mailboxConnection.connect();
    log.info('Connected to mailbox', { host: env.sfImapHost, user: env.sfImapUser });
    return new OtpMailbox(mailboxConnection);
  }

  /**
   * Remember the current inbox state, so we can later find the new email.
   */
  async rememberCurrentInbox(): Promise<void> {
    const inbox = await this.mailboxConnection.getMailboxLock('INBOX');

    try {
      const status = await this.mailboxConnection.status('INBOX', { uidNext: true });

      // uidNext is the number the NEXT email gets, so one less is the newest
      // email already there.
      const nextEmailNumber = status.uidNext ?? 1;
      this.lastEmailBeforeLogin = nextEmailNumber - 1;

      // Check the clock now, so we can ignore any email that arrived before this moment.
      this.timeBeforeLogin = new Date(Date.now() - DELAYS.OTP_CLOCK_SKEW);

      log.debug('Noted current inbox', {
        lastEmailBeforeLogin: this.lastEmailBeforeLogin,
        timeBeforeLogin: this.timeBeforeLogin.toISOString()
      });
    } finally {
      inbox.release();
    }
  }

  /**
   * Get the code from the email Salesforce sent. Waits for it to arrive, and throws if it does not.
   *
   * @param totalWaitMs - Total time to keep checking.
   * @param checkIntervalMs - How long to pause between checks.
   * @returns The verification code from the email
   */
  async waitForNewCode(
    totalWaitMs: number = TIMEOUTS.OTP_DELIVERY,
    checkIntervalMs: number = DELAYS.OTP_POLL_INTERVAL
  ): Promise<string> {
    // The clock time at which we stop waiting.
    const deadline = Date.now() + totalWaitMs;

    let attempt = 0;

    while (Date.now() < deadline) {
      attempt += 1;
      const found = await this.findNewestCodeEmail();

      if (found) {
        const codeToUse = await this.preferLaterDuplicate(found);

        // Move the marker so this email is never read twice.
        this.lastEmailBeforeLogin = codeToUse.emailNumber;

        log.info('Verification code retrieved', {
          attempt,
          emailNumber: codeToUse.emailNumber,
          // Hide the actual code, use for checking only.
          code: `${codeToUse.code.slice(0, 2)}****`
        });
        return codeToUse.code;
      }

      log.debug('No new verification email yet, will check again', { attempt });
      await pause(checkIntervalMs);
    }

    throw new Error(
      `No Salesforce verification email arrived within ${totalWaitMs}ms. ` +
        `Check that ${env.sfImapUser} is the address the org sends to.`
    );
  }

  /**
   * Check for a newer email than the one we already found, and return whichever is newer.
   *
   * @param alreadyFound - The code we found on the first look
   * @returns Whichever code is newer
   */
  private async preferLaterDuplicate(alreadyFound: FoundCode): Promise<FoundCode> {
    await pause(DELAYS.OTP_POLL_INTERVAL);

    const secondLook = await this.findNewestCodeEmail();
    const newerEmailArrived =
      secondLook !== undefined && secondLook.emailNumber >= alreadyFound.emailNumber;

    return newerEmailArrived ? secondLook : alreadyFound;
  }

  /** @returns The newest email holding a code, or nothing if there is none */
  private async findNewestCodeEmail(): Promise<FoundCode | undefined> {
    const inbox = await this.mailboxConnection.getMailboxLock('INBOX');

    try {
      const everythingAfterOurMarker = emailsArrivingAfter(this.lastEmailBeforeLogin);

      // This library returns false, not an empty list, when nothing matches.
      const matchingEmailNumbers =
        (await this.mailboxConnection.search({ uid: everythingAfterOurMarker }, { uid: true })) ||
        [];

      // Newest first, so we return the freshest code.
      const newestFirst = [...matchingEmailNumbers].reverse();

      for (const emailNumber of newestFirst) {
        const code = await this.readCodeFromEmail(emailNumber);
        if (code) {
          return { emailNumber: Number(emailNumber), code };
        }
      }

      return undefined;
    } finally {
      inbox.release();
    }
  }

  /**
   * Read the code from one email.
   *
   * @param emailNumber - Which email to open
   * @returns code if it is a Salesforce email, or nothing if it is not
   */
  private async readCodeFromEmail(emailNumber: number): Promise<string | undefined> {
    const rawEmail = await this.mailboxConnection.fetchOne(
      String(emailNumber),
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

    const arrivedBeforeWeStarted = email.date !== undefined && email.date < this.timeBeforeLogin;
    if (arrivedBeforeWeStarted) {
      log.debug('Ignoring an email that arrived before this login attempt', {
        emailNumber,
        sentAt: email.date?.toISOString()
      });
      return undefined;
    }

    const code = findCodeInText(`${subject}\n${email.text ?? ''}`);
    if (!code) {
      log.warn('Email looks like a Salesforce email but has no code in it', { subject });
    }
    return code;
  }

  async close(): Promise<void> {
    await this.mailboxConnection.logout().catch(() => this.mailboxConnection.close());
    log.debug('Mailbox connection closed');
  }
}

/**
 * Get the digits from a search result.
 *
 * @param searchResult - What a pattern match returned, possibly null
 * @returns The captured digits, or nothing if there was no match
 */
function getCapturedDigits(searchResult: RegExpMatchArray | null): string | undefined {
  const POSITION_OF_THE_DIGITS = 1;

  if (searchResult === null) {
    return undefined;
  }
  return searchResult[POSITION_OF_THE_DIGITS];
}

/**
 * Find the verification code in an email.
 *
 * @param emailText - The subject and body of the email
 * @returns The verification code, or nothing if there is none
 */
export function findCodeInText(emailText: string): string | undefined {
  // A number that comes just after the words "Verification Code".
  const CODE_AFTER_THE_WORDS = /(?:Verification Code)[^\d]{0,20}(\d{5,8})/i;
  // A 5-to-8 digit number sitting alone on its own line.
  const CODE_ON_ITS_OWN_LINE = /^\s*(\d{5,8})\s*$/m;

  const codeAfterTheWords = getCapturedDigits(emailText.match(CODE_AFTER_THE_WORDS));
  if (codeAfterTheWords) {
    return codeAfterTheWords;
  }

  return getCapturedDigits(emailText.match(CODE_ON_ITS_OWN_LINE));
}
