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

/**
 * Resolves the primary Salesforce instance URL, stripping any trailing slash.
 *
 * @returns Sanitized Salesforce instance URL string
 */
function readOrgUrl(): string {
  return readSetting('SF_INSTANCE_URL').replace(/\/+$/, '');
}

/**
 * Reads an environment variable with an optional fallback.
 *
 * @param settingName - Environment variable key name
 * @param fallback - Default value if variable is unset
 * @returns Environment variable value or fallback string
 */
function readSetting(settingName: string, fallback = ''): string {
  return process.env[settingName] ?? fallback;
}

const orgUrl = readOrgUrl();

export const env = {
  // Execution Context
  environmentName,
  instanceUrl: orgUrl,
  logLevel: readSetting('LOG_LEVEL', 'DEBUG'),

  // Salesforce UI Credentials
  sfUsername: readSetting('SF_USERNAME'),
  sfPassword: readSetting('SF_PASSWORD'),

  // OAuth 2.0 JWT Bearer Configuration
  sfClientId: readSetting('SF_CLIENT_ID'),
  sfPrivateKey: readSetting('SF_PRIVATE_KEY'),
  sfJwtAudience: readSetting('SF_JWT_AUDIENCE') || orgUrl,
  sfTokenHost: readSetting('SF_TOKEN_HOST') || orgUrl,

  // IMAP Mailbox Configuration
  sfImapHost: readSetting('SF_IMAP_HOST'),
  sfImapPort: Number(readSetting('SF_IMAP_PORT', '993')),
  sfImapUser: readSetting('SF_IMAP_USER'),
  sfImapPassword: readSetting('SF_IMAP_PASSWORD')
} as const;
