import { send } from '@actual-app/core/platform/client/connection';
import { currentDay } from '@actual-app/core/shared/months';
import { q } from '@actual-app/core/shared/query';
import {
  realizeTempTransactions,
  ungroupTransactions,
  updateTransaction,
} from '@actual-app/core/shared/transactions';
import { applyChanges } from '@actual-app/core/shared/util';
import type {
  AccountEntity,
  TransactionEntity,
} from '@actual-app/core/types/models';
import { t } from 'i18next';

import { aqlQuery } from '#queries/aqlQuery';

export async function lockTransactions(accountId: AccountEntity['id']) {
  const { data } = await aqlQuery(
    q('transactions')
      .filter({ cleared: true, reconciled: false, account: accountId })
      .select('*')
      .options({ splits: 'grouped' }),
  );
  let transactions = ungroupTransactions(data);

  const changes: { updated: Array<Partial<TransactionEntity>> } = {
    updated: [],
  };

  transactions.forEach(trans => {
    const { diff } = updateTransaction(transactions, {
      ...trans,
      reconciled: true,
    });

    transactions = applyChanges(diff, transactions);

    changes.updated = changes.updated
      ? changes.updated.concat(diff.updated)
      : diff.updated;
  });

  await send('transactions-batch-update', changes);
}

export async function unlockTransaction(
  transactionId: TransactionEntity['id'],
) {
  const { data } = await aqlQuery(
    q('transactions')
      .filter({ id: transactionId })
      .select('*')
      .options({ splits: 'grouped' }),
  );
  const transactions = ungroupTransactions(data);

  const transaction = transactions.find(trans => trans.id === transactionId);
  if (!transaction) {
    return;
  }

  const { diff } = updateTransaction(transactions, {
    ...transaction,
    reconciled: false,
  });

  await send('transactions-batch-update', { updated: diff.updated });
}

export async function getClearedBalance(accountId: AccountEntity['id']) {
  const { data } = await aqlQuery(
    q('transactions')
      .filter({ cleared: true, account: accountId })
      .options({ splits: 'none' })
      .calculate({ $sum: '$amount' }),
  );

  return data ?? 0;
}

export async function finishReconciliation(
  accountId: AccountEntity['id'],
  reconcileAmount: number | null,
  lock: () => Promise<void> = () => lockTransactions(accountId),
) {
  const cleared = await getClearedBalance(accountId);
  const targetDiff = (reconcileAmount ?? 0) - cleared;

  if (targetDiff === 0) {
    await lock();
  }
}

export async function createReconciliationTransaction(
  accountId: AccountEntity['id'],
  diff: number,
  onRealized?: (transactions: TransactionEntity[]) => void,
) {
  const reconciliationTransactions = realizeTempTransactions([
    {
      id: 'temp',
      account: accountId,
      cleared: true,
      reconciled: false,
      amount: diff,
      date: currentDay(),
      notes: t('Reconciliation balance adjustment'),
    },
  ]);

  onRealized?.(reconciliationTransactions);

  const ruledTransactions = await Promise.all(
    reconciliationTransactions.map(transaction =>
      send('rules-run', { transaction }),
    ),
  );

  await send('transactions-batch-update', {
    added: ruledTransactions.filter(trans => !trans.tombstone),
    deleted: ruledTransactions.filter(trans => trans.tombstone),
  });
}

export type SyncedAccount = AccountEntity & { balance_current: number };

export type SyncedBalanceAdjustment = {
  account: SyncedAccount;
  clearedBalance: number;
  adjustment: number;
};

export function hasSyncedBalance(
  account: AccountEntity,
): account is SyncedAccount {
  return !account.closed && account.balance_current != null;
}

// Lists the accounts whose cleared balance differs from the balance last
// reported by bank sync, along with the adjustment needed to match it.
export async function getSyncedBalanceAdjustments(
  accounts: AccountEntity[],
): Promise<SyncedBalanceAdjustment[]> {
  const adjustments = await Promise.all(
    accounts.filter(hasSyncedBalance).map(async account => {
      const clearedBalance = await getClearedBalance(account.id);
      return {
        account,
        clearedBalance,
        adjustment: account.balance_current - clearedBalance,
      };
    }),
  );

  return adjustments.filter(({ adjustment }) => adjustment !== 0);
}

// Reconciles an account against the balance last reported by bank sync:
// adds a reconciliation transaction for any difference, then locks all
// cleared transactions.
export async function reconcileToSyncedBalance(account: SyncedAccount) {
  const clearedBalance = await getClearedBalance(account.id);
  const adjustment = account.balance_current - clearedBalance;

  if (adjustment !== 0) {
    await createReconciliationTransaction(account.id, adjustment);
  }

  await lockTransactions(account.id);
}
