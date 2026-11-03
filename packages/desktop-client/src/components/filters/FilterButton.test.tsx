import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { useSyncedPref } from '#hooks/useSyncedPref';
import { TestProviders } from '#mocks';

import { FilterButton } from './FiltersMenu';

vi.mock('#hooks/useSyncedPref', () => ({
  useSyncedPref: vi.fn(),
}));

function mockImportedTag(value: string | undefined) {
  vi.mocked(useSyncedPref).mockReturnValue([value, vi.fn()]);
}

function renderButton({ showReviewImportsFilter = true } = {}) {
  const onApply = vi.fn();
  render(
    <FilterButton
      onApply={onApply}
      compact={false}
      hover={false}
      showReviewImportsFilter={showReviewImportsFilter}
    />,
    { wrapper: TestProviders },
  );
  return { onApply };
}

async function openMenu() {
  await userEvent.click(screen.getByRole('button', { name: /Filter/ }));
  return screen.findByRole('menu');
}

describe('FilterButton review imports option', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters to transactions with the import tag', async () => {
    mockImportedTag('just-imported');
    const { onApply } = renderButton();

    const menu = await openMenu();
    await userEvent.click(
      within(menu).getByRole('button', { name: 'To review (#just-imported)' }),
    );

    expect(onApply).toHaveBeenCalledExactlyOnceWith({
      field: 'notes',
      op: 'hasTags',
      value: '#just-imported',
      type: 'string',
    });
  });

  it('is hidden while no import tag is set', async () => {
    mockImportedTag(undefined);
    renderButton();

    const menu = await openMenu();
    expect(
      within(menu).queryByRole('button', { name: /To review/ }),
    ).not.toBeInTheDocument();
  });

  it('is hidden unless the page asks for it', async () => {
    mockImportedTag('just-imported');
    renderButton({ showReviewImportsFilter: false });

    const menu = await openMenu();
    expect(
      within(menu).queryByRole('button', { name: /To review/ }),
    ).not.toBeInTheDocument();
  });
});
