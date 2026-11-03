import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { useSyncedPref } from '#hooks/useSyncedPref';
import { TestProviders } from '#mocks';

import { ImportedTransactionsTagSettings } from './ImportedTransactionsTagSettings';

vi.mock('#hooks/useSyncedPref', () => ({
  useSyncedPref: vi.fn(),
}));

const setPref = vi.fn();

function mockTag(value: string | undefined) {
  vi.mocked(useSyncedPref).mockReturnValue([value, setPref]);
}

function renderSettings() {
  render(
    <TestProviders>
      <ImportedTransactionsTagSettings />
    </TestProviders>,
  );
}

const field = () => screen.getByLabelText('Tag new imports');
const errorMessage = () =>
  screen.queryByText(/A tag can't contain spaces/, { exact: false });

describe('ImportedTransactionsTagSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTag(undefined);
  });

  it('is empty when no tag is set', () => {
    renderSettings();

    expect(field()).toHaveValue('');
  });

  it('shows the stored tag with a hash', () => {
    mockTag('just-imported');
    renderSettings();

    expect(field()).toHaveValue('#just-imported');
  });

  it('saves the tag without the hash on Enter', async () => {
    renderSettings();

    await userEvent.type(field(), '#new-import{Enter}');

    expect(setPref).toHaveBeenCalledExactlyOnceWith('new-import');
  });

  it('accepts a tag typed without a hash on blur', async () => {
    renderSettings();

    await userEvent.type(field(), 'review');
    await userEvent.tab();

    expect(setPref).toHaveBeenCalledExactlyOnceWith('review');
  });

  it('turns tagging off when cleared', async () => {
    mockTag('just-imported');
    renderSettings();

    await userEvent.clear(field());
    await userEvent.tab();

    expect(setPref).toHaveBeenCalledExactlyOnceWith('');
  });

  it('does not save an unchanged tag', async () => {
    mockTag('just-imported');
    renderSettings();

    await userEvent.click(field());
    await userEvent.tab();

    expect(setPref).not.toHaveBeenCalled();
  });

  it('rejects a tag with spaces and explains why', async () => {
    renderSettings();

    await userEvent.type(field(), 'two words{Enter}');

    expect(setPref).not.toHaveBeenCalled();
    expect(errorMessage()).toBeInTheDocument();
    expect(field()).toHaveAttribute('aria-invalid', 'true');
  });

  it('discards the draft on Escape', async () => {
    mockTag('just-imported');
    renderSettings();

    await userEvent.clear(field());
    await userEvent.type(field(), 'two words{Escape}');

    expect(setPref).not.toHaveBeenCalled();
    expect(field()).toHaveValue('#just-imported');
    expect(errorMessage()).not.toBeInTheDocument();
  });
});
