import { ID_PATTERNS, OPPORTUNITY_FIELDS, RECORD_ID_LENGTH, Tags } from '@constants';
import { LEAD_STATUSES, toApiFields } from '@data';
import { expect, test } from '@fixtures';
import type { ConversionBranches } from '@pages';
import { createRecord, getRecord, query } from '@utils';

/** Lead fields read back from the API after conversion. */
const CONVERSION_FIELDS = [
  'Status',
  'IsConverted',
  'ConvertedAccountId',
  'ConvertedContactId',
  'ConvertedOpportunityId'
];

/**
 * Test scenario representing one combination of the Account & Contact conversion decision matrix.
 */
interface ConversionScenario {
  /** Test case title. */
  title: string;

  /** Description of seeded records for pre-condition step. */
  seedDescription: string;

  /** Whether to seed a matching Account prior to conversion. */
  seedAccount: boolean;

  /** Whether to seed a matching Contact prior to conversion. */
  seedContact: boolean;

  /** Target conversion branch configuration. */
  branches: ConversionBranches;
}

const SCENARIOS: readonly ConversionScenario[] = [
  {
    title: 'TC06: Converts a Lead into existing Account and existing Contact',
    seedDescription: 'matching Account and Contact',
    seedAccount: true,
    seedContact: true,
    branches: { account: 'existing', contact: 'existing' }
  },
  {
    title: 'TC07: Converts a Lead into existing Account and new Contact',
    seedDescription: 'matching Account only',
    seedAccount: true,
    seedContact: false,
    branches: { account: 'existing', contact: 'new' }
  },
  {
    title: 'TC08: Converts a Lead into new Account and existing Contact',
    seedDescription: 'matching Contact only',
    seedAccount: false,
    seedContact: true,
    branches: { account: 'new', contact: 'existing' }
  },
  {
    title: 'TC09: Converts a Lead into new Account and new Contact',
    seedDescription: 'no matching records',
    seedAccount: false,
    seedContact: false,
    branches: { account: 'new', contact: 'new' }
  }
];

/**
 * Escapes single quotes for SOQL query string literals.
 *
 * @param value - Raw field value
 * @returns Escaped string safe for SOQL query
 */
function escapeSoql(value: string): string {
  return value.replace(/'/g, "\\'");
}

test.describe('Lead Conversion — Existing vs. New Account/Contact matrix', () => {
  for (const scenario of SCENARIOS) {
    test(
      scenario.title,
      { tag: [Tags.PART_B, Tags.CONVERSION] },
      async ({ page, leadDetailPage, convertModal, opportunityPage, leadData, cleanup }) => {
        const seeded =
          await test.step(`Pre-condition: Seed ${scenario.seedDescription}`, async () => {
            const accountId = scenario.seedAccount
              ? await createRecord('Account', { Name: leadData.company })
              : undefined;
            if (accountId) {
              cleanup.add('Account', accountId);
            }

            if (!scenario.seedContact) {
              return { accountId, contactId: undefined };
            }

            const parentAccountId =
              accountId ??
              (await createRecord('Account', { Name: `Unrelated ${leadData.company}` }));
            if (!accountId) {
              cleanup.add('Account', parentAccountId);
            }

            const contactId = await createRecord(
              'Contact',
              {
                FirstName: leadData.firstName,
                LastName: leadData.lastName,
                Email: leadData.email,
                AccountId: parentAccountId
              },
              true
            );
            cleanup.add('Contact', contactId);

            return { accountId, contactId };
          });

        const leadId = await test.step('Pre-condition: Seed the Lead to convert', async () => {
          const id = await createRecord('Lead', toApiFields(leadData), true);
          cleanup.add('Lead', id);
          return id;
        });

        await test.step('Step 1: Open the Lead and click Convert', async () => {
          await page.goto('/', { waitUntil: 'domcontentloaded' });
          await leadDetailPage.open(leadId);
          await leadDetailPage.startConverting();
          await convertModal.waitUntilPopupOpen();
        });

        await test.step('Step 2: Check which records the modal reports as existing', async () => {
          expect(await convertModal.getMatchCount('Contact')).toBe(scenario.seedContact ? 1 : 0);
          expect(await convertModal.getMatchCount('Account')).toBe(0);
        });

        await test.step(`Step 3: Select ${scenario.branches.account} Account and ${scenario.branches.contact} Contact branches`, async () => {
          await convertModal.setAccountBranch(scenario.branches.account, leadData.company);
          await convertModal.setContactBranch(
            scenario.branches.contact,
            `${leadData.firstName} ${leadData.lastName}`
          );

          expect(await convertModal.readChosenBranches()).toEqual(scenario.branches);
        });

        const converted =
          await test.step('Step 4: Convert and verify which records were reused', async () => {
            await convertModal.convert();

            const lead = await getRecord('Lead', leadId, CONVERSION_FIELDS);
            const accountId = String(lead.ConvertedAccountId);
            const contactId = String(lead.ConvertedContactId);
            const opportunityId = String(lead.ConvertedOpportunityId);

            cleanup.add('Opportunity', opportunityId);
            if (scenario.branches.account === 'new') {
              cleanup.add('Account', accountId);
            }
            if (scenario.branches.contact === 'new') {
              cleanup.add('Contact', contactId);
            }

            expect(lead.IsConverted).toBe(true);
            expect(lead.Status).toBe(LEAD_STATUSES.CONVERTED);
            expect(opportunityId).toHaveLength(RECORD_ID_LENGTH);
            expect(opportunityId).toMatch(ID_PATTERNS.OPPORTUNITY);

            if (scenario.branches.account === 'existing') {
              expect(accountId).toBe(seeded.accountId);
            } else {
              expect(accountId).not.toBe(seeded.accountId);
            }

            if (scenario.branches.contact === 'existing') {
              expect(contactId).toBe(seeded.contactId);
            } else {
              expect(contactId).not.toBe(seeded.contactId);
            }

            return { accountId, contactId, opportunityId };
          });

        await test.step('Step 5: Validate the Opportunity linkage and key values', async () => {
          await opportunityPage.open(converted.opportunityId);

          expect(await opportunityPage.getFieldValue(OPPORTUNITY_FIELDS.ACCOUNT)).toBe(
            leadData.company
          );
          expect(await opportunityPage.getFieldValue(OPPORTUNITY_FIELDS.STAGE)).toBe('Prospecting');
          expect(await opportunityPage.getFieldValue(OPPORTUNITY_FIELDS.OWNER)).not.toBe('');

          const opportunity = await getRecord('Opportunity', converted.opportunityId, [
            'AccountId',
            'StageName'
          ]);
          expect(opportunity.AccountId).toBe(converted.accountId);
          expect(opportunity.StageName).toBe('Prospecting');

          const contactRoles = await query(
            `SELECT ContactId, IsPrimary FROM OpportunityContactRole ` +
              `WHERE OpportunityId = '${converted.opportunityId}'`
          );
          expect(contactRoles).toHaveLength(1);
          expect(contactRoles[0]?.ContactId).toBe(converted.contactId);
        });

        await test.step('Step 6: Validate the conversion left no duplicate Account', async () => {
          const accountsNamedAfterTheLead = await query(
            `SELECT Id FROM Account WHERE Name = '${escapeSoql(leadData.company)}'`
          );
          expect(accountsNamedAfterTheLead).toHaveLength(1);
        });
      }
    );
  }
});
