import type { Page, Response } from '@playwright/test';

import { TIMEOUTS } from '@constants';

import { logger } from './logger.utils';

const log = logger('sf-aura');

/**
 * Helpers to intercept and parse Salesforce Lightning Aura framework calls.
 * UI actions like Lead conversion trigger requests to `/aura` instead of standard REST endpoints.
 */

/** Single action item inside an Aura response. */
export interface AuraAction<T = Record<string, unknown>> {
  id: string;
  state: string;
  returnValue: T | null;
  error: unknown[];
}

/** Root envelope returned by Salesforce Aura endpoints. */
export interface AuraEnvelope<T = Record<string, unknown>> {
  actions: AuraAction<T>[];
  context?: Record<string, unknown>;
  perfSummary?: Record<string, unknown>;
}

/** Resulting record IDs generated or linked after converting a Lead. */
export interface LeadConversionResult {
  accountId: string;
  contactId: string;
  opportunityId: string;
  isPersonAccount: boolean;
  hasError: boolean;
}

/** The Aura controller action invoked during Lead conversion. */
export const CONVERT_LEAD_ACTION = 'convertLeadServer';

/** Salesforce prefixes JSON responses with this string to guard against XSSI attacks. */
const XSSI_PREFIX = 'while(1);';

/**
 * Strips the XSSI prefix (if present) and parses the Aura response JSON.
 *
 * @param body - Raw response body string from Salesforce Aura endpoint
 * @returns Parsed Aura envelope typed with payload T
 */
export function parseAuraEnvelope<T = Record<string, unknown>>(body: string): AuraEnvelope<T> {
  const json = body.startsWith(XSSI_PREFIX) ? body.slice(XSSI_PREFIX.length) : body;

  let envelope: AuraEnvelope<T>;
  try {
    envelope = JSON.parse(json) as AuraEnvelope<T>;
  } catch {
    throw new Error(`Failed to parse Aura response as JSON. Sample: ${json.slice(0, 200)}`);
  }

  if (!Array.isArray(envelope.actions)) {
    throw new Error(
      `Invalid Aura response: 'actions' array not found. Available keys: ${Object.keys(envelope).join(', ')}`
    );
  }

  return envelope;
}

/**
 * Listens for the `/aura` response matching the convertLeadServer action.
 * Must be initiated before clicking Convert, then awaited afterward.
 *
 * @param page - Playwright Page instance where the Lead conversion takes place
 * @returns Promise resolving to the `/aura` HTTP Response
 */
export function waitForLeadConversionCall(page: Page): Promise<Response> {
  log.info('Waiting for Aura lead conversion response');

  return page.waitForResponse(
    (response) =>
      /\/aura\?/.test(response.url()) &&
      (response.request().postData() ?? '').includes(CONVERT_LEAD_ACTION),
    { timeout: TIMEOUTS.SALESFORCE_LOADING }
  );
}

/**
 * Extracts converted record IDs (Account, Contact, Opportunity) from the Aura response body.
 *
 * @param body - Raw response body string containing the Aura conversion response
 * @returns Converted record identifiers (Account, Contact, and Opportunity)
 */
export function readLeadConversionResult(body: string): LeadConversionResult {
  const envelope = parseAuraEnvelope<LeadConversionResult>(body);

  const conversion = envelope.actions.find(
    (action) => action.returnValue !== null && 'opportunityId' in (action.returnValue ?? {})
  );

  if (!conversion) {
    const summary = envelope.actions.map((action) => `${action.id} (${action.state})`).join(', ');
    throw new Error(
      `Lead conversion action not found in Aura response. Actions received: ${summary || '(none)'}`
    );
  }

  if (conversion.state !== 'SUCCESS') {
    throw new Error(
      `Salesforce lead conversion failed (state: ${conversion.state}): ` +
        JSON.stringify(conversion.error).slice(0, 300)
    );
  }

  return conversion.returnValue as LeadConversionResult;
}
