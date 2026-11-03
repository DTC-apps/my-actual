import React, { useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { SvgCreditCard } from '@actual-app/components/icons/v1';
import { Popover } from '@actual-app/components/popover';
import type { AccountEntity } from '@actual-app/core/types/models';

import { useSheetValue } from '#hooks/useSheetValue';
import * as bindings from '#spreadsheet/bindings';

import { canMakePayment, getAmountOwed } from './makePayment';
import { MakePaymentForm } from './MakePaymentForm';

type MakePaymentButtonProps = {
  account: AccountEntity;
  onPaid: () => void;
};

export function MakePaymentButton({ account, onPaid }: MakePaymentButtonProps) {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const balance = useSheetValue<'account', 'balance'>(
    bindings.accountBalance(account.id),
  );

  if (!canMakePayment(account, balance)) {
    return null;
  }

  return (
    <>
      <Button
        ref={triggerRef}
        variant="bare"
        aria-label={t('Make payment')}
        onPress={() => setIsOpen(true)}
      >
        <SvgCreditCard width={13} height={13} style={{ marginRight: 4 }} />{' '}
        <Trans>Make payment</Trans>
      </Button>
      <Popover
        placement="bottom start"
        triggerRef={triggerRef}
        style={{ width: 300 }}
        isOpen={isOpen}
        onOpenChange={() => setIsOpen(false)}
      >
        <MakePaymentForm
          account={account}
          amountOwed={getAmountOwed(balance)}
          onClose={() => setIsOpen(false)}
          onPaid={onPaid}
        />
      </Popover>
    </>
  );
}
