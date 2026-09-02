/** Pattern matching authenticated Salesforce Lightning web application URLs. */
export const LIGHTNING_URL_PATTERN = /lightning\.force\.com/;

/** Relative path to the default Salesforce Lightning home page. */
export const HOME_PAGE_PATH = '/lightning/page/home';

/** Relative path to open the New Lead creation modal. */
export const NEW_LEAD_PATH = '/lightning/o/Lead/new';

/** Relative path to the standard Lead list view. */
export const LEAD_LIST_PATH = '/lightning/o/Lead/list';

/**
 * Regular expressions matching 18-character Salesforce record IDs by key prefix.
 */
export const ID_PATTERNS = {
  LEAD: /^00Q[A-Za-z0-9]{15}$/,
  ACCOUNT: /^001[A-Za-z0-9]{15}$/,
  CONTACT: /^003[A-Za-z0-9]{15}$/,
  OPPORTUNITY: /^006[A-Za-z0-9]{15}$/
} as const;

/** Standard length of case-insensitive Salesforce record IDs. */
export const RECORD_ID_LENGTH = 18;

/**
 * Extracts the 15- or 18-character Salesforce record ID from a Lightning record URL.
 *
 * @param url - Browser URL string
 * @returns Extracted record ID or null if pattern does not match
 */
export function extractRecordIdFromUrl(url: string): string | null {
  const withObjectName = /\/lightning\/r\/[A-Za-z_]+\/([A-Za-z0-9]{15,18})(?:\/|$)/.exec(url);
  if (withObjectName?.[1]) {
    return withObjectName[1];
  }
  return /\/lightning\/r\/([A-Za-z0-9]{15,18})(?:\/|$)/.exec(url)?.[1] ?? null;
}

/** Pattern matching Salesforce Lightning record detail view URLs. */
export const RECORD_PAGE_URL_PATTERN = /\/lightning\/r\/(?:[A-Za-z_]+\/)?[A-Za-z0-9]{15,18}\//;
