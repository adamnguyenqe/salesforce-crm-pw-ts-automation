/**
 * Salesforce field API names, used to find fields on a page.
 */

/** Fields on a Lead. */
export const LEAD_FIELDS = {
  OWNER: 'Lead.OwnerId',
  NAME: 'Lead.Name',
  COMPANY: 'Lead.Company',
  TITLE: 'Lead.Title',
  EMAIL: 'Lead.Email',
  PHONE: 'Lead.Phone',
  MOBILE: 'Lead.MobilePhone',
  WEBSITE: 'Lead.Website',
  LEAD_SOURCE: 'Lead.LeadSource',
  STATUS: 'Lead.Status',
  INDUSTRY: 'Lead.Industry',
  RATING: 'Lead.Rating',
  DESCRIPTION: 'Lead.Description'
} as const;

/** Fields on an Opportunity. */
export const OPPORTUNITY_FIELDS = {
  NAME: 'Opportunity.Name',
  ACCOUNT: 'Opportunity.AccountId',
  STAGE: 'Opportunity.StageName',
  CLOSE_DATE: 'Opportunity.CloseDate',
  AMOUNT: 'Opportunity.Amount',
  OWNER: 'Opportunity.OwnerId'
} as const;

/** Fields on an Account. */
export const ACCOUNT_FIELDS = {
  NAME: 'Account.Name'
} as const;

/** Fields on a Contact. */
export const CONTACT_FIELDS = {
  NAME: 'Contact.Name',
  EMAIL: 'Contact.Email',
  ACCOUNT: 'Contact.AccountId'
} as const;

/** Field labels */
export const FIELD_LABELS = {
  LEAD_STATUS: 'Lead Status',
  LEAD_SOURCE: 'Lead Source',
  COMPANY: 'Company',
  ACCOUNT_NAME: 'Account Name'
} as const;
