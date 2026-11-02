const api = require('@actual-app/api');
const path = require('path');

// Added to the notes of every transaction a sync imports. Requires
// @actual-app/api 26.11.0 or newer, where runBankSync reports what it imported.
const IMPORT_TAG = '#just-imported';

async function tagNewTransactions(ids) {
  if (ids.length === 0) {
    return;
  }

  const { data: transactions } = await api.aqlQuery(
    api
      .q('transactions')
      .filter({ id: { $oneof: ids } })
      .select(['id', 'notes']),
  );

  for (const transaction of transactions) {
    const notes = transaction.notes ?? '';
    if (notes.split(/\s+/).includes(IMPORT_TAG)) {
      continue;
    }

    await api.updateTransaction(transaction.id, {
      notes: notes ? `${notes} ${IMPORT_TAG}` : IMPORT_TAG,
    });
  }

  console.log(`Tagged ${transactions.length} new transaction(s) with ${IMPORT_TAG}.`);
}

async function run() {
  await api.init({
    dataDir: path.join(__dirname, 'actual-data'),
    serverURL: process.env.ACTUAL_SERVER_URL,
    password: process.env.ACTUAL_PASSWORD,
  });

  await api.downloadBudget(
    process.env.ACTUAL_SYNC_ID,
    process.env.ACTUAL_ENCRYPTION_PASSWORD
      ? { password: process.env.ACTUAL_ENCRYPTION_PASSWORD }
      : undefined
  );

  const newTransactionIds = [];

  const accounts = await api.getAccounts();
  for (const account of accounts) {
    try {
      console.log(`Syncing ${account.name}...`);
      const result = await api.runBankSync({ accountId: account.id });
      newTransactionIds.push(...(result?.newTransactions ?? []));
    } catch (err) {
      console.error(`Failed to sync ${account.name}:`, err.message);
    }
  }

  try {
    await tagNewTransactions(newTransactionIds);
  } catch (err) {
    console.error('Failed to tag new transactions:', err.message);
  }

  await api.shutdown();
  console.log('Sync complete.');
}

run();
