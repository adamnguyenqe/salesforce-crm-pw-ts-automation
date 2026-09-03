import { Tags } from '@constants';
import { toApiFields } from '@data';
import { expect, test } from '@fixtures';
import { createRecord, query } from '@utils';

test.describe('Lead Validation & Duplicate Rules — Negative Scenarios', () => {
  test(
    'TC04: Prevents submission when required fields are missing and displays validation errors',
    { tag: [Tags.PART_B, Tags.NEGATIVE] },
    async ({ page, leadListPage, leadFormPage, leadData }) => {
      await test.step('Step 1: Open New Lead creation modal', async () => {
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await leadListPage.openNewLeadFormDirectly();
        await expect.poll(() => leadFormPage.isOpen()).toBe(true);
      });

      await test.step('Step 1b: Provide only a uniquely marked Last Name, leaving Company empty', async () => {
        await leadFormPage.fillForm({ lastName: leadData.lastName });
      });

      const fieldErrors =
        await test.step('Step 2: Attempt save with the required Company field still empty', async () =>
          leadFormPage.saveExpectingErrors());

      await test.step('Step 3: Verify field-level validation errors are shown', async () => {
        // Last Name was supplied in Step 1b to make the record traceable, so Company
        // is the remaining required field Salesforce should complain about.
        expect(fieldErrors.join(' | ')).toContain('Company');
        expect(fieldErrors.join(' | ')).not.toContain('Last Name');
        expect(fieldErrors.some((error) => /Complete this field/i.test(error))).toBe(true);
      });

      await test.step('Step 4: Verify top-level error banner summary is displayed', async () => {
        const banner = await leadFormPage.getErrorBanner();

        expect(banner).not.toBe('');
        expect(banner).toMatch(/Review the following fields/i);
        expect(banner).toContain('Company');
      });

      await test.step('Step 5: Verify record was not committed to database', async () => {
        expect(await leadFormPage.isOpen()).toBe(true);

        // Scoped to this test's own marked Last Name. An org-wide sweep would be
        // tripped by any other Lead-creating test running in parallel.
        const leadsWithNoCompany = await query(
          `SELECT Id FROM Lead WHERE Company = '' AND LastName = '${leadData.lastName}'`
        );

        expect(leadsWithNoCompany).toHaveLength(0);
      });
    }
  );

  test(
    'TC05: Triggers duplicate warning modal when creating Lead with matching email address',
    { tag: [Tags.PART_B, Tags.NEGATIVE] },
    async ({ page, leadListPage, leadFormPage, leadData, cleanup }) => {
      await test.step('Pre-condition: Verify active Lead duplicate rules exist in Salesforce org', async () => {
        const activeRules = await query(
          'SELECT Id, DeveloperName FROM DuplicateRule ' +
          "WHERE SobjectType = 'Lead' AND IsActive = true"
        );

        test.skip(
          activeRules.length === 0,
          'No active Lead duplicate rule found in org. ' +
          'Enable Standard_Lead_Duplicate_Rule under Setup > Duplicate Rules to run.'
        );
      });

      await test.step('Pre-condition: Seed original Lead record via REST API', async () => {
        const existingLeadId = await createRecord('Lead', toApiFields(leadData));
        cleanup.add('Lead', existingLeadId);
      });

      await test.step('Step 1: Open creation modal and input duplicate Lead details with same email', async () => {
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await leadListPage.openNewLeadFormDirectly();

        await expect.poll(() => leadFormPage.isOpen()).toBe(true);

        await leadFormPage.fillForm(leadData);
      });

      await test.step('Step 2: Trigger save and verify duplicate warning dialog is displayed', async () => {
        expect(await leadFormPage.isDuplicateWarningShown()).toBe(true);

        const warning = await leadFormPage.getDuplicateWarningText();

        expect(warning).toMatch(/Similar Records Exist/i);
        expect(warning).toMatch(/looks like an existing record/i);
      });
    }
  );
});
