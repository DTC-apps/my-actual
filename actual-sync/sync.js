const api = require('@actual-app/api');
const path = require('path');

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

  const accounts = await api.getAccounts();
  for (const account of accounts) {
    try {
      console.log(`Syncing ${account.name}...`);
      await api.runBankSync({ accountId: account.id });
    } catch (err) {
      console.error(`Failed to sync ${account.name}:`, err.message);
    }
  }

  await api.shutdown();
  console.log('Sync complete.');
}

run();
