import { Tags } from '@constants';
import { toApiFields } from '@data';
import { expect, test } from '@fixtures';
import { createRecord, query } from '@utils';

test.describe('Lead Validation & Duplicate Rules — Negative Scenarios', () => {
  test(
    'TC04: Prevents submission when required fields are missing and displays validation errors',
    { tag: [Tags.PART_B, Tags.NEGATIVE] },
    async ({ page, leadListPage, leadFormPage }) => {
      await test.step('Step 1: Open New Lead creation modal', async () => {
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await leadListPage.openNewLeadFormDirectly();
        await expect.poll(() => leadFormPage.isOpen()).toBe(true);
      });

      const fieldErrors =
        await test.step('Step 2: Attempt save without providing required field values', async () =>
          leadFormPage.saveExpectingErrors());

      await test.step('Step 3: Verify field-level validation errors are shown', async () => {
        expect(fieldErrors.join(' | ')).toContain('Last Name');
        expect(fieldErrors.join(' | ')).toContain('Company');
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

        const leadsWithNoCompany = await query(
          "SELECT Id FROM Lead WHERE Company = '' AND CreatedDate = TODAY"
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
        await leadFormPage.saveExpectingErrors();

        expect(await leadFormPage.isDuplicateWarningShown()).toBe(true);

        const warning = await leadFormPage.getDuplicateWarningText();

        expect(warning).toMatch(/Similar Records Exist/i);
        expect(warning).toMatch(/looks like an existing record/i);
      });

      await test.step('Step 3: Verify duplicate Lead was not committed to database', async () => {
        expect(await leadFormPage.isOpen()).toBe(true);

        const leadsWithThatEmail = await query(
          `SELECT Id FROM Lead WHERE Email = '${leadData.email}'`
        );

        expect(leadsWithThatEmail).toHaveLength(1);
      });
    }
  );
});
