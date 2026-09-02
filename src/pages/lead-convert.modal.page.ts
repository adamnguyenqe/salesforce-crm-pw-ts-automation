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
 * Page object for the Salesforce 'Convert Lead' modal dialog.
 */
export class LeadConvertModalPage extends BasePage {
  private readonly convertButton = this.modal.getByRole('button', { name: 'Convert', exact: true });
  private readonly accountSearchInput = this.modal.getByPlaceholder('Search for matching accounts');
  private readonly contactSearchInput = this.modal.getByPlaceholder('Search for matching contacts');

  /** Heading element displayed on the success confirmation screen. */
  private readonly successHeading = this.page.getByText('Your lead has been converted');

  /**
   * Waits for the Convert Lead modal to open and initial match queries to settle.
   */
  async waitUntilPopupOpen(): Promise<void> {
    await this.modal.waitFor({ state: 'visible', timeout: TIMEOUTS.SALESFORCE_LOADING });
    await this.convertButton.waitFor({ state: 'visible', timeout: TIMEOUTS.SCREEN_APPEARS });

    // Salesforce renders each match count twice (visible summary vs hidden assistive-text).
    // Wait on the visible summary rather than relying on DOM ordering.
    await this.matchCountLabel('Account')
      .first()
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
   * Selects a conversion radio option by its accessible label.
   *
   * @param optionLabel - Display text of the radio option (e.g. 'Choose Existing Account')
   */
  private async chooseOption(optionLabel: string): Promise<void> {
    await this.selectRadio(this.modal.getByRole('radio', { name: optionLabel, exact: true }));
    await this.waitUntilIdle(TIMEOUTS.SCREEN_APPEARS);
  }

  /**
   * Locates the visible match-count label for an sObject (Account or Contact).
   * Filters specifically for visible text to avoid hidden assistive duplicate nodes.
   *
   * @param objectName - Target sObject ('Account' or 'Contact')
   */
  private matchCountLabel(objectName: 'Account' | 'Contact'): Locator {
    return this.modal.getByText(new RegExp(`\\d+ ${objectName} Match`)).filter({ visible: true });
  }

  /**
   * Retrieves the matched record count displayed in the modal header for an sObject.
   *
   * @param objectName - Target sObject ('Account' or 'Contact')
   * @returns Number of matching records (0 if none found)
   */
  async getMatchCount(objectName: 'Account' | 'Contact'): Promise<number> {
    const matchLabel = this.matchCountLabel(objectName).first();
    const isVisible = await this.isElementVisible(matchLabel, TIMEOUTS.SCREEN_APPEARS);
    if (!isVisible) {
      this.log.warn('Match count text not visible', { objectName });
      return 0;
    }

    const text = await matchLabel.innerText();
    const countMatch = text.match(/\d+/);
    return countMatch ? parseInt(countMatch[0], 10) : 0;
  }

  /**
   * Associates the Lead with an existing Account by searching its name.
   *
   * @param accountName - Name of the existing Account
   */
  async chooseExistingAccount(accountName: string): Promise<void> {
    this.log.info('Associating Lead with existing Account', { accountName });

    await this.chooseOption('Choose Existing Account');
    await this.fill(this.accountSearchInput, accountName);

    const suggestion = this.page.getByRole('option', { name: accountName, exact: true });
    await suggestion.first().waitFor({ state: 'visible', timeout: TIMEOUTS.SCREEN_APPEARS });
    await this.click(suggestion.first());

    await this.waitUntilIdle(TIMEOUTS.SCREEN_APPEARS);
  }

  /**
   * Associates the Lead with an existing Contact, selecting match card or searching.
   *
   * @param contactName - Full name of the Contact to link
   */
  async chooseExistingContact(contactName: string): Promise<void> {
    this.log.info('Associating Lead with existing Contact', { contactName });

    await this.chooseOption('Choose Existing Contact');

    const surname = contactName.trim().split(/\s+/).pop() ?? contactName;
    const matchCard = this.modal.getByRole('radio', { name: new RegExp(surname) }).last();
    const hasMatchCard = await matchCard
      .waitFor({ state: 'attached', timeout: TIMEOUTS.SCREEN_APPEARS })
      .then(() => true)
      .catch(() => false);

    if (hasMatchCard) {
      await this.selectRadio(matchCard);
    } else {
      this.log.info('Match card not present; searching contact by surname', { surname });
      await this.fill(this.contactSearchInput, surname);
      await this.click(this.page.getByRole('option', { name: new RegExp(surname) }).first());
    }

    await this.waitUntilIdle(TIMEOUTS.SCREEN_APPEARS);
  }

  /**
   * Selects the 'Create New Account' branch in the conversion modal.
   */
  async chooseNewAccount(): Promise<void> {
    this.log.info('Selecting Create New Account branch');
    await this.chooseOption('Create New Account');
  }

  /**
   * Selects the 'Create New Contact' branch in the conversion modal.
   */
  async chooseNewContact(): Promise<void> {
    this.log.info('Selecting Create New Contact branch');
    await this.chooseOption('Create New Contact');
  }

  /**
   * Sets the conversion branch for Account ('new' or 'existing').
   *
   * @param choice - 'new' to create Account, 'existing' to link existing record
   * @param accountName - Name of the existing Account (required when choice is 'existing')
   */
  async setAccountBranch(choice: ConversionChoice, accountName?: string): Promise<void> {
    if (choice === 'new') {
      await this.chooseNewAccount();
      return;
    }

    if (!accountName) {
      throw new Error("An account name is required to choose the 'existing' Account branch.");
    }
    await this.chooseExistingAccount(accountName);
  }

  /**
   * Sets the conversion branch for Contact ('new' or 'existing').
   *
   * @param choice - 'new' to create Contact, 'existing' to link existing record
   * @param contactName - Full name of the existing Contact (required when choice is 'existing')
   */
  async setContactBranch(choice: ConversionChoice, contactName?: string): Promise<void> {
    if (choice === 'new') {
      await this.chooseNewContact();
      return;
    }

    if (!contactName) {
      throw new Error("A contact name is required to choose the 'existing' Contact branch.");
    }
    await this.chooseExistingContact(contactName);
  }

  /**
   * Reads currently active radio options for Account and Contact creation branches.
   *
   * @returns Object indicating 'existing' or 'new' for both account and contact
   */
  async readChosenBranches(): Promise<ConversionBranches> {
    const isRadioChecked = (label: string): Promise<boolean> =>
      this.modal
        .getByRole('radio', { name: label, exact: true })
        .first()
        .isChecked()
        .catch(() => false);

    const [hasExistingAccount, hasExistingContact] = await Promise.all([
      isRadioChecked('Choose Existing Account'),
      isRadioChecked('Choose Existing Contact')
    ]);

    const branches: ConversionBranches = {
      account: hasExistingAccount ? 'existing' : 'new',
      contact: hasExistingContact ? 'existing' : 'new'
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
   * @returns Raw HTTP response body string of the convertLeadServer Aura action
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
