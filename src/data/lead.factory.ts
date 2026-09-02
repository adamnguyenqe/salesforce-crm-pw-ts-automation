import { faker } from '@faker-js/faker';

/** Salesforce schema maximum character lengths for Lead standard fields. */
const MAX_LENGTHS = {
  firstName: 40,
  lastName: 80,
  company: 255,
  email: 80,
  phone: 40,
  title: 128,
  city: 40
} as const;

/** Available Lead Source picklist values. */
export const LEAD_SOURCES = [
  'Web',
  'Phone Inquiry',
  'Partner Referral',
  'Purchased List',
  'Other'
] as const;

/** Standard Lead Status picklist values. */
export const LEAD_STATUSES = {
  NEW: 'Open - Not Contacted',
  WORKING: 'Working - Contacted',
  CONVERTED: 'Closed - Converted',
  CLOSED: 'Closed - Not Converted'
} as const;

/** Interface representing structured Lead test data attributes. */
export interface LeadData {
  firstName: string;
  lastName: string;
  company: string;
  email: string;
  phone: string;
  title: string;
  leadSource: string;
}

/**
 * Truncates a string value if it exceeds the specified maximum length.
 *
 * @param value - Text value to inspect
 * @param limit - Maximum allowed character count
 * @returns Truncated string within limit
 */
function fit(value: string, limit: number): string {
  return value.length <= limit ? value : value.slice(0, limit);
}

/**
 * Strips apostrophes from generated names to avoid Salesforce lookup query parsing issues.
 *
 * @param value - Raw text string
 * @returns String with apostrophes removed
 */
function withoutApostrophes(value: string): string {
  return value.replace(/['\u2019]/g, '');
}

/**
 * Generates randomized Lead test data with collision-resistant markers.
 *
 * @param overrides - Optional property overrides
 * @returns Complete LeadData object
 */
export function buildLead(overrides: Partial<LeadData> = {}): LeadData {
  const marker = faker.string.alphanumeric(6).toLowerCase();

  return {
    firstName: fit(withoutApostrophes(faker.person.firstName()), MAX_LENGTHS.firstName),
    lastName: fit(withoutApostrophes(`${faker.person.lastName()}-${marker}`), MAX_LENGTHS.lastName),
    company: fit(withoutApostrophes(`${faker.company.name()} ${marker}`), MAX_LENGTHS.company),
    // `.invalid` is reserved and can never be delivered to.
    email: fit(`qa.${marker}@example.invalid`.toLowerCase(), MAX_LENGTHS.email),
    phone: fit(faker.phone.number(), MAX_LENGTHS.phone),
    title: fit(faker.person.jobTitle(), MAX_LENGTHS.title),
    leadSource: faker.helpers.arrayElement(LEAD_SOURCES),
    ...overrides
  };
}

/**
 * Transforms a LeadData object into Salesforce REST API sObject field payload.
 *
 * @param lead - Lead data object
 * @returns Key-value payload matching Salesforce Lead sObject schema
 */
export function toApiFields(lead: LeadData): Record<string, unknown> {
  return {
    FirstName: lead.firstName,
    LastName: lead.lastName,
    Company: lead.company,
    Email: lead.email,
    Phone: lead.phone,
    Title: lead.title,
    LeadSource: lead.leadSource
  };
}
