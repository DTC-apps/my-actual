import React, { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button, ButtonWithLoading } from '@actual-app/components/button';
import { Paragraph } from '@actual-app/components/paragraph';
import type { CSSProperties } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { AccountEntity } from '@actual-app/core/types/models';

import { useUpdateAccountMutation } from '#accounts';
import {
  getSyncedBalanceAdjustments,
  reconcileToSyncedBalance,
} from '#accounts/reconciliation';
import type { SyncedBalanceAdjustment } from '#accounts/reconciliation';
import {
  Modal,
  ModalButtons,
  ModalCloseButton,
  ModalHeader,
} from '#components/common/Modal';
import { FinancialText } from '#components/FinancialText';
import { Checkbox } from '#components/forms';
import { useFormat } from '#hooks/useFormat';
import { useOffBudgetAccounts } from '#hooks/useOffBudgetAccounts';
import type { Modal as ModalType } from '#modals/modalsSlice';
import { addNotification } from '#notifications/notificationsSlice';
import { useDispatch } from '#redux';

type ReconcileSyncedBalancesModalProps = Extract<
  ModalType,
  { name: 'reconcile-synced-balances' }
>['options'];

const amountColumnStyle: CSSProperties = {
  width: 120,
  flexShrink: 0,
  textAlign: 'right',
};

const rowStyle: CSSProperties = {
  flexDirection: 'row',
  alignItems: 'center',
  padding: '8px 10px',
  gap: 10,
};

export function ReconcileSyncedBalancesModal({
  onReconciled,
}: ReconcileSyncedBalancesModalProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const dispatch = useDispatch();
  const { data: offBudgetAccounts, isPlaceholderData } = useOffBudgetAccounts();
  const { mutateAsync: updateAccount } = useUpdateAccountMutation();

  const [adjustments, setAdjustments] = useState<
    SyncedBalanceAdjustment[] | null
  >(null);
  const [excludedIds, setExcludedIds] = useState<Array<AccountEntity['id']>>(
    [],
  );
  const [isReconciling, setIsReconciling] = useState(false);

  // Load the preview once. It is deliberately not refreshed afterwards so the
  // list stays stable while the accounts are being reconciled.
  useEffect(() => {
    if (!offBudgetAccounts || isPlaceholderData || adjustments) {
      return;
    }

    let isCancelled = false;
    void getSyncedBalanceAdjustments(offBudgetAccounts).then(result => {
      if (!isCancelled) {
        setAdjustments(result);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [offBudgetAccounts, isPlaceholderData, adjustments]);

  const selected = (adjustments ?? []).filter(
    ({ account }) => !excludedIds.includes(account.id),
  );
  const count = selected.length;

  function onToggle(id: AccountEntity['id'], isSelected: boolean) {
    setExcludedIds(prev =>
      isSelected ? prev.filter(excludedId => excludedId !== id) : [...prev, id],
    );
  }

  async function onConfirm(close: () => void) {
    setIsReconciling(true);

    let reconciledCount = 0;
    try {
      for (const { account } of selected) {
        await reconcileToSyncedBalance(account);
        await updateAccount({
          account: {
            ...account,
            last_reconciled: new Date().getTime().toString(),
          },
        });
        reconciledCount++;
      }

      dispatch(
        addNotification({
          notification: {
            type: 'message',
            message: t('Reconciled {{count}} accounts', {
              count: reconciledCount,
            }),
          },
        }),
      );
    } catch (error) {
      dispatch(
        addNotification({
          notification: {
            type: 'error',
            message: t(
              'Reconciled {{reconciledCount}} of {{totalCount}} accounts before an error occurred. Please review your accounts and try again.',
              { reconciledCount, totalCount: selected.length },
            ),
            pre: error instanceof Error ? error.message : undefined,
          },
        }),
      );
    }

    onReconciled?.();
    close();
  }

  return (
    <Modal
      name="reconcile-synced-balances"
      containerProps={{ style: { width: 650 } }}
    >
      {({ state }) => (
        <>
          <ModalHeader
            title={t('Reconcile to synced balances')}
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          {adjustments?.length === 0 ? (
            <View style={{ lineHeight: 1.5 }}>
              <Paragraph>
                <Trans>
                  Nothing to reconcile: every linked off budget account already
                  matches its last synced balance.
                </Trans>
              </Paragraph>
              <ModalButtons>
                <Button variant="primary" onPress={() => state.close()}>
                  <Trans>Close</Trans>
                </Button>
              </ModalButtons>
            </View>
          ) : (
            <View style={{ lineHeight: 1.5 }}>
              <Paragraph>
                <Trans>
                  These off budget accounts have a cleared balance that differs
                  from the last balance synced from the bank. For each selected
                  account, a reconciliation transaction is created for the
                  adjustment and all cleared transactions are locked.
                </Trans>
              </Paragraph>

              <View
                style={{
                  border: '1px solid ' + theme.tableBorder,
                  borderRadius: 6,
                  overflow: 'auto',
                  maxHeight: '50vh',
                }}
              >
                <View
                  style={{
                    ...rowStyle,
                    fontWeight: 600,
                    color: theme.tableHeaderText,
                    backgroundColor: theme.tableHeaderBackground,
                    flexShrink: 0,
                  }}
                >
                  <View style={{ flex: 1, paddingLeft: 21 }}>
                    <Trans>Account</Trans>
                  </View>
                  <View style={amountColumnStyle}>
                    <Trans>Cleared balance</Trans>
                  </View>
                  <View style={amountColumnStyle}>
                    <Trans>Last synced</Trans>
                  </View>
                  <View style={amountColumnStyle}>
                    <Trans>Adjustment</Trans>
                  </View>
                </View>

                {(adjustments ?? []).map(
                  ({ account, clearedBalance, adjustment }) => {
                    const checkboxId = `reconcile-synced-${account.id}`;
                    return (
                      <View
                        key={account.id}
                        style={{
                          ...rowStyle,
                          flexShrink: 0,
                          borderTop: '1px solid ' + theme.tableBorder,
                        }}
                      >
                        <View
                          style={{
                            flex: 1,
                            flexDirection: 'row',
                            alignItems: 'center',
                            minWidth: 0,
                          }}
                        >
                          <Checkbox
                            id={checkboxId}
                            checked={!excludedIds.includes(account.id)}
                            disabled={isReconciling}
                            onChange={e =>
                              onToggle(account.id, e.target.checked)
                            }
                          />
                          <label
                            htmlFor={checkboxId}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              userSelect: 'none',
                              cursor: 'pointer',
                            }}
                          >
                            {account.name}
                          </label>
                        </View>
                        <FinancialText style={amountColumnStyle}>
                          {format(clearedBalance, 'financial')}
                        </FinancialText>
                        <FinancialText style={amountColumnStyle}>
                          {format(account.balance_current, 'financial')}
                        </FinancialText>
                        <FinancialText
                          style={{ ...amountColumnStyle, fontWeight: 600 }}
                        >
                          {(adjustment > 0 ? '+' : '') +
                            format(adjustment, 'financial')}
                        </FinancialText>
                      </View>
                    );
                  },
                )}

                {!adjustments && (
                  <Text
                    style={{
                      padding: 10,
                      color: theme.pageTextSubdued,
                      borderTop: '1px solid ' + theme.tableBorder,
                    }}
                  >
                    <Trans>Loading balances…</Trans>
                  </Text>
                )}
              </View>

              <ModalButtons>
                <Button
                  style={{ marginRight: 10 }}
                  isDisabled={isReconciling}
                  onPress={() => state.close()}
                >
                  <Trans>Cancel</Trans>
                </Button>
                <ButtonWithLoading
                  variant="primary"
                  isLoading={isReconciling}
                  isDisabled={count === 0}
                  onPress={() => onConfirm(() => state.close())}
                >
                  <Trans count={count}>Reconcile {{ count }} accounts</Trans>
                </ButtonWithLoading>
              </ModalButtons>
            </View>
          )}
        </>
      )}
    </Modal>
  );
}
