# Daily bank sync

`sync.js` runs every day on the VPS. It logs into the Actual server, runs bank
sync for each open account, and adds `#just-imported` to the notes of every
transaction the sync imported.

- **Location on the VPS:** `/home/actualsync/actual-sync`, owned by the
  `actualsync` user
- **Requires:** Node.js 22 or newer and `@actual-app/api` 26.11.0 or newer
  (older API versions don't report imported transactions, so nothing gets
  tagged, with no error)
- **Settings:** read from `.env` in the same folder
- **Exit code:** `0` when everything worked; `1` when any account, the tagging
  or the upload failed (the log says `Sync finished with errors.`)

## `.env`

```
ACTUAL_SERVER_URL=...
ACTUAL_PASSWORD=...
ACTUAL_SYNC_ID=...
ACTUAL_ENCRYPTION_PASSWORD=...   # only if the budget is end-to-end encrypted
```

Only `node --env-file=.env` reads this file. **Never load it with bash**
(`. ./.env`, `source .env`, `set -a`). Bash reads `$` inside double quotes as a
variable and silently cuts it out of the password. The wrong value then stays
set in your shell, and `node --env-file` does **not** override variables that
are already set. Every later test in that shell then fails with
`Unable to decrypt file with this password`, even though `.env` is fine. If that
happens, clear them, or log out and back in:

```bash
unset ACTUAL_SERVER_URL ACTUAL_PASSWORD ACTUAL_SYNC_ID ACTUAL_ENCRYPTION_PASSWORD
```

## Cron job

In the `actualsync` user's crontab (`crontab -e`):

```
0 9 * * * cd /home/actualsync/actual-sync && flock -n /home/actualsync/actual-sync/.sync.lock timeout -k 1m 15m /usr/bin/node --env-file=.env sync.js >> /home/actualsync/actual-sync/sync.log 2>&1
```

- `flock -n` skips a run if the previous one is still going. Leave the
  `.sync.lock` file in place.
- `timeout -k 1m 15m` stops a run that hangs (for example, on a bank request)
  after 15 minutes, and forces it to quit a minute later if needed.

## Deploying a new version

Run everything as `actualsync`:

```bash
sudo -iu actualsync
```

1. Check Node. Cron uses `/usr/bin/node`, which must be v22 or newer:

   ```bash
   /usr/bin/node --version
   ```

2. Back up the current script, packages and crontab:

   ```bash
   cd ~/actual-sync && cp sync.js sync.js.bak && cp package.json package.json.bak && (cp package-lock.json package-lock.json.bak 2>/dev/null; true) && crontab -l > ~/crontab.bak
   ```

3. Update the Actual API package if needed, and confirm the version:

   ```bash
   cd ~/actual-sync && npm install @actual-app/api@^26.11.0 && npm ls @actual-app/api
   ```

4. Replace `~/actual-sync/sync.js` with `fork/actual-sync/sync.js` from the `custom/main` branch. For
   example, open it with `nano ~/actual-sync/sync.js` and paste the new
   contents. Then check that the file is complete:

   ```bash
   /usr/bin/node --check ~/actual-sync/sync.js && echo "sync.js OK"
   ```

5. Test it with **exactly the command cron runs**. This is a real run: it syncs
   the banks and tags new transactions.

   ```bash
   cd ~/actual-sync && /usr/bin/node --env-file=.env sync.js; echo "exit code: $?"
   ```

   Expected output: one `Syncing <account>...` line per open account, then
   `Tagged N new transaction(s)` or `No new transactions to tag.`, then
   `Sync complete.` and `exit code: 0`.

   - `Unable to decrypt file with this password` usually means old variables
     are still set in the shell. See the `.env` section above.
   - `Failed to sync <account>` usually means that account's bank link
     expired. Re-link it in Actual.

6. Leave the `actualsync` user:

   ```bash
   exit
   ```

   Nothing needs restarting. The next cron run uses the new script.

## Checking the nightly run

```bash
tail -5 /home/actualsync/actual-sync/sync.log
```

The last line should be `Sync complete.`.

## Rollback

As `actualsync`:

```bash
cd ~/actual-sync && cp sync.js.bak sync.js && cp package.json.bak package.json && (cp package-lock.json.bak package-lock.json 2>/dev/null; true) && npm install
```

To restore the previous crontab:

```bash
crontab ~/crontab.bak
```
