import type { TransactionEntity } from '@actual-app/core/types/models';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { SelectedProviderWithItems } from '#hooks/useSelected';
import { useSyncedPref } from '#hooks/useSyncedPref';
import { TestProviders } from '#mocks';

import { SelectedTransactionsButton } from './SelectedTransactionsButton';

vi.mock(
  '@actual-app/core/platform/client/connection',
  () => import('#mocks/connection'),
);
vi.mock('#hooks/useSyncedPref', () => ({
  useSyncedPref: vi.fn(),
}));

const transactions = [
  { id: 'tagged', notes: 'Coffee #just-imported' },
  { id: 'other', notes: '#groceries' },
  { id: 'escaped', notes: '##just-imported' },
] as TransactionEntity[];

function mockImportedTag(value: string | undefined) {
  vi.mocked(useSyncedPref).mockReturnValue([value, vi.fn()]);
}

function renderButton(
  selectedIds: string[],
  { withHandler = true }: { withHandler?: boolean } = {},
) {
  const onMarkReviewed = vi.fn();
  render(
    <TestProviders>
      <SelectedProviderWithItems
        name="transactions"
        items={transactions}
        initialSelectedIds={selectedIds}
        fetchAllIds={async () => transactions.map(t => t.id)}
      >
        <SelectedTransactionsButton
          getTransaction={id => transactions.find(t => t.id === id)}
          onShow={vi.fn()}
          onDuplicate={vi.fn()}
          onDelete={vi.fn()}
          onEdit={vi.fn()}
          onLinkSchedule={vi.fn()}
          onUnlinkSchedule={vi.fn()}
          onCreateRule={vi.fn()}
          onRunRules={vi.fn()}
          onSetTransfer={vi.fn()}
          onScheduleAction={vi.fn()}
          showMakeTransfer={false}
          onMakeAsSplitTransaction={vi.fn()}
          onMakeAsNonSplitTransactions={vi.fn()}
          onMergeTransactions={vi.fn()}
          onMarkReviewed={withHandler ? onMarkReviewed : undefined}
        />
      </SelectedProviderWithItems>
    </TestProviders>,
  );
  return { onMarkReviewed };
}

async function openMenu() {
  await userEvent.click(screen.getByTestId('transactions-select-button'));
  return screen.findByRole('menu');
}

const markReviewed = (menu: HTMLElement) =>
  within(menu).queryByRole('button', { name: 'Mark as reviewed' });

describe('SelectedTransactionsButton mark as reviewed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockImportedTag('just-imported');
  });

  it('marks the selected transactions as reviewed', async () => {
    const { onMarkReviewed } = renderButton(['tagged', 'other']);

    const menu = await openMenu();
    await userEvent.click(markReviewed(menu)!);

    expect(onMarkReviewed).toHaveBeenCalledExactlyOnceWith(['tagged', 'other']);
  });

  it('does nothing when no selected transaction has the tag', async () => {
    const { onMarkReviewed } = renderButton(['other', 'escaped']);

    const menu = await openMenu();
    await userEvent.click(markReviewed(menu)!);

    expect(onMarkReviewed).not.toHaveBeenCalled();
  });

  it('is hidden while no import tag is set', async () => {
    mockImportedTag(undefined);
    renderButton(['tagged']);

    const menu = await openMenu();
    expect(markReviewed(menu)).not.toBeInTheDocument();
  });

  it('is hidden when the page does not support it', async () => {
    renderButton(['tagged'], { withHandler: false });

    const menu = await openMenu();
    expect(markReviewed(menu)).not.toBeInTheDocument();
  });
});
