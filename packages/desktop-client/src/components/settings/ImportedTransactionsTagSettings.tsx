import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Input } from '@actual-app/components/input';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { normalizeTagName } from '@actual-app/core/shared/tags';

import { useSyncedPref } from '#hooks/useSyncedPref';

import { SettingsRow } from './SettingsRow';

const INPUT_ID = 'settings-imported-transactions-tag';
const ERROR_ID = `${INPUT_ID}-error`;

export function ImportedTransactionsTagSettings() {
  const { t } = useTranslation();
  const [tag, setTag] = useSyncedPref('imported-transactions-tag');

  // Uncommitted text in the field. The tag is only saved once it is complete
  // (on blur or Enter), so a half-typed tag never gets added to imports.
  const [draft, setDraft] = useState<string | null>(null);

  const storedTag = normalizeTagName(tag);
  const value = draft ?? (storedTag ? `#${storedTag}` : '');
  const isInvalid = draft != null && parseDraft(draft) === null;

  function commit(input: string) {
    const parsed = parseDraft(input);
    if (parsed === null) {
      // Keep the draft so the error stays visible and the user can fix it.
      return;
    }
    setDraft(null);
    if (parsed !== (storedTag ?? '')) {
      setTag(parsed);
    }
  }

  return (
    <SettingsRow
      htmlFor={INPUT_ID}
      title={t('Tag new imports')}
      description={t(
        'Add a tag, such as #just-imported, to every new transaction created by bank sync or a file import, so they are easy to find and review. Transactions that match ones already in your budget are left alone. While this is empty, no tag is added.',
      )}
      control={
        <Input
          id={INPUT_ID}
          value={value}
          aria-invalid={isInvalid ? 'true' : 'false'}
          aria-describedby={isInvalid ? ERROR_ID : undefined}
          style={{ width: 200 }}
          onChangeValue={setDraft}
          onUpdate={commit}
          onEnter={commit}
          onEscape={() => setDraft(null)}
        />
      }
    >
      {isInvalid && (
        <Text id={ERROR_ID} style={{ color: theme.errorText }}>
          <Trans>
            A tag can't contain spaces or a "#" after the first one.
          </Trans>
        </Text>
      )}
    </SettingsRow>
  );
}

/** The tag name to save, '' to turn tagging off, or null when invalid. */
function parseDraft(input: string): string | null {
  if (input.trim().replace(/^#+/, '') === '') {
    return '';
  }
  return normalizeTagName(input);
}
