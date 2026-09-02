/** Salesforce REST API settings. */

/**
 * Version of the Salesforce API to call.
 * Read from the org's own `/services/data/`.
 */
export const SALESFORCE_API_VERSION = '67.0';

/** The base path for REST call. */
export const API_BASE_PATH = `/services/data/v${SALESFORCE_API_VERSION}`;

/**
 * Saves a record even when a duplicate rule objects.
 *
 * Needed because the conversion tests have to create a Lead whose email matches an existing Contact
 *
 * Use it ONLY to set up a test.
 */
export const ALLOW_DUPLICATES_HEADER = {
  'Sforce-Duplicate-Rule-Header': 'allowSave=true'
} as const;
