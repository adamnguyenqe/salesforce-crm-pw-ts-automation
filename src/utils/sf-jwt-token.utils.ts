import * as crypto from 'crypto';

import { request } from '@playwright/test';
import { env } from '@config';
import { logger } from './logger.utils';

const log = logger('sf-jwt-token');

export interface SalesforceToken {
  /** OAuth access token. */
  accessToken: string;
  /** Salesforce instance URL for the authenticated org. */
  instanceUrl: string;
}

/** Token endpoint JSON response payload. */
interface TokenEndpointResponse {
  access_token?: string;
  instance_url?: string;
  error?: string;
  error_description?: string;
}

/** Lifetime of the JWT assertion in seconds. */
const REQUEST_VALID_TIMEOUT = 180;

/**
 * Loads and validates the private key from configuration.
 *
 * @returns Private key as a valid PEM string
 * @throws If SF_PRIVATE_KEY is missing or invalid
 */
export function readPrivateKey(): string {
  const tidiedKey = env.sfPrivateKey
    .replace(/^["']|["']$/g, '')
    .replace(/\\n/g, '\n')
    .trim();

  const privateKey = tidiedKey.includes('-----BEGIN') && tidiedKey.includes('PRIVATE KEY-----');

  if (!privateKey) {
    throw new Error(
      'SF_PRIVATE_KEY is missing or is not a valid key. Ensure it is configured in environments/.env.local.'
    );
  }

  return tidiedKey;
}

/**
 * Base64URL-encodes a string or Buffer without padding.
 *
 * @param value - Text or Buffer to encode
 * @returns Base64URL encoded string
 */
function encodeToken(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

/**
 * Generates an RSA-SHA256 signed JWT assertion for Salesforce OAuth 2.0 JWT Bearer flow.
 *
 * @param username - Salesforce username to authenticate as
 * @param privateKey - Private key in PEM format
 * @param audienceUrl - Expected audience URL (e.g. login.salesforce.com or org instance URL)
 * @param clientId - Connected App Consumer Key (Client ID)
 * @returns Signed JWT assertion string
 */
export function buildSignedLoginRequest(
  username: string,
  privateKey: string,
  audienceUrl: string,
  clientId: string = env.sfClientId
): string {
  const nowInSeconds = Math.floor(Date.now() / 1000);

  const jwtHeader = encodeToken(JSON.stringify({ alg: 'RS256' }));

  const jwtPayload = encodeToken(
    JSON.stringify({
      iss: clientId,
      sub: username,
      aud: audienceUrl,
      exp: nowInSeconds + REQUEST_VALID_TIMEOUT
    })
  );

  const signingInput = `${jwtHeader}.${jwtPayload}`;
  const signature = crypto.createSign('RSA-SHA256').update(signingInput).sign(privateKey);

  return `${signingInput}.${encodeToken(signature)}`;
}

/**
 * Requests an OAuth access token using the Salesforce JWT Bearer flow.
 *
 * @param username - Salesforce username to authenticate as
 * @param audienceUrl - Target audience URL for the JWT assertion
 * @returns Promise resolving to the access token and instance URL
 */
export async function requestAccessToken(
  username: string = env.sfUsername,
  audienceUrl: string = env.sfJwtAudience
): Promise<SalesforceToken> {
  const tokenEndpoint = env.sfTokenHost || audienceUrl;

  const assertion = buildSignedLoginRequest(username, readPrivateKey(), audienceUrl);

  // Use ignoreHTTPSErrors to support corporate proxies inspecting TLS traffic.
  const httpClient = await request.newContext({ ignoreHTTPSErrors: true });

  try {
    const response = await httpClient.post(`${tokenEndpoint}/services/oauth2/token`, {
      form: {
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion
      }
    });

    const responseText = await response.text();
    const body = parseJsonResponse(responseText, response.status());

    const succeeded = response.ok() && body.access_token && body.instance_url;
    if (!succeeded) {
      throw new Error(buildLoginFailureMessage(body, responseText, response.status(), audienceUrl));
    }

    log.info('Access token received', {
      username,
      instanceUrl: body.instance_url
    });

    return {
      accessToken: body.access_token as string,
      instanceUrl: body.instance_url as string
    };
  } finally {
    await httpClient.dispose();
  }
}

/**
 * Parses HTTP response text as JSON.
 *
 * @param responseText - Raw response text
 * @param statusCode - HTTP status code
 * @returns Parsed TokenEndpointResponse
 */
function parseJsonResponse(responseText: string, statusCode: number): TokenEndpointResponse {
  try {
    return JSON.parse(responseText) as TokenEndpointResponse;
  } catch {
    throw new Error(
      `Failed to parse token response as JSON (HTTP ${statusCode}): ${responseText.slice(0, 300)}`
    );
  }
}

/** Known causes for common Salesforce OAuth error codes. */
const COMMON_CAUSES: Record<string, string> = {
  app_not_found:
    'Connected App not recognized. Verify SF_JWT_AUDIENCE matches your org URL (SF_INSTANCE_URL).',

  invalid_client_id: 'SF_CLIENT_ID does not match any Connected App in this Salesforce org.',

  invalid_grant:
    'Authentication rejected. Verify user pre-approval on the Connected App, certificate key pair match, and system clock sync.'
};

/** Fallback cause description for unrecognized OAuth errors. */
const UNKNOWN_CAUSE = 'Check Connected App settings, permissions, and username.';

/**
 * Formats a comprehensive error message when JWT authentication fails.
 *
 * @param response - Parsed response payload
 * @param rawText - Raw response text fallback
 * @param statusCode - HTTP status code
 * @param audience - The audience URL used in the request
 * @returns Formatted multi-line error string
 */
function buildLoginFailureMessage(
  response: TokenEndpointResponse,
  rawText: string,
  statusCode: number,
  audience: string
): string {
  const errorCode = response.error ?? 'unknown error';
  const errorDescription = response.error_description ?? rawText.slice(0, 300);
  const probableCause = COMMON_CAUSES[errorCode] ?? UNKNOWN_CAUSE;

  return [
    `Salesforce authentication failed (HTTP ${statusCode})`,
    `Error: ${errorCode} — ${errorDescription}`,
    `Audience: ${audience}`,
    `Resolution: ${probableCause}`
  ].join('\n');
}

/**
 * Constructs a frontdoor.jsp login URL for direct browser session establishment.
 *
 * @param token - Salesforce authentication token containing accessToken and instanceUrl
 * @param pageToLandOn - Relative path to navigate to after authentication
 * @returns Full frontdoor URL with return redirect
 */
export function buildLoggedInBrowserUrl(
  token: SalesforceToken,
  pageToLandOn = '/lightning/page/home'
): string {
  const frontDoor = `${token.instanceUrl}/secur/frontdoor.jsp?sid=${token.accessToken}`;
  return `${frontDoor}&retURL=${encodeURIComponent(pageToLandOn)}`;
}
