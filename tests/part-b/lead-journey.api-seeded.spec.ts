import {
  FIELD_LABELS,
  ID_PATTERNS,
  LEAD_FIELDS,
  OPPORTUNITY_FIELDS,
  RECORD_ID_LENGTH,
  Tags
} from '@constants';
import { LEAD_STATUSES, toApiFields } from '@data';
import { expect, test } from '@fixtures';
import { createRecord, getRecord, query } from '@utils';

test.describe('Lead Lifecycle & Conversion — API-Seeded Flows', () => {
  test(
    'TC01: Creates a Lead from the Sales app, validates field values, and updates Status inline',
    { tag: [Tags.PART_B, Tags.LEAD] },
    async ({
      page,
      appLauncher,
      leadListPage,
      leadFormPage,
      leadDetailPage,
      leadData,
      cleanup
    }) => {
      await test.step('Navigate to Sales application via App Launcher', async () => {
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await appLauncher.openApp('Sales');
      });

      await test.step('Create a new Lead with randomized data attributes', async () => {
        await leadListPage.open();
        await leadListPage.startNewLead();

        await expect.poll(() => leadFormPage.isOpen()).toBe(true);
        await leadFormPage.fillForm(leadData);
      });

      await test.step('Save Lead record and await detail view render', async () => {
        await leadFormPage.save();
        await leadDetailPage.waitUntilLoaded();
      });

      const leadId = leadDetailPage.getRecordId();
      cleanup.add('Lead', leadId);

      await test.step('Validate Lead record ID format (18 characters) and REST API record existence', async () => {
        expect(leadId).toHaveLength(RECORD_ID_LENGTH);
        expect(leadId).toMatch(ID_PATTERNS.LEAD);

        const savedLead = await getRecord('Lead', leadId, ['Id', 'Company', 'Email']);

        expect(savedLead.Id).toBe(leadId);
      });

      await test.step('Validate field values in UI details view against created data', async () => {
        expect(await leadDetailPage.getFieldValue(LEAD_FIELDS.COMPANY)).toBe(leadData.company);
        expect(await leadDetailPage.getFieldValue(LEAD_FIELDS.EMAIL)).toBe(leadData.email);
        expect(await leadDetailPage.getFieldValue(LEAD_FIELDS.LEAD_SOURCE)).toBe(
          leadData.leadSource
        );

        const savedLead = await getRecord('Lead', leadId, ['Company', 'Email', 'Status']);
        expect(savedLead.Company).toBe(leadData.company);
        expect(savedLead.Email).toBe(leadData.email);
        expect(savedLead.Status).toBe(LEAD_STATUSES.NEW);
      });

      await test.step('Update Lead Status inline from Details view', async () => {
        await leadDetailPage.editPicklistInline(
          LEAD_FIELDS.STATUS,
          FIELD_LABELS.LEAD_STATUS,
          LEAD_STATUSES.WORKING
        );
      });

      await test.step('Verify updated Status in UI and via REST API query', async () => {
        await expect
          .poll(() => leadDetailPage.getFieldValue(LEAD_FIELDS.STATUS))
          .toBe(LEAD_STATUSES.WORKING);

        const updatedLead = await getRecord('Lead', leadId, ['Status']);
        expect(updatedLead.Status).toBe(LEAD_STATUSES.WORKING);
      });
    }
  );

  test(
    'TC02: Converts a Lead and links with pre-existing Account and Contact records',
    { tag: [Tags.PART_B, Tags.CONVERSION] },
    async ({ page, leadDetailPage, convertModal, opportunityPage, leadData, cleanup }) => {
      const seeded =
        await test.step('Pre-condition: Seed Account and Contact via REST API', async () => {
          const accountId = await createRecord('Account', { Name: leadData.company });
          cleanup.add('Account', accountId);

          const contactId = await createRecord(
            'Contact',
            {
              FirstName: leadData.firstName,
              LastName: leadData.lastName,
              Email: leadData.email,
              AccountId: accountId
            },
            true
          );
          cleanup.add('Contact', contactId);

          return { accountId, contactId };
        });

      const leadId =
        await test.step('Seed Lead matching existing Account and Contact details', async () => {
          const id = await createRecord('Lead', toApiFields(leadData), true);
          cleanup.add('Lead', id);
          return id;
        });

      await test.step('Open Convert modal from Lead detail view', async () => {
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await page.goto(new URL(`/lightning/r/Lead/${leadId}/view`, page.url()).toString(), {
          waitUntil: 'domcontentloaded'
        });
        await leadDetailPage.waitUntilLoaded();
        await leadDetailPage.startConverting();
        await convertModal.waitUntilPopupOpen();

        expect(await convertModal.getMatchCount('Contact')).toBeGreaterThan(0);
        expect(await convertModal.getMatchCount('Account')).toBe(0);
        expect(await convertModal.readChosenBranches()).toEqual({
          account: 'new',
          contact: 'new'
        });
      });

      await test.step('Select existing Account and Contact branches in conversion modal', async () => {
        await convertModal.chooseExistingAccount(leadData.company);
        await convertModal.chooseExistingContact(`${leadData.firstName} ${leadData.lastName}`);

        expect(await convertModal.readChosenBranches()).toEqual({
          account: 'existing',
          contact: 'existing'
        });
      });

      await test.step('Submit conversion and validate Opportunity, Account, and Contact linkages', async () => {
        await convertModal.convert();

        const converted = await getRecord('Lead', leadId, [
          'Status',
          'IsConverted',
          'ConvertedAccountId',
          'ConvertedContactId',
          'ConvertedOpportunityId'
        ]);

        const opportunityId = String(converted.ConvertedOpportunityId);
        cleanup.add('Opportunity', opportunityId);

        await opportunityPage.open(opportunityId);

        expect(opportunityId).toHaveLength(RECORD_ID_LENGTH);
        expect(opportunityId).toMatch(ID_PATTERNS.OPPORTUNITY);
        expect(await opportunityPage.getFieldValue(OPPORTUNITY_FIELDS.ACCOUNT)).toBe(
          leadData.company
        );
        expect(await opportunityPage.getFieldValue(OPPORTUNITY_FIELDS.STAGE)).toBe('Prospecting');
        expect(await opportunityPage.getFieldValue(OPPORTUNITY_FIELDS.OWNER)).not.toBe('');
        expect(converted.IsConverted).toBe(true);
        expect(converted.Status).toBe(LEAD_STATUSES.CONVERTED);
        expect(converted.ConvertedAccountId).toBe(seeded.accountId);
        expect(converted.ConvertedContactId).toBe(seeded.contactId);
        expect(converted.ConvertedOpportunityId).toBe(opportunityId);

        const opportunity = await getRecord('Opportunity', opportunityId, [
          'AccountId',
          'StageName',
          'OwnerId'
        ]);
        expect(opportunity.AccountId).toBe(seeded.accountId);
        expect(opportunity.StageName).toBe('Prospecting');

        const accountsWithThatName = await query(
          `SELECT Id FROM Account WHERE Name = '${leadData.company.replace(/'/g, "\\'")}'`
        );
        expect(accountsWithThatName).toHaveLength(1);

        const contactRoles = await query(
          `SELECT ContactId, IsPrimary FROM OpportunityContactRole ` +
            `WHERE OpportunityId = '${opportunityId}'`
        );
        expect(contactRoles).toHaveLength(1);
        expect(contactRoles[0]?.ContactId).toBe(seeded.contactId);
      });
    }
  );
});
