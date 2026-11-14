import { generateAccount } from '@actual-app/core/mocks';
import { initServer } from '@actual-app/core/platform/client/connection';
import type {
  AccountEntity,
  TransactionEntity,
} from '@actual-app/core/types/models';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useUpdateAccountMutation } from '#accounts';
import { useOffBudgetAccounts } from '#hooks/useOffBudgetAccounts';
import { TestProviders } from '#mocks';

import { ReconcileSyncedBalancesModal } from './ReconcileSyncedBalancesModal';

vi.mock(
  '@actual-app/core/platform/client/connection',
  () => import('#mocks/connection'),
);
// The account queries and mutations are loaded by the test setup before the
// connection mock above applies, so they are stubbed at the hook level.
vi.mock('#hooks/useOffBudgetAccounts', () => ({
  useOffBudgetAccounts: vi.fn(),
}));
vi.mock('#accounts', async importOriginal => ({
  ...(await importOriginal()),
  useUpdateAccountMutation: vi.fn(),
}));

function makeAccount(
  name: string,
  {
    offbudget = true,
    syncedBalance,
  }: { offbudget?: boolean; syncedBalance: number | null },
): AccountEntity {
  const account = generateAccount(name, syncedBalance != null, offbudget);
  return syncedBalance != null
    ? { ...account, balance_current: syncedBalance }
    : account;
}

type BatchUpdate = {
  added?: TransactionEntity[];
  updated?: Array<Partial<TransactionEntity>>;
};

function renderModal(
  accounts: AccountEntity[],
  clearedBalances: Record<AccountEntity['id'], number>,
) {
  const batchUpdates: BatchUpdate[] = [];
  const updatedAccounts: Array<Partial<AccountEntity>> = [];
  const onReconciled = vi.fn();

  vi.mocked(useOffBudgetAccounts).mockReturnValue({
    data: accounts.filter(account => !!account.offbudget),
    isPlaceholderData: false,
  } as ReturnType<typeof useOffBudgetAccounts>);
  vi.mocked(useUpdateAccountMutation).mockReturnValue({
    mutateAsync: async ({ account }: { account: Partial<AccountEntity> }) => {
      updatedAccounts.push(account);
      return account;
    },
  } as unknown as ReturnType<typeof useUpdateAccountMutation>);
  initServer({
    // Answers both the cleared balance lookups and the lookup of the cleared
    // transactions to lock.
    query: async query => {
      const serialized = JSON.stringify(query);
      const account = accounts.find(({ id }) => serialized.includes(id));
      const isBalanceLookup = serialized.includes('$sum');
      return {
        data: isBalanceLookup ? clearedBalances[account?.id ?? ''] : [],
        dependencies: [],
      };
    },
    'rules-run': async ({ transaction }) => transaction,
    'transactions-batch-update': async changes => {
      batchUpdates.push(changes);
      return { added: [], updated: [], deleted: [], errors: [] };
    },
  });

  render(
    <TestProviders>
      <ReconcileSyncedBalancesModal onReconciled={onReconciled} />
    </TestProviders>,
  );

  return { batchUpdates, updatedAccounts, onReconciled };
}

describe('ReconcileSyncedBalancesModal', () => {
  it('lists only linked off budget accounts that differ from the synced balance', async () => {
    const brokerage = makeAccount('Brokerage', { syncedBalance: 1025000 });
    const mortgage = makeAccount('Mortgage', { syncedBalance: -19940000 });
    const matching = makeAccount('Matching', { syncedBalance: 5000 });
    const unlinked = makeAccount('Unlinked', { syncedBalance: null });
    const checking = makeAccount('Checking', {
      offbudget: false,
      syncedBalance: 9999,
    });

    renderModal([brokerage, mortgage, matching, unlinked, checking], {
      [brokerage.id]: 1000000,
      [mortgage.id]: -20000000,
      [matching.id]: 5000,
      [unlinked.id]: 100,
      [checking.id]: 0,
    });

    expect(await screen.findByText('Brokerage')).toBeInTheDocument();
    expect(screen.getByText('+250.00')).toBeInTheDocument();
    expect(screen.getByText('Mortgage')).toBeInTheDocument();
    expect(screen.getByText('+600.00')).toBeInTheDocument();
    expect(screen.queryByText('Matching')).not.toBeInTheDocument();
    expect(screen.queryByText('Unlinked')).not.toBeInTheDocument();
    expect(screen.queryByText('Checking')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Reconcile 2 accounts' }),
    ).toBeInTheDocument();
  });

  it('creates an adjustment and stamps each selected account', async () => {
    const brokerage = makeAccount('Brokerage', { syncedBalance: 1025000 });
    const mortgage = makeAccount('Mortgage', { syncedBalance: -19940000 });

    const { batchUpdates, updatedAccounts, onReconciled } = renderModal(
      [brokerage, mortgage],
      { [brokerage.id]: 1000000, [mortgage.id]: -20000000 },
    );

    // Untick the mortgage so only the brokerage is reconciled
    await userEvent.click(await screen.findByLabelText('Mortgage'));
    await userEvent.click(
      screen.getByRole('button', { name: 'Reconcile 1 accounts' }),
    );

    await waitFor(() => expect(onReconciled).toHaveBeenCalledTimes(1));

    const added = batchUpdates.flatMap(changes => changes.added ?? []);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      account: brokerage.id,
      amount: 25000,
      cleared: true,
    });

    expect(updatedAccounts).toHaveLength(1);
    expect(updatedAccounts[0].id).toBe(brokerage.id);
    expect(updatedAccounts[0].last_reconciled).toEqual(expect.any(String));
  });

  it('explains when there is nothing to reconcile', async () => {
    const matching = makeAccount('Matching', { syncedBalance: 5000 });

    renderModal([matching], { [matching.id]: 5000 });

    expect(await screen.findByText(/Nothing to reconcile/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Reconcile/ }),
    ).not.toBeInTheDocument();
  });
});
