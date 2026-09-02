import { type APIRequestContext, request } from '@playwright/test';

import { ALLOW_DUPLICATES_HEADER, API_BASE_PATH } from '@constants';

import { logger } from './logger.utils';
import { requestAccessToken, type SalesforceToken } from './sf-jwt-token.utils';

const log = logger('sf-api');

/** Result payload returned by Salesforce REST API upon record creation/update. */
interface SaveResult {
  id: string;
  success: boolean;
  errors: unknown[];
}

export type SalesforceRecord = Record<string, unknown> & { Id: string };

let tokenRequest: Promise<SalesforceToken> | undefined;

/**
 * Retrieves the current worker's Salesforce OAuth token, caching the in-flight request.
 *
 * @returns Promise resolving to active SalesforceToken
 */
function getToken(): Promise<SalesforceToken> {
  tokenRequest ??= requestAccessToken();
  return tokenRequest;
}

/**
 * Creates an authenticated Playwright APIRequestContext against the Salesforce REST API.
 *
 * @returns Object containing the APIRequestContext and token details
 */
async function connect(): Promise<{ http: APIRequestContext; token: SalesforceToken }> {
  const token = await getToken();
  const http = await request.newContext({
    baseURL: token.instanceUrl,
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: {
      Authorization: `Bearer ${token.accessToken}`,
      'Content-Type': 'application/json'
    }
  });
  return { http, token };
}

/**
 * Formats an API error with status code and truncated response body.
 *
 * @param operation - Description of the attempted operation
 * @param status - HTTP response status code
 * @param body - Raw response body
 * @returns Formatted Error instance
 */
function describeFailure(operation: string, status: number, body: string): Error {
  return new Error(`${operation} failed (HTTP ${status}): ${body.slice(0, 500)}`);
}

/**
 * Creates a Salesforce sObject record via REST API.
 *
 * @param objectName - sObject API name (e.g. 'Lead', 'Account')
 * @param fields - Record field values to persist
 * @param allowDuplicates - Whether to bypass duplicate rules using custom headers
 * @returns Newly created 18-character Salesforce record ID
 */
export async function createRecord(
  objectName: string,
  fields: Record<string, unknown>,
  allowDuplicates = false
): Promise<string> {
  const { http } = await connect();
  try {
    const response = await http.post(`${API_BASE_PATH}/sobjects/${objectName}`, {
      data: fields,
      headers: allowDuplicates ? ALLOW_DUPLICATES_HEADER : undefined
    });

    const body = await response.text();
    if (!response.ok()) {
      throw describeFailure(`Creating a ${objectName}`, response.status(), body);
    }

    const saved = JSON.parse(body) as SaveResult;
    log.info('Created a record', { objectName, id: saved.id });
    return saved.id;
  } finally {
    await http.dispose();
  }
}

/**
 * Fetches specified fields of an sObject record by ID.
 *
 * @param objectName - sObject API name (e.g. 'Lead')
 * @param recordId - 18-character record ID
 * @param fields - Array of field API names to retrieve
 * @returns Record data object containing requested fields
 */
export async function getRecord(
  objectName: string,
  recordId: string,
  fields: string[]
): Promise<SalesforceRecord> {
  const { http } = await connect();
  try {
    const response = await http.get(
      `${API_BASE_PATH}/sobjects/${objectName}/${recordId}?fields=${fields.join(',')}`
    );

    const body = await response.text();
    if (!response.ok()) {
      throw describeFailure(`Reading ${objectName} ${recordId}`, response.status(), body);
    }
    return JSON.parse(body) as SalesforceRecord;
  } finally {
    await http.dispose();
  }
}

/**
 * Deletes a Salesforce sObject record by ID via REST API.
 *
 * @param objectName - sObject API name (e.g. 'Lead')
 * @param recordId - 18-character record ID to delete
 * @returns True if deletion succeeded or record was already deleted
 */
export async function deleteRecord(objectName: string, recordId: string): Promise<boolean> {
  const { http } = await connect();
  try {
    const response = await http.delete(`${API_BASE_PATH}/sobjects/${objectName}/${recordId}`);

    if (response.ok()) {
      return true;
    }

    const body = await response.text();
    const alreadyDeleted = response.status() === 404 && body.includes('ENTITY_IS_DELETED');

    if (!alreadyDeleted) {
      log.warn('Could not delete a record', {
        objectName,
        recordId,
        status: response.status(),
        responseDetails: body.slice(0, 200)
      });
    }
    return alreadyDeleted;
  } catch (error) {
    log.warn('Could not delete a record', { objectName, recordId, error: String(error) });
    return false;
  } finally {
    await http.dispose();
  }
}

/**
 * Executes a SOQL query against Salesforce REST API.
 *
 * @param soql - SOQL query string to execute
 * @returns Array of matching Salesforce records
 */
export async function query(soql: string): Promise<SalesforceRecord[]> {
  const { http } = await connect();
  try {
    const response = await http.get(`${API_BASE_PATH}/query/?q=${encodeURIComponent(soql)}`);

    const body = await response.text();
    if (!response.ok()) {
      throw describeFailure('Query', response.status(), body);
    }
    return (JSON.parse(body) as { records: SalesforceRecord[] }).records;
  } finally {
    await http.dispose();
  }
}
