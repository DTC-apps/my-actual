# Actual on the VPS

How this fork runs on the VPS it shares with the finance dashboard: what is where, how to install,
update, back up and restore it, and how to fix the problems seen so far. The dashboard side
(`/srv/finance`, the `finance` user, the snapshot import) is documented in
[DTC-apps/finance-tracker-dash](https://github.com/DTC-apps/finance-tracker-dash)
(`deploy/README.md` and `deploy/actual.md`).

Where each step happens: 💻 Chromebook, 🟦 VPS (`ssh ubuntu@VPS_IP`), 🐙 GitHub, ☁️ Cloudflare
(Zero Trust). 🟩 is the old Google Cloud VM, used only in "Moving from another server". Replace
words in CAPITALS with your own values. **Never paste passwords, private keys, or the contents of
`.env` files into a chat.**

## How it fits together

```
browser ─▶ Cloudflare Access ─▶ Tunnel ◀── cloudflared ─┬─▶ Actual     127.0.0.1:5006  (Docker, uid 1001)
                                                        └─▶ dashboard  127.0.0.1:8080  (finance user)

09:00 UTC  bank sync (actualsync user) ── @actual-app/api ──▶ Actual ──▶ SimpleFIN
09:30 UTC  exporter  (actualsync user) ── reads Actual, rsync over SSH ──▶ finance@127.0.0.1
                                          (write-only key)                  /srv/finance/incoming
04:15 UTC  backup (root crontab): stops Actual for a moment, copies /srv/actual/data
```

- **Actual** is this fork's sync server and web app, built with upstream's
  `sync-server.Dockerfile` into the local image `my-actual:latest`. It listens only on
  `127.0.0.1:5006`. The VPS firewall (ufw) allows SSH only; nothing listens on ports 80 or 443.
- **Cloudflare** reaches Actual through the outbound tunnel `finance-vps` (the dashboard's tunnel),
  at its own address (`ACTUAL_HOST`, e.g. `budget.yourdomain.com`), behind a Cloudflare Access
  login. Cloudflare provides the HTTPS that Actual needs in the browser.
- **`actualsync`** is a system user that runs the bank sync project and the dashboard's exporter.
  It holds the Actual, end-to-end-encryption and SimpleFIN passwords. The dashboard's `finance`
  user can't read them or Actual's data, and only receives snapshots through a key that can
  write into `/srv/finance/incoming` and nothing else.

## What is where (🟦)

| Path                                                     | What                                                                                         |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `/srv/actual/src`                                        | clone of this repo, branch `custom/main` (only used to build the image)                      |
| `/srv/actual/docker-compose.yml`                         | the container settings (a copy of [`docker-compose.vps.yml`](docker-compose.vps.yml))        |
| `/srv/actual/data/.migrate`                              | which server upgrades the data already has (hidden file; must travel with the data)          |
| `/srv/actual/data/server-files/`                         | `account.sqlite`: login, users, sessions, bank-sync secrets                                  |
| `/srv/actual/data/user-files/`                           | the budget files (encrypted when end-to-end encryption is on)                                |
| `/srv/actual/backups/actual-YYYY-MM-DD.tgz`              | nightly copies of `data/` (14 days kept)                                                     |
| `~ubuntu/.ssh/my_actual_deploy`                          | read-only deploy key for this repo                                                           |
| `/home/actualsync/actual-sync/`                          | the bank sync project (`.env`, `sync.js`, `sync.log`, its own budget copy in `actual-data/`) |
| `/home/actualsync/actual-sync/finance-tracker/exporter/` | the dashboard's exporter                                                                     |
| `/home/actualsync/finance-exporter.env`                  | the exporter's settings and passwords (mode 600)                                             |

`/srv/actual/data` and `/srv/actual/backups` are mode 700. The data belongs to uid `1001`, the
user inside the container; `ls -la` may show it as `ubuntu` if that's `ubuntu`'s number too
(`ls -lan` shows numbers).

Settings come from the image's defaults: data in `/data`, port 5006, and proxies on private
networks (Docker's included) trusted. Every option is listed at
<https://actualbudget.org/docs/config/> (environment variables starting with `ACTUAL_`); add an
`environment:` block to the compose file if you ever need one.

---

## Install

### 1. 🟦 Docker

Skip if `sudo docker --version` prints a version.

```sh
curl -fsSL https://get.docker.com | sudo sh
```

### 2. 🟦 Temporary swap for the build

The build needs about 8 GB of memory; the VPS has about 4 GB. Check free space first
(`df -h /`, about 20 GB), then:

```sh
sudo fallocate -l 8G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
free -h
```

`Swap` shows `8.0Gi`.

### 3. 🟦 Deploy key for this repo

```sh
ssh-keygen -t ed25519 -N '' -C actual-vps-deploy -f ~/.ssh/my_actual_deploy
cat ~/.ssh/my_actual_deploy.pub
```

🐙 **DTC-apps/my-actual → Settings → Deploy keys → Add deploy key**: title `actual VPS`, paste
the line, **Allow write access** unchecked.

### 4. 🟦 Download the code

```sh
sudo mkdir -p /srv/actual/data /srv/actual/backups
sudo chown ubuntu: /srv/actual /srv/actual/backups
GIT_SSH_COMMAND='ssh -i ~/.ssh/my_actual_deploy -o IdentitiesOnly=yes' \
  git clone --depth 1 -b custom/main git@github.com:DTC-apps/my-actual.git /srv/actual/src
git -C /srv/actual/src config core.sshCommand 'ssh -i ~/.ssh/my_actual_deploy -o IdentitiesOnly=yes'
```

### 5. 🟦 Build the image

30–60 minutes. Avoid 09:00–09:45 UTC (bank sync, export and import).

```sh
cd /srv/actual/src && sudo docker build -f sync-server.Dockerfile -t my-actual:latest .
```

It ends with `naming to docker.io/library/my-actual:latest`.

### 6. 🟦 Clean up

```sh
sudo docker builder prune -f
sudo swapoff /swapfile && sudo rm /swapfile
```

### 7. 🟦 Container settings

```sh
cp /srv/actual/src/fork/docker-compose.vps.yml /srv/actual/docker-compose.yml
```

Keep the `127.0.0.1:` in front of the port: Docker bypasses ufw, so without it Actual would be
reachable from the internet.

### 8. 🟦 Start it

To move an existing budget, put its data in place first ("Moving from another server", below).

```sh
sudo chown -R 1001:1001 /srv/actual/data
sudo chmod 700 /srv/actual/data /srv/actual/backups
cd /srv/actual && sudo docker compose up -d
sleep 15 && curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5006/health
```

It prints `200`.

### 9. ☁️ Web address

Zero Trust → **Networks → Tunnels** → `finance-vps` → **Public Hostname** (or **Published
application routes**) → add: subdomain `budget`, your domain, type **HTTP**, URL
`127.0.0.1:5006` (not HTTPS, not `localhost`).

### 10. ☁️ Login screen

Zero Trust → **Access → Applications** → **Add an application** → **Self-hosted**: hostname
exactly `ACTUAL_HOST`, login method **One-time PIN**, the same `Only me` policy as the dashboard.

### 11. 💻 Open it

`https://ACTUAL_HOST`: the Cloudflare code, then the Actual password. With end-to-end encryption
on, each browser asks once per address for the **encryption password** ("Missing encryption key"
→ **Create key**). That button checks your existing password; it doesn't make a new key. **Never**
reset or create a new key in Settings → Encryption: everything is re-encrypted, and the bank
sync, the exporter and every device then need the new password.

### 12. 🟦 Nightly backup

```sh
( sudo crontab -l 2>/dev/null; echo "15 4 * * * cd /srv/actual && docker compose stop -t 30 && tar czf /srv/actual/backups/actual-\$(date +\%F).tgz -C /srv/actual data; docker compose start; find /srv/actual/backups -name 'actual-*.tgz' -mtime +14 -delete" ) | sudo crontab -
sudo crontab -l
```

### 13. 🟦 Bank sync and exporter

Set up in the dashboard repo's `deploy/README.md`, Part C (`actualsync` user, the sync project,
the exporter and its upload key, and this crontab):

```sh
sudo crontab -u actualsync -l
```

```cron
0 9 * * * cd $HOME/actual-sync && /usr/bin/node --env-file=.env sync.js >> $HOME/actual-sync/sync.log 2>&1
30 9 * * * cd $HOME/actual-sync/finance-tracker/exporter && node --env-file=$HOME/finance-exporter.env export.js >> $HOME/finance-export.log 2>&1
```

The sync project's `.env` has `ACTUAL_SERVER_URL=http://127.0.0.1:5006`, and so does
`finance-exporter.env`. Both must be run with `--env-file`, as above. Run either by hand with:

```sh
sudo -iu actualsync bash -c 'cd ~/actual-sync && /usr/bin/node --env-file=.env sync.js'
sudo -iu actualsync bash -c 'cd ~/actual-sync/finance-tracker/exporter && node --env-file=$HOME/finance-exporter.env export.js'
```

For anything else as `actualsync`, use `sudo -iu actualsync bash -c '…'` (one quoted command) or
`sudo -u actualsync -H …`. Plain `sudo -iu actualsync COMMAND ARGS` drops empty arguments such
as `-N ''`, and a `~` outside the quotes means `ubuntu`'s home.

---

## Updating Actual

First bring `custom/main` up to date with upstream ([`README.md`](README.md), "Staying current
with upstream"). Then, on the VPS:

```sh
# 🟦 keep the running image as a fallback, then get the new code
sudo docker tag my-actual:latest my-actual:previous
cd /srv/actual/src && git pull
```

Then Install, steps 2, 5 and 6 (swap, build, clean up), and:

```sh
cd /srv/actual && sudo docker compose up -d
sleep 15 && curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5006/health
```

Check the web app and the next morning's sync log. When the new version has run for a few days,
`sudo docker image rm my-actual:previous`.

A new version may upgrade the data when it first starts. After that, the old image can't read
it, so going back means both the old image **and** the backup from before the update (see
"Rolling back").

## Restoring a backup

```sh
cd /srv/actual && sudo docker compose down
sudo mv /srv/actual/data /srv/actual/data.before-restore-$(date +%F)
sudo tar xzf /srv/actual/backups/actual-YYYY-MM-DD.tgz -C /srv/actual
sudo chown -R 1001:1001 /srv/actual/data && sudo chmod 700 /srv/actual/data
sudo ls -la /srv/actual/data
sudo docker compose up -d
```

The `ls -la` shows `.migrate`, `server-files` and `user-files`. The server now has nothing from
after the backup's date. Each browser keeps its own copy of the budget and may send newer changes
back; if Actual shows a sync message, read it carefully and don't choose anything that resets
the file before you're sure. Once all is well, delete the `data.before-restore-…` folder.

## Rolling back an update

```sh
cd /srv/actual && sudo docker compose down
sudo docker tag my-actual:previous my-actual:latest
```

Then restore the backup from **before** the update ("Restoring a backup"; skip its first
`docker compose down`). The old image may not start, or may misread the data, on data the new
one already upgraded.

## Moving from another server

How the budget moved from the Google Cloud VM (🟩). Install steps 1–7 come first, and on the
VPS, the `actualsync` user (dashboard repo, `deploy/README.md`, step 16).

1. 🟩 `curl -s http://localhost:5006/info`: the version must not be newer than this fork's
   (`packages/sync-server/package.json`).
2. 🟩 Note `whoami`, `timedatectl show -p Timezone --value` and `crontab -l`.
3. 🟩 Pack the sync project and the exporter settings, without libraries:

   ```sh
   crontab -l > ~/old-crontab.txt && whoami > ~/old-user.txt
   tar czf ~/sync-bundle.tgz -C ~ \
     --exclude='actual-sync/node_modules' --exclude='actual-sync/finance-tracker/exporter/node_modules' \
     actual-sync finance-exporter.env old-crontab.txt old-user.txt \
     .ssh/finance_tracker_deploy .ssh/finance_tracker_deploy.pub
   sudo tailscale file cp ~/sync-bundle.tgz VPS_NAME:
   ```

4. 🟩 Turn off the old nightly jobs:
   `crontab -l | sed -E '/actual-sync|finance-tracker/ s/^([^#])/# \1/' | crontab -`
5. 🟩 Stop the old Actual for good and send its data, **including the hidden `.migrate`**:

   ```sh
   sudo docker update --restart=no CONTAINER_NAME && sudo docker stop CONTAINER_NAME
   sudo tar czf ~/actual-data.tgz -C DATA_FOLDER .migrate server-files user-files
   sudo tailscale file cp ~/actual-data.tgz VPS_NAME:
   ```

   `docker ps` shows `CONTAINER_NAME`. `DATA_FOLDER` is the folder that contains
   `server-files` (`sudo find / -xdev -type d -name server-files -not -path '*/node_modules/*'`).

6. 🟦 `sudo tailscale file get ~/`, `sudo tar xzf ~/actual-data.tgz -C /srv/actual/data`, then
   Install, steps 8–12.
7. 🟦 Unpack the sync bundle for `actualsync`, replacing the old home folder and `localhost:5006`:

   ```sh
   OLD=$(tar xzf ~/sync-bundle.tgz -O old-user.txt)
   sudo tar xzf ~/sync-bundle.tgz -C /home/actualsync
   sudo chown -R actualsync:actualsync /home/actualsync
   sudo find /home/actualsync/actual-sync -maxdepth 1 -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.json' -o -name '*.env' -o -name '.env*' \) \
     -exec sed -i "s#/home/$OLD/#/home/actualsync/#g; s#localhost:5006#127.0.0.1:5006#g" {} +
   sudo sed -i "s#/home/$OLD/#/home/actualsync/#g; s#localhost:5006#127.0.0.1:5006#g" /home/actualsync/finance-exporter.env
   ```

   Then the dashboard repo's `deploy/README.md`, Part C, from step 17. The VM's cron ran on New
   York time and the VPS runs on UTC, hence 9:00 and 9:30 UTC.

8. Delete `~/sync-bundle.tgz`, `~/actual-data.tgz`, `~/old-crontab.txt` and `~/old-user.txt` on
   both machines: they contain passwords and the budget.
9. After a week of good nightly runs: 🟦 remove the VM's upload key
   (`sudo sed -i '/ finance-drop$/d' /home/finance/.ssh/authorized_keys`), ☁️ delete the old
   Actual hostname and its Access application, delete the VM, and remove it from Tailscale.

---

## Troubleshooting

| Symptom                                       | Cause and fix                                                                                                                                                                                                     |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser: 502 Bad Gateway                      | 🟦 `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5006/health`. **200**: the tunnel route is wrong (Install, step 9: HTTP, `127.0.0.1:5006`). **000**: Actual isn't running; read the logs (next row) |
| Actual keeps restarting                       | 🟦 `cd /srv/actual && sudo docker compose ps` and `sudo docker compose logs actual \| tail -30`                                                                                                                   |
| Logs: `SqliteError: no such column: password` | `.migrate` is missing, so the server re-runs old upgrades. Copy the data again **with** `.migrate` ("Moving", step 5); don't repair the copy that failed                                                          |
| Logs: permission errors on `/data`            | `sudo chown -R 1001:1001 /srv/actual/data`, then `sudo docker compose restart`                                                                                                                                    |
| Browser: "Missing encryption key"             | Normal once per browser and address: **Create key**, then the budget's existing encryption password (Install, step 11)                                                                                            |
| Bank sync: `Could not get remote files`       | It ran without its settings: use `--env-file=.env`, as in the crontab                                                                                                                                             |
| `cd: /home/OLDUSER/actual-sync: No such file` | A command copied from the old VM: use `/home/actualsync/…` and run it as `actualsync`                                                                                                                             |
| Build is killed, or the VPS stalls during it  | Swap isn't on: Install, step 2                                                                                                                                                                                    |
| Upload key: `Permission denied (publickey)`   | The key wasn't created or authorized: dashboard repo, `deploy/README.md`, step 19                                                                                                                                 |
| `ssh-keygen`: `Too many arguments`            | `sudo -iu` dropped the empty `-N ''`: use `sudo -u actualsync -H ssh-keygen …`                                                                                                                                    |

Useful checks (🟦):

```sh
sudo docker compose -f /srv/actual/docker-compose.yml ps
curl -s http://127.0.0.1:5006/info; echo          # running version
sudo tail -n 30 /home/actualsync/actual-sync/sync.log
sudo tail -n 30 /home/actualsync/finance-export.log
sudo journalctl -u finance-import -n 20 --no-pager
ls -lh /srv/actual/backups
```
