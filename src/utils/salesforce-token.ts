import * as crypto from 'crypto';

import { request } from '@playwright/test';
import { env } from '@config';
import { logger } from './logger';

const log = logger('salesforce-token');

export interface SalesforceToken {
  /** The temporary key that stands in for a username and password. */
  accessToken: string;
  instanceUrl: string;
}

/** JSON response from the token endpoint. */
interface TokenEndpointResponse {
  access_token?: string;
  instance_url?: string;
  error?: string;
  error_description?: string;
}

/**
 * Timeout for which the signed request is valid.
 */
const REQUEST_VALID_TIMEOUT = 180;

/**
 * Read the private key from the SF_PRIVATE_KEY setting.
 *
 * @returns The private key as valid PEM text
 */
export function readPrivateKey(): string {
  const tidiedKey = env.sfPrivateKey
    .replace(/^["']|["']$/g, '')
    .replace(/\\n/g, '\n')
    .trim();

  const privateKey = tidiedKey.includes('-----BEGIN') && tidiedKey.includes('PRIVATE KEY-----');

  if (!privateKey) {
    throw new Error(
      'SF_PRIVATE_KEY is missing or is not a valid key. Copy the whole contents ' +
        'of server.key into environments/.env.local as one quoted line, with ' +
        'every line break written as \\n.'
    );
  }

  return tidiedKey;
}

/**
 * Encode text the particular way this kind of signed request requires.
 *
 * @param value - The text or bytes to encode
 * @returns The encoded text
 */
function encodeToken(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

/**
 * Build the signed request that asks Salesforce for a token.
 *
 * @param usernameToLoginAs - Which Salesforce user to log in as
 * @param privateKey - Our private key, from readPrivateKey()
 * @param salesforceLoginUrl - Which Salesforce should accept this request
 * @param connectedAppKey - Consumer Key of the Connected App
 * @returns The signed request, ready to send
 */
export function buildSignedLoginRequest(
  usernameToLoginAs: string,
  privateKey: string,
  salesforceLoginUrl: string,
  connectedAppKey: string = env.sfClientId
): string {
  const expiresInSeconds = Math.floor(Date.now() / 1000);

  const whatKindOfSeal = encodeToken(JSON.stringify({ alg: 'RS256' }));

  const whatWeAreAsking = encodeToken(
    JSON.stringify({
      iss: connectedAppKey,
      sub: usernameToLoginAs,
      aud: salesforceLoginUrl,
      exp: expiresInSeconds + REQUEST_VALID_TIMEOUT
    })
  );

  const unsignedLetter = `${whatKindOfSeal}.${whatWeAreAsking}`;

  const seal = crypto.createSign('RSA-SHA256').update(unsignedLetter).sign(privateKey);

  return `${unsignedLetter}.${encodeToken(seal)}`;
}

/**
 * Request access token from Salesforce org.
 *
 * @param usernameToLoginAs - Which Salesforce user to log in as
 * @param salesforceLoginUrl - Which Salesforce should accept the request
 * @returns The access token and the org's address
 */
export async function requestAccessToken(
  usernameToLoginAs: string = env.sfUsername,
  salesforceLoginUrl: string = env.sfJwtAudience
): Promise<SalesforceToken> {
  // Usually the same address, but they can differ, so both are configurable.
  const whereToSendTheRequest = env.sfTokenHost || salesforceLoginUrl;

  const signedRequest = buildSignedLoginRequest(
    usernameToLoginAs,
    readPrivateKey(),
    salesforceLoginUrl
  );

  // `ignoreHTTPSErrors` is needed on networks where a company proxy inspects
  // secure traffic; without it the request fails with a certificate error.
  const httpClient = await request.newContext({ ignoreHTTPSErrors: true });

  try {
    const response = await httpClient.post(`${whereToSendTheRequest}/services/oauth2/token`, {
      form: {
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: signedRequest
      }
    });

    const responseText = await response.text();
    const body = parseJsonResponse(responseText, response.status());

    const succeeded = response.ok() && body.access_token && body.instance_url;
    if (!succeeded) {
      throw new Error(
        buildLoginFailureMessage(body, responseText, response.status(), salesforceLoginUrl)
      );
    }

    log.info('Access token received', {
      username: usernameToLoginAs,
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
 * Parse the response text into JSON.
 *
 * @param responseText - What Salesforce sent back
 * @param statusCode - The HTTP status, used in the error message
 * @returns The parsed response
 */
function parseJsonResponse(responseText: string, statusCode: number): TokenEndpointResponse {
  try {
    return JSON.parse(responseText) as TokenEndpointResponse;
  } catch {
    throw new Error(
      `Salesforce replied with something that is not JSON (HTTP ${statusCode}): ` +
        responseText.slice(0, 300)
    );
  }
}

/**
 * What each Salesforce error code usually means in practice.
 *
 * Salesforce replies with a short code such as `invalid_grant` and little
 * else, which is not much help the first time you set this up. These are the
 * causes that actually come up, written as the thing to go and check.
 */
const COMMON_CAUSES: Record<string, string> = {
  app_not_found:
    'Newer Connected Apps expect your own org address as the audience, not ' +
    'login.salesforce.com. Try setting SF_JWT_AUDIENCE to the same value as ' +
    'SF_INSTANCE_URL.',

  invalid_client_id: 'SF_CLIENT_ID does not match any Connected App in this org.',

  invalid_grant:
    'Usually one of three things: the user has not been approved on the ' +
    'Connected App, the private key does not match the uploaded certificate, ' +
    "or this machine's clock is wrong."
};

/** Shown when the error code is not one we have seen before. */
const UNKNOWN_CAUSE = 'Check the Connected App settings and the username.';

/**
 * Turn Salesforce's terse refusal into a message that says what to fix.
 *
 * @param response - Response from Salesforce org.
 * @param rawText - The unparsed reply, used when there is no description.
 * @param statusCode - The HTTP status.
 * @param audienceWeSent - The org address we claimed to be logging in to.
 * @returns A multi-line message: what failed.
 */
function buildLoginFailureMessage(
  response: TokenEndpointResponse,
  rawText: string,
  statusCode: number,
  audienceWeSent: string
): string {
  const errorCode = response.error ?? 'unknown error';
  const salesforceSaid = response.error_description ?? rawText.slice(0, 300);
  const probaleCause = COMMON_CAUSES[errorCode] ?? UNKNOWN_CAUSE;

  return [
    `Could not log in to Salesforce (HTTP ${statusCode})`,
    `Salesforce returned: ${errorCode} — ${salesforceSaid}`,
    `Logged in to: ${audienceWeSent}`,
    `What to check: ${probaleCause}`
  ].join('\n');
}

/**
 * Build the web address that turns a token into a logged-in browser.
 *
 * @param token - The access token and org address
 * @param pageToLandOn - Where to go once logged in
 * @returns The address to open in the browser
 */
export function buildLoggedInBrowserUrl(
  token: SalesforceToken,
  pageToLandOn = '/lightning/page/home'
): string {
  const frontDoor = `${token.instanceUrl}/secur/frontdoor.jsp?sid=${token.accessToken}`;
  return `${frontDoor}&retURL=${encodeURIComponent(pageToLandOn)}`;
}
