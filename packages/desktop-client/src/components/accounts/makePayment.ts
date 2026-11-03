import { send } from '@actual-app/core/platform/client/connection';
import { realizeTempTransactions } from '@actual-app/core/shared/transactions';
import type { IntegerAmount } from '@actual-app/core/shared/util';
import type {
  AccountEntity,
  PayeeEntity,
  TransactionEntity,
} from '@actual-app/core/types/models';

// A liability (e.g. a credit card) is any open account with a negative balance.
export function canMakePayment(
  account: Pick<AccountEntity, 'closed'>,
  balance: IntegerAmount | null | undefined,
) {
  return !account.closed && balance != null && balance < 0;
}

export function getAmountOwed(balance: IntegerAmount | null | undefined) {
  return balance != null && balance < 0 ? -balance : 0;
}

export function getDefaultSourceAccount(
  accounts: AccountEntity[],
  cardAccountId: AccountEntity['id'],
) {
  const candidates = accounts.filter(
    a => a.id !== cardAccountId && !a.closed && !a.tombstone,
  );
  return candidates.find(a => !a.offbudget) ?? candidates[0] ?? null;
}

export function getTransferPayee(
  payees: PayeeEntity[],
  accountId: AccountEntity['id'],
) {
  return payees.find(p => p.transfer_acct === accountId) ?? null;
}

type BuildPaymentTransactionArgs = {
  cardAccountId: AccountEntity['id'];
  transferPayeeId: PayeeEntity['id'];
  amount: IntegerAmount;
  date: string;
};

// The payment is recorded as an inflow on the card whose payee is the source
// account's transfer payee; the server creates the matching outflow.
export function buildPaymentTransaction({
  cardAccountId,
  transferPayeeId,
  amount,
  date,
}: BuildPaymentTransactionArgs): TransactionEntity {
  return {
    id: 'temp',
    account: cardAccountId,
    payee: transferPayeeId,
    amount: Math.abs(amount),
    date,
    cleared: false,
  };
}

export async function makePayment(args: BuildPaymentTransactionArgs) {
  const added = realizeTempTransactions([buildPaymentTransaction(args)]);
  await send('transactions-batch-update', { added });
}
