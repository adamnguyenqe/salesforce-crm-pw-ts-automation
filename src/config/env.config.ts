import * as dotenv from 'dotenv';
import * as path from 'path';

/**
 * Environment settings.
 */

/**
 * Environment to test:
 *   locally:  ENV=dev npx playwright test
 *   in CI:    set CI_TARGET_ENVIRONMENT on the workflow
 */
const DEFAULT_ENVIRONMENT = 'dev';

const chosenEnvironment =
  process.env.CI_TARGET_ENVIRONMENT || process.env.ENV || DEFAULT_ENVIRONMENT;

const environmentName = chosenEnvironment.toLowerCase();

/**
 * Load one settings file. A missing file is fine and is simply skipped.
 *
 * `quiet` stops the dotenv library printing a banner for every file it loads.
 * Those banners end up mixed into the test report files and break them.
 *
 * @param relativePath - Path to the file, from the project root
 */
function loadSettingsFile(relativePath: string): void {
  dotenv.config({ path: path.resolve(process.cwd(), relativePath), quiet: true });
}

// Load in order of DECREASING priority: the first file to set a value wins,
// because dotenv never overwrites something already set. Real environment
// variables beat both files, which is how CI supplies its secrets.
loadSettingsFile('environments/.env.local');
loadSettingsFile(`environments/.env.${environmentName}`);

/**
 * Secret settings.
 */
export const SECRET_SETTINGS = [
  'SF_PASSWORD',
  'SF_IMAP_PASSWORD',
  'SF_CLIENT_ID',
  'SF_PRIVATE_KEY'
] as const;

/**
 * In CI, stop immediately if a secret was not supplied.
 */
function warnAboutMissingSecretsInCi(): void {
  const runningInCi = process.env.CI === 'true';
  if (!runningInCi) {
    return;
  }

  const missing = SECRET_SETTINGS.filter((settingName) => !process.env[settingName]);
  if (missing.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(`[config] These secrets are not set: ${missing.join(', ')}.`);
  }
}

warnAboutMissingSecretsInCi();

/** @returns The Salesforce org URL, with any trailing slash removed */
function readOrgUrl(): string {
  return readSetting('SF_INSTANCE_URL').replace(/\/+$/, '');
}

/**
 * Read one setting.
 *
 * @param settingName - The name, e.g. 'SF_USERNAME'
 * @param fallback - What to use when the setting is not set
 * @returns The setting's value, or the fallback
 */
function readSetting(settingName: string, fallback = ''): string {
  return process.env[settingName] ?? fallback;
}

const orgUrl = readOrgUrl();

export const env = {
  // ── App ────────────────────────────────────────────────────────────────────
  environmentName,
  // My Domain URL of the Salesforce Developer org.
  instanceUrl: orgUrl,

  logLevel: readSetting('LOG_LEVEL', 'DEBUG'),

  // ── Salesforce credentials — UI login ──────────────────────────────────────
  // Secrets → environments/.env.local only.
  sfUsername: readSetting('SF_USERNAME'),
  sfPassword: readSetting('SF_PASSWORD'),

  // ── Logging in with a certificate ──────────────────────────────────────────
  // Consumer Key of the Connected App in Salesforce.
  sfClientId: readSetting('SF_CLIENT_ID'),

  // Contents of server.key. Quoted and \n-escaped in the file; readPrivateKey()
  // tidies it back into a real key.
  sfPrivateKey: readSetting('SF_PRIVATE_KEY'),

  // Which Salesforce should accept our signed request, and where to send it.
  // Both default to the org's own address.
  sfJwtAudience: readSetting('SF_JWT_AUDIENCE') || orgUrl,
  sfTokenHost: readSetting('SF_TOKEN_HOST') || orgUrl,

  // ── Gmail IMAP — the email-otp strategy's mailbox ──────────────────────────
  // Salesforce emails a one-time code on any login from an unrecognised device.
  // SF_IMAP_PASSWORD must be a Google App Password, not the account password.
  sfImapHost: readSetting('SF_IMAP_HOST'),
  sfImapPort: Number(readSetting('SF_IMAP_PORT', '993')),
  sfImapUser: readSetting('SF_IMAP_USER'),
  sfImapPassword: readSetting('SF_IMAP_PASSWORD')
} as const;
