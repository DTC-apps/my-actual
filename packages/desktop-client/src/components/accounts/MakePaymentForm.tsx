import React, { useState } from 'react';
import type { FormEvent } from 'react';
import { Form } from 'react-aria-components';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';
import { currentDay } from '@actual-app/core/shared/months';
import type { AccountEntity } from '@actual-app/core/types/models';

import { AccountAutocomplete } from '#components/autocomplete/AccountAutocomplete';
import { DateSelect } from '#components/select/DateSelect';
import { AmountInput } from '#components/util/AmountInput';
import { useAccounts } from '#hooks/useAccounts';
import { useDateFormat } from '#hooks/useDateFormat';
import { usePayees } from '#hooks/usePayees';

import {
  getDefaultSourceAccount,
  getTransferPayee,
  makePayment,
} from './makePayment';

type MakePaymentFormProps = {
  account: AccountEntity;
  amountOwed: number;
  onClose: () => void;
  onPaid: () => void;
};

export function MakePaymentForm({
  account,
  amountOwed,
  onClose,
  onPaid,
}: MakePaymentFormProps) {
  const { t } = useTranslation();
  const dateFormat = useDateFormat() || 'MM/dd/yyyy';
  const { data: accounts = [] } = useAccounts();
  const { data: payees = [] } = usePayees();

  const [sourceAccountId, setSourceAccountId] = useState<string | null>(
    () => getDefaultSourceAccount(accounts, account.id)?.id ?? null,
  );
  const [amount, setAmount] = useState(amountOwed);
  const [date, setDate] = useState(currentDay());
  const [isSaving, setIsSaving] = useState(false);

  const transferPayee = sourceAccountId
    ? getTransferPayee(payees, sourceAccountId)
    : null;
  const canSubmit = transferPayee != null && amount !== 0 && !isSaving;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) {
      return;
    }

    setIsSaving(true);
    try {
      await makePayment({
        cardAccountId: account.id,
        transferPayeeId: transferPayee.id,
        amount,
        date,
      });
      onClose();
      onPaid();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Form onSubmit={onSubmit}>
      <View style={{ padding: '5px 8px', gap: 8 }}>
        <Text style={{ fontWeight: 600 }}>
          <Trans>Pay {{ name: account.name }}</Trans>
        </Text>

        <View style={{ gap: 3 }}>
          <Text>
            <Trans>From account</Trans>
          </Text>
          <AccountAutocomplete
            includeClosedAccounts={false}
            hiddenAccounts={[account.id]}
            value={sourceAccountId}
            inputProps={{ placeholder: t('Select account...') }}
            onSelect={id => setSourceAccountId(id || null)}
          />
        </View>

        <View style={{ gap: 3 }}>
          <Text>
            <Trans>Amount</Trans>
          </Text>
          <AmountInput
            value={amount}
            zeroSign="+"
            onUpdate={value => setAmount(Math.abs(value))}
          />
        </View>

        <View style={{ gap: 3 }}>
          <Text>
            <Trans>Date</Trans>
          </Text>
          <DateSelect
            value={date}
            dateFormat={dateFormat}
            onUpdate={value => value && setDate(value)}
            onSelect={value => value && setDate(value)}
          />
        </View>

        <View
          style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}
        >
          <Button onPress={onClose}>
            <Trans>Cancel</Trans>
          </Button>
          <Button variant="primary" type="submit" isDisabled={!canSubmit}>
            <Trans>Make payment</Trans>
          </Button>
        </View>
      </View>
    </Form>
  );
}
