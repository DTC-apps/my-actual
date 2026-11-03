import type { AccountEntity, PayeeEntity } from '@actual-app/core/types/models';
import { describe, expect, it } from 'vitest';

import {
  buildPaymentTransaction,
  canMakePayment,
  getAmountOwed,
  getDefaultSourceAccount,
  getTransferPayee,
} from './makePayment';

function account(overrides: Partial<AccountEntity>): AccountEntity {
  return {
    id: 'acct',
    name: 'Account',
    offbudget: 0,
    closed: 0,
    sort_order: 0,
    last_reconciled: null,
    tombstone: 0,
    account_group_id: null,
    account_id: null,
    bank: null,
    bankName: null,
    bankId: null,
    mask: null,
    official_name: null,
    balance_current: null,
    balance_available: null,
    balance_limit: null,
    account_sync_source: null,
    last_sync: null,
    bank_sync_status: null,
    ...overrides,
  };
}

describe('canMakePayment', () => {
  it('is true only for open accounts with a negative balance', () => {
    expect(canMakePayment({ closed: 0 }, -5000)).toBe(true);
    expect(canMakePayment({ closed: 0 }, 0)).toBe(false);
    expect(canMakePayment({ closed: 0 }, 5000)).toBe(false);
    expect(canMakePayment({ closed: 0 }, null)).toBe(false);
    expect(canMakePayment({ closed: 1 }, -5000)).toBe(false);
  });
});

describe('getAmountOwed', () => {
  it('flips a negative balance and floors everything else at 0', () => {
    expect(getAmountOwed(-12345)).toBe(12345);
    expect(getAmountOwed(0)).toBe(0);
    expect(getAmountOwed(500)).toBe(0);
    expect(getAmountOwed(null)).toBe(0);
  });
});

describe('getDefaultSourceAccount', () => {
  it('prefers an open on-budget account other than the card', () => {
    const accounts = [
      account({ id: 'card' }),
      account({ id: 'closed', closed: 1 }),
      account({ id: 'offbudget', offbudget: 1 }),
      account({ id: 'checking' }),
    ];
    expect(getDefaultSourceAccount(accounts, 'card')?.id).toBe('checking');
  });

  it('falls back to an off-budget account, then null', () => {
    expect(
      getDefaultSourceAccount(
        [account({ id: 'card' }), account({ id: 'off', offbudget: 1 })],
        'card',
      )?.id,
    ).toBe('off');
    expect(getDefaultSourceAccount([account({ id: 'card' })], 'card')).toBe(
      null,
    );
  });
});

describe('getTransferPayee', () => {
  it('finds the payee linked to the account', () => {
    const payees = [
      { id: 'p1', name: 'Store' },
      { id: 'p2', name: 'Checking', transfer_acct: 'checking' },
    ] satisfies PayeeEntity[];
    expect(getTransferPayee(payees, 'checking')?.id).toBe('p2');
    expect(getTransferPayee(payees, 'missing')).toBe(null);
  });
});

describe('buildPaymentTransaction', () => {
  it('creates a positive inflow on the card paid by the source account', () => {
    expect(
      buildPaymentTransaction({
        cardAccountId: 'card',
        transferPayeeId: 'p2',
        amount: -2500,
        date: '2026-10-24',
      }),
    ).toEqual({
      id: 'temp',
      account: 'card',
      payee: 'p2',
      amount: 2500,
      date: '2026-10-24',
      cleared: false,
    });
  });
});
