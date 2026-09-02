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
      await test.step('Step 1: Go to the Sales App via App Launcher', async () => {
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await appLauncher.openApp('Sales');
      });

      await test.step('Step 2: Create a new Lead with randomly generated details', async () => {
        await leadListPage.open();
        await leadListPage.startNewLead();

        await expect.poll(() => leadFormPage.isOpen()).toBe(true);
        await leadFormPage.fillForm(leadData);
      });

      await test.step('Step 3: Save the Lead and wait for detail view', async () => {
        await leadFormPage.save();
        await leadDetailPage.waitUntilLoaded();
      });

      const leadId = leadDetailPage.getRecordId();
      cleanup.add('Lead', leadId);

      await test.step('Step 4: Validate unique 18-digit Lead ID and details view data (UI & API)', async () => {
        expect(leadId).toHaveLength(RECORD_ID_LENGTH);
        expect(leadId).toMatch(ID_PATTERNS.LEAD);

        const savedLead = await getRecord('Lead', leadId, ['Id', 'Company', 'Email', 'Status']);
        expect(savedLead.Id).toBe(leadId);
        expect(await leadDetailPage.getFieldValue(LEAD_FIELDS.COMPANY)).toBe(leadData.company);
        expect(await leadDetailPage.getFieldValue(LEAD_FIELDS.EMAIL)).toBe(leadData.email);
        expect(await leadDetailPage.getFieldValue(LEAD_FIELDS.LEAD_SOURCE)).toBe(
          leadData.leadSource
        );

        expect(savedLead.Company).toBe(leadData.company);
        expect(savedLead.Email).toBe(leadData.email);
        expect(savedLead.Status).toBe(LEAD_STATUSES.NEW);
      });

      await test.step('Step 5: Edit the Lead — change Status inline', async () => {
        await leadDetailPage.editPicklistInline(
          LEAD_FIELDS.STATUS,
          FIELD_LABELS.LEAD_STATUS,
          LEAD_STATUSES.WORKING
        );
      });

      await test.step('Step 6: Validate that the status updated correctly (UI & API)', async () => {
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
        await test.step('Pre-condition: Seed Lead matching existing Account and Contact details', async () => {
          const id = await createRecord('Lead', toApiFields(leadData), true);
          cleanup.add('Lead', id);
          return id;
        });

      await test.step('Step 1: Convert the Lead — click the Convert button', async () => {
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

      await test.step('Step 2: In the conversion modal, check existence and link to existing Account and Contact', async () => {
        await convertModal.chooseExistingAccount(leadData.company);
        await convertModal.chooseExistingContact(`${leadData.firstName} ${leadData.lastName}`);

        expect(await convertModal.readChosenBranches()).toEqual({
          account: 'existing',
          contact: 'existing'
        });
      });

      await test.step('Step 3: Validate Opportunity, Account, and Contact linkages', async () => {
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
      });

      await test.step('Step 4: Navigate to the newly created Opportunity page', async () => {
        const converted = await getRecord('Lead', leadId, ['ConvertedOpportunityId']);
        const opportunityId = String(converted.ConvertedOpportunityId);
        await opportunityPage.open(opportunityId);

        expect(opportunityId).toHaveLength(RECORD_ID_LENGTH);
        expect(opportunityId).toMatch(ID_PATTERNS.OPPORTUNITY);
      });

      await test.step('Step 5: Validate key values (Opportunity Owner, Stage, Account)', async () => {
        const converted = await getRecord('Lead', leadId, [
          'Status',
          'IsConverted',
          'ConvertedAccountId',
          'ConvertedContactId',
          'ConvertedOpportunityId'
        ]);
        const opportunityId = String(converted.ConvertedOpportunityId);

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
