import { ID_PATTERNS, RECORD_ID_LENGTH, Tags } from '@constants';
import { LEAD_STATUSES, toApiFields } from '@data';
import { expect, test } from '@fixtures';
import { createRecord, getRecord, parseAuraEnvelope, readLeadConversionResult } from '@utils';

test.describe('Lead Conversion — Aura Action Response Interception', () => {
  test(
    'TC03: Validates conversion Aura response payload and verify created entity IDs',
    { tag: [Tags.PART_B, Tags.CONVERSION, Tags.API] },
    async ({ page, leadDetailPage, convertModal, leadData, cleanup }) => {
      const leadId = await test.step('Pre-condition: Seed a Lead record via REST API', async () => {
        const id = await createRecord('Lead', toApiFields(leadData));
        cleanup.add('Lead', id);
        return id;
      });

      await test.step('Step 1: Open conversion modal from Lead detail view', async () => {
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await page.goto(new URL(`/lightning/r/Lead/${leadId}/view`, page.url()).toString(), {
          waitUntil: 'domcontentloaded'
        });
        await leadDetailPage.waitUntilLoaded();
        await leadDetailPage.startConverting();
        await convertModal.waitUntilPopupOpen();
      });

      const responseBody =
        await test.step('Step 2: Trigger conversion and capture backend Aura XHR response', async () =>
          convertModal.convertAndCaptureResponse());

      await test.step('Step 3: Assert deep properties in JSON response (Aura state & converted entity IDs)', async () => {
        const envelope = parseAuraEnvelope(responseBody);
        expect(envelope.actions.length).toBeGreaterThan(0);
        expect(envelope.actions[0]?.state).toBe('SUCCESS');

        const result = readLeadConversionResult(responseBody);

        expect(result.opportunityId).toBeDefined();
        expect(result.opportunityId).toHaveLength(RECORD_ID_LENGTH);
        expect(result.opportunityId).toMatch(ID_PATTERNS.OPPORTUNITY);
        expect(result.hasError).toBe(false);
        expect(result.accountId).toMatch(ID_PATTERNS.ACCOUNT);
        expect(result.contactId).toMatch(ID_PATTERNS.CONTACT);
        expect(result.isPersonAccount).toBe(false);

        cleanup.add('Opportunity', result.opportunityId);
        cleanup.add('Contact', result.contactId);
        cleanup.add('Account', result.accountId);
      });

      await test.step('Step 4: Cross-check converted record linkages via REST API', async () => {
        const result = readLeadConversionResult(responseBody);
        const convertedLead = await getRecord('Lead', leadId, [
          'Status',
          'IsConverted',
          'ConvertedAccountId',
          'ConvertedContactId',
          'ConvertedOpportunityId'
        ]);

        expect(convertedLead.IsConverted).toBe(true);
        expect(convertedLead.Status).toBe(LEAD_STATUSES.CONVERTED);
        expect(convertedLead.ConvertedOpportunityId).toBe(result.opportunityId);
        expect(convertedLead.ConvertedAccountId).toBe(result.accountId);
        expect(convertedLead.ConvertedContactId).toBe(result.contactId);

        const opportunity = await getRecord('Opportunity', result.opportunityId, [
          'StageName',
          'AccountId'
        ]);
        expect(opportunity.StageName).toBe('Prospecting');
        expect(opportunity.AccountId).toBe(result.accountId);
      });
    }
  );
});
