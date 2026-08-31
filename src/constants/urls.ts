/** Salesforce web addresses and the patterns we check them against. */

/**
 * The address of the logged-in Salesforce app.
 *
 * Landing on a *.lightning.force.com address is how we know a login worked:
 * the login pages live on a different address.
 */
export const LIGHTNING_URL_PATTERN = /lightning\.force\.com/;

/** The Salesforce home page, relative to the org address. */
export const HOME_PAGE_PATH = '/lightning/page/home';
