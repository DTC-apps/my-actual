const api = require('@actual-app/api');
const path = require('path');

// Added to the notes of every transaction a sync imports. Requires
// @actual-app/api 26.11.0 or newer, where runBankSync reports what it imported.
const IMPORT_TAG = '#just-imported';

// Matches the tag the way Actual parses tags: it starts after anything but
// another '#', and ends at whitespace, '#' or the end of the notes.
const IMPORT_TAG_PATTERN = new RegExp(`(?<!#)${IMPORT_TAG}(?=[\\s#]|$)`);

const REQUIRED_ENV = ['ACTUAL_SERVER_URL', 'ACTUAL_PASSWORD', 'ACTUAL_SYNC_ID'];

// Set by every step that fails, so cron/systemd sees a non-zero exit code
// instead of a run that looks successful.
let hasFailures = false;

async function tagNewTransactions(ids) {
  if (ids.length === 0) {
    console.log('No new transactions to tag.');
    return;
  }

  // `splits: 'none'` returns split parents (the row the bank imported) and
  // plain transactions, and leaves out split children, so a transaction that a
  // rule split is tagged once, on its parent.
  const { data: transactions } = await api.aqlQuery(
    api
      .q('transactions')
      .filter({ id: { $oneof: ids } })
      .options({ splits: 'none' })
      .select(['id', 'notes']),
  );

  let taggedCount = 0;
  for (const transaction of transactions) {
    const notes = (transaction.notes ?? '').trimEnd();
    if (IMPORT_TAG_PATTERN.test(notes)) {
      continue;
    }

    try {
      await api.updateTransaction(transaction.id, {
        notes: notes ? `${notes} ${IMPORT_TAG}` : IMPORT_TAG,
      });
      taggedCount++;
    } catch (err) {
      hasFailures = true;
      console.error(`Failed to tag transaction ${transaction.id}:`, err.message);
    }
  }

  console.log(`Tagged ${taggedCount} new transaction(s) with ${IMPORT_TAG}.`);
}

async function run() {
  const missingEnv = REQUIRED_ENV.filter(name => !process.env[name]);
  if (missingEnv.length > 0) {
    throw new Error(`Missing environment variables: ${missingEnv.join(', ')}`);
  }

  await api.init({
    dataDir: path.join(__dirname, 'actual-data'),
    serverURL: process.env.ACTUAL_SERVER_URL,
    password: process.env.ACTUAL_PASSWORD,
    // Bank sync otherwise logs every imported transaction (payees, amounts).
    verbose: false,
  });

  await api.downloadBudget(
    process.env.ACTUAL_SYNC_ID,
    process.env.ACTUAL_ENCRYPTION_PASSWORD
      ? { password: process.env.ACTUAL_ENCRYPTION_PASSWORD }
      : undefined,
  );

  const newTransactionIds = [];

  // One account at a time, so a failing account doesn't hide what the others
  // imported. Closed accounts are never synced, so they're skipped up front.
  const accounts = (await api.getAccounts()).filter(account => !account.closed);
  for (const account of accounts) {
    try {
      console.log(`Syncing ${account.name}...`);
      const result = await api.runBankSync({ accountId: account.id });
      for (const id of result?.newTransactions ?? []) {
        newTransactionIds.push(id);
      }
    } catch (err) {
      hasFailures = true;
      console.error(`Failed to sync ${account.name}:`, err.message);
    }
  }

  try {
    await tagNewTransactions(newTransactionIds);
  } catch (err) {
    hasFailures = true;
    console.error('Failed to tag new transactions:', err.message);
  }

  // Push the changes now: unlike shutdown(), this throws if the server can't
  // be reached, so a failed upload isn't reported as a successful run.
  await api.sync();
}

run()
  .catch(err => {
    hasFailures = true;
    console.error('Sync failed:', err.message);
  })
  .finally(async () => {
    try {
      await api.shutdown();
    } catch (err) {
      console.error('Shutdown failed:', err.message);
    }

    if (hasFailures) {
      console.error('Sync finished with errors.');
      process.exitCode = 1;
    } else {
      console.log('Sync complete.');
    }
  });
