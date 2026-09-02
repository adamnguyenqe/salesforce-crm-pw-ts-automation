import type { Locator } from '@playwright/test';

import { TIMEOUTS } from '@constants';
import { waitForLeadConversionCall } from '@utils';

import { BasePage } from './base.page';

export type ConversionChoice = 'existing' | 'new';

export interface ConversionBranches {
  account: ConversionChoice;
  contact: ConversionChoice;
}

/**
 * Page object representing the Salesforce 'Convert Lead' modal dialog.
 */
export class LeadConvertModalPage extends BasePage {
  private readonly convertButton = this.modal.getByRole('button', { name: 'Convert', exact: true });
  private readonly accountSearchBox = this.modal.getByPlaceholder('Search for matching accounts');
  private readonly contactSearchBox = this.modal.getByPlaceholder('Search for matching contacts');

  /** Heading element displayed on successful conversion screen. */
  private readonly successHeading = this.page.getByText('Your lead has been converted');

  /**
   * Waits for the Convert Lead modal to open and render initial match queries.
   */
  async waitUntilPopupOpen(): Promise<void> {
    await this.modal.waitFor({ state: 'visible', timeout: TIMEOUTS.SALESFORCE_LOADING });
    await this.convertButton.waitFor({ state: 'visible', timeout: TIMEOUTS.SCREEN_APPEARS });

    await this.modal
      .getByText(/\d+ Account Match/)
      .last()
      .waitFor({ state: 'visible', timeout: TIMEOUTS.SALESFORCE_LOADING })
      .catch(() => this.log.warn('Account match count indicator not rendered in time'));

    await this.waitUntilIdle(TIMEOUTS.SCREEN_APPEARS);
    this.log.info('Convert Lead modal opened');
  }

  /**
   * Selects an SLDS radio button by clicking its associated label or pressing Space.
   *
   * @param radio - Target radio input Locator
   */
  private async selectRadio(radio: Locator): Promise<void> {
    const radioId = await radio.first().getAttribute('id');
    if (!radioId) {
      await this.click(radio.first());
      return;
    }

    const escapedId = radioId.replace(/:/g, '\\:');
    const label = this.modal.locator(`label[for="${escapedId}"]`);

    try {
      await label.first().click({ timeout: TIMEOUTS.SCREEN_APPEARS });
    } catch {
      this.log.debug('Label click failed; selecting radio input via keyboard Space');
      await radio.first().focus();
      await this.page.keyboard.press('Space');
    }
  }

  /**
   * Selects a conversion radio option by its accessible name.
   *
   * @param optionLabel - Display text of the radio option (e.g. 'Choose Existing Account')
   */
  private async chooseOption(optionLabel: string): Promise<void> {
    await this.selectRadio(this.modal.getByRole('radio', { name: optionLabel, exact: true }));
    await this.waitUntilIdle(TIMEOUTS.SCREEN_APPEARS);
  }

  /**
   * Retrieves the matched record count displayed in the modal header for an sObject.
   *
   * @param objectName - Target sObject ('Account' or 'Contact')
   * @returns Match count integer (0 if none found)
   */
  async getMatchCount(objectName: 'Account' | 'Contact'): Promise<number> {
    const matchLabel = this.modal.getByText(new RegExp(`\\d+ ${objectName} Match`)).last();
    const countAppeared = await this.isElementVisible(matchLabel, TIMEOUTS.SCREEN_APPEARS);
    if (!countAppeared) {
      this.log.warn('Match count text not visible', { objectName });
      return 0;
    }

    const text = await matchLabel.innerText();
    return Number(/(\d+)/.exec(text)?.[1] ?? 0);
  }

  /**
   * Configures modal to associate the Lead with an existing Account by name.
   *
   * @param accountName - Name of the existing Account
   */
  async chooseExistingAccount(accountName: string): Promise<void> {
    this.log.info('Associating Lead with existing Account', { accountName });

    await this.chooseOption('Choose Existing Account');
    await this.fill(this.accountSearchBox, accountName);

    const suggestion = this.page.getByRole('option', { name: accountName, exact: true });
    await suggestion.first().waitFor({ state: 'visible', timeout: TIMEOUTS.SCREEN_APPEARS });
    await this.click(suggestion.first());

    await this.waitUntilIdle(TIMEOUTS.SCREEN_APPEARS);
  }

  /**
   * Configures modal to associate the Lead with an existing Contact.
   *
   * @param contactName - Contact full name to link
   */
  async chooseExistingContact(contactName: string): Promise<void> {
    this.log.info('Associating Lead with existing Contact', { contactName });

    await this.chooseOption('Choose Existing Contact');

    const surname = contactName.trim().split(/\s+/).pop() ?? contactName;
    const matchCard = this.modal.getByRole('radio', { name: new RegExp(surname) }).last();
    const cardIsThere = await matchCard
      .waitFor({ state: 'attached', timeout: TIMEOUTS.SCREEN_APPEARS })
      .then(() => true)
      .catch(() => false);

    if (cardIsThere) {
      await this.selectRadio(matchCard);
    } else {
      this.log.info('Match card not present; searching contact by surname', { surname });
      await this.fill(this.contactSearchBox, surname);
      await this.click(this.page.getByRole('option', { name: new RegExp(surname) }).first());
    }

    await this.waitUntilIdle(TIMEOUTS.SCREEN_APPEARS);
  }

  /**
   * Reads currently active radio options for Account and Contact creation branches.
   *
   * @returns Object indicating 'existing' or 'new' for account and contact
   */
  async readChosenBranches(): Promise<ConversionBranches> {
    const isSelected = (optionLabel: string): Promise<boolean> =>
      this.modal
        .getByRole('radio', { name: optionLabel, exact: true })
        .first()
        .isChecked()
        .catch(() => false);

    const branches: ConversionBranches = {
      account: (await isSelected('Choose Existing Account')) ? 'existing' : 'new',
      contact: (await isSelected('Choose Existing Contact')) ? 'existing' : 'new'
    };

    this.log.info('Current conversion configuration', branches);
    return branches;
  }

  /**
   * Submits the conversion and waits for the success confirmation view.
   */
  async convert(): Promise<void> {
    this.log.info('Submitting Lead conversion');

    await this.click(this.convertButton);
    await this.successHeading.waitFor({
      state: 'visible',
      timeout: TIMEOUTS.SALESFORCE_LOADING
    });

    this.log.info('Lead conversion completed');
  }

  /**
   * Submits conversion while intercepting and returning the raw Aura response payload.
   *
   * @returns Raw HTTP response body text of the convertLeadServer Aura action
   */
  async convertAndCaptureResponse(): Promise<string> {
    this.log.info('Submitting conversion and capturing Aura response');

    const conversionCall = waitForLeadConversionCall(this.page);

    await this.click(this.convertButton);

    const response = await conversionCall;
    const body = await response.text();

    await this.successHeading.waitFor({
      state: 'visible',
      timeout: TIMEOUTS.SALESFORCE_LOADING
    });

    this.log.info('Conversion response captured', {
      status: response.status(),
      bytes: body.length
    });
    return body;
  }
}
