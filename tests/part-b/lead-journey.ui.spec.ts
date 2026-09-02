import {
  FIELD_LABELS,
  ID_PATTERNS,
  LEAD_FIELDS,
  OPPORTUNITY_FIELDS,
  RECORD_ID_LENGTH,
  Tags
} from '@constants';
import { LEAD_STATUSES } from '@data';
import { expect, test } from '@fixtures';
import { getRecord } from '@utils';

/**
 * Retrieves the converted Opportunity record ID from a converted Lead record via REST API.
 *
 * @param leadId - ID of the converted Lead
 * @returns Opportunity record ID string
 */
async function readConvertedOpportunityId(leadId: string): Promise<string> {
  const lead = await getRecord('Lead', leadId, ['ConvertedOpportunityId']);
  return String(lead.ConvertedOpportunityId);
}

test.describe.configure({ mode: 'serial' });

test.describe('Lead Lifecycle & Conversion — Full UI E2E Flows', () => {
  test(
    'TC01: Creates a Lead via UI, validates detail view fields, and updates Status inline',
    { tag: [Tags.PART_B, Tags.LEAD, Tags.SMOKE] },
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

      await test.step('Step 4: Validate unique 18-digit Lead ID and correct data in details view', async () => {
        expect(leadId).toHaveLength(RECORD_ID_LENGTH);
        expect(leadId).toMatch(ID_PATTERNS.LEAD);

        expect(await leadDetailPage.getFieldValue(LEAD_FIELDS.COMPANY)).toBe(leadData.company);
        expect(await leadDetailPage.getFieldValue(LEAD_FIELDS.EMAIL)).toBe(leadData.email);
        expect(await leadDetailPage.getFieldValue(LEAD_FIELDS.LEAD_SOURCE)).toBe(
          leadData.leadSource
        );
        expect(await leadDetailPage.getFieldValue(LEAD_FIELDS.STATUS)).toBe(LEAD_STATUSES.NEW);
      });

      await test.step('Step 5: Edit the Lead — change Status inline', async () => {
        await leadDetailPage.editPicklistInline(
          LEAD_FIELDS.STATUS,
          FIELD_LABELS.LEAD_STATUS,
          LEAD_STATUSES.WORKING
        );
      });

      await test.step('Step 6: Validate that the status updated correctly', async () => {
        await expect
          .poll(() => leadDetailPage.getFieldValue(LEAD_FIELDS.STATUS))
          .toBe(LEAD_STATUSES.WORKING);
      });
    }
  );

  test(
    'TC02: Converts a Lead and links with pre-existing Account and Contact created via UI',
    { tag: [Tags.PART_B, Tags.CONVERSION, Tags.SMOKE] },
    async ({
      page,
      recordFormPage,
      leadListPage,
      leadFormPage,
      leadDetailPage,
      convertModal,
      opportunityPage,
      leadData,
      cleanup
    }) => {
      let leadId = '';

      await test.step('Pre-condition: Create Account and Contact via UI modals', async () => {
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        cleanup.add('Account', await recordFormPage.createAccount(leadData.company));
        cleanup.add(
          'Contact',
          await recordFormPage.createContact({
            firstName: leadData.firstName,
            lastName: leadData.lastName,
            email: leadData.email,
            accountName: leadData.company
          })
        );
      });

      await test.step('Pre-condition: Create Lead matching existing Account and Contact details', async () => {
        await leadListPage.openNewLeadFormDirectly();
        await leadFormPage.fillForm(leadData);
        await leadFormPage.save();
        await leadDetailPage.waitUntilLoaded();
        leadId = leadDetailPage.getRecordId();
        cleanup.add('Lead', leadId);
      });

      await test.step('Step 1: Convert the Lead — click the Convert button', async () => {
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
        const opportunityId = await readConvertedOpportunityId(leadId);
        cleanup.add('Opportunity', opportunityId);
      });

      await test.step('Step 4: Navigate to the newly created Opportunity page', async () => {
        const opportunityId = await readConvertedOpportunityId(leadId);
        await opportunityPage.open(opportunityId);

        expect(opportunityId).toHaveLength(RECORD_ID_LENGTH);
        expect(opportunityId).toMatch(ID_PATTERNS.OPPORTUNITY);
      });

      await test.step('Step 5: Validate key values (Opportunity Owner, Stage, Account)', async () => {
        expect(await opportunityPage.getFieldValue(OPPORTUNITY_FIELDS.ACCOUNT)).toBe(
          leadData.company
        );
        expect(await opportunityPage.getFieldValue(OPPORTUNITY_FIELDS.STAGE)).toBe('Prospecting');
        expect(await opportunityPage.getFieldValue(OPPORTUNITY_FIELDS.OWNER)).not.toBe('');
      });
    }
  );
});
