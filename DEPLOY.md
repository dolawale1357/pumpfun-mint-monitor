# Deploy 24/7 (PC can be off)

This bot must run **continuously** (Telegram polling + PumpPortal WebSocket). Use a small **always-on server**, not your laptop.

**No budget?** See **[FREE-HOSTING.md](./FREE-HOSTING.md)** for genuinely free,
always-on options (Oracle/GCP Always Free, or a free bot panel that needs no
card), and for the platforms that **cannot** work for this app.

**Paid:** a small Linux VPS (~$4–6/month) + **PM2** process manager is the
low-friction option.

**Important:** Run **only one instance** of the bot (same `TELEGRAM_BOT_TOKEN`). If your PC and the VPS both run it, you get `409 Conflict` errors.

---

## Option A — VPS (recommended)

Providers: [Hetzner](https://www.hetzner.com/cloud), [DigitalOcean](https://www.digitalocean.com/), [Vultr](https://www.vultr.com/), [Linode](https://www.linode.com/).

Smallest Ubuntu 22.04/24.04 droplet is enough (1 GB RAM).

### 1. Copy the project to the server

On your Mac (from the project folder):

```bash
scp -r "/Users/admin/Desktop/TELEGRAM PROJECT/pumpfun-mint-monitor" root@YOUR_SERVER_IP:/opt/pumpfun-mint-monitor
```

Or use `git clone` if you pushed the repo to GitHub (do **not** commit `.env`).

### 2. SSH into the server

```bash
ssh root@YOUR_SERVER_IP
cd /opt/pumpfun-mint-monitor
```

### 3. Install Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential
node -v   # should be v20.x
```

### 4. Configure environment

```bash
cp .env.example .env
nano .env
```

Set:

```env
PUMPPORTAL_API_KEY=
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_CHAT_ID=-1001234567890
```

Save and exit. Restrict permissions:

```bash
chmod 600 .env
```

### 5. Install, build, run with PM2

**Shortcut:** steps 3-5 are scripted. Instead of doing them by hand:

```bash
sudo bash deploy/install-vps.sh
```

It installs Node 20, creates a `pumpmon` service user, installs dependencies,
writes a `.env` template, and registers a **systemd** service that restarts on
crash and on reboot. Then edit `/opt/pumpfun-mint-monitor/.env` and
`sudo systemctl start pumpfun-mint-monitor`.

The manual PM2 route, if you prefer it:

```bash
npm ci
npm run build
sudo npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Run the command `pm2 startup` prints (enables auto-start after reboot).

### 6. Verify

```bash
pm2 status
pm2 logs pumpfun-mint-monitor --lines 50
```

You should see:

```text
[TELEGRAM] Bot is listening for commands
```

In Telegram (your group), send **`/start`**.

### Useful PM2 commands

```bash
pm2 restart pumpfun-mint-monitor   # after code or .env changes
pm2 stop pumpfun-mint-monitor
pm2 logs pumpfun-mint-monitor
pm2 monit
```

After updating code on the server:

```bash
cd /opt/pumpfun-mint-monitor
npm ci
npm run build
pm2 restart pumpfun-mint-monitor
```

---

## Option B — Pterodactyl panel

Your error happens when the egg runs **`ts-node`** on a TypeScript path and **`dist/` was never built**.

### Fix

1. Upload the **whole project** (including `package.json`, `src/`, `tsconfig.json`, root **`index.js`**).
2. In the panel **Variables** / **Startup**, set `MAIN_FILE`. The right value
   depends on how your egg is written:
   - **Most eggs:** `MAIN_FILE` = `index.js` — it must end in `.js` so the egg
     runs `node`, not `ts-node`.
   - **Some eggs:** the startup line tests `[[ "${MAIN_FILE}" == "*.js" ]]`, so
     it needs the literal text `*.js`. See **[PTERODACTYL.md](./PTERODACTYL.md)**
     if `index.js` gives you a `ts-node` error.
3. Install dependencies. `dist/` **is committed**, so no build is required:

   ```bash
   npm ci --omit=dev --ignore-scripts
   ```

   `--ignore-scripts` skips both the `postinstall` hook and `prepare` (which
   runs `npm run build`), so the install cannot fail on a partial tree. Only if
   you edit `src/` do you need to build: `npm install && npm run build`.
4. Add `.env` in `/home/container/` (or map env vars in the panel):
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID` (group: negative, e.g. `-1001234567890`)
5. **Reinstall** or in console:
   ```bash
   npm install
   npm run build
   ```
6. Start the server.

You should see:

```text
[APP] Starting Telegram bot (PumpPortal stream will start on /start)
[TELEGRAM] Bot is listening for commands
```

### Optional: custom startup command

If your egg allows editing the start command, use:

```bash
if [ -f package.json ]; then npm install; fi && npm run build && node index.js
```

### Node version

Use **Node 20 LTS** if the panel lets you choose. Node 25 often works, but 20 is safer.

---

## Option C — Railway / Render / Fly.io

Works if the service stays **always on** (not scale-to-zero serverless).

1. Connect your Git repo.
2. Set build command: `npm ci && npm run build`
3. Set start command: `npm start`
4. Add env vars in the dashboard: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, optional `PUMPPORTAL_API_KEY`
5. Deploy **one** replica only.

WebSockets are supported on these platforms; pick a region close to you (EU/US).

---

## Checklist before going live

- [ ] Stop local `npm run dev` on your Mac (avoid duplicate bot instances)
- [ ] `.env` on the server only — never in git
- [ ] Group chat ID is negative if using a group (e.g. `-1001234567890`)
- [ ] Send `/start` once after deploy
- [ ] Send `/status` to confirm WebSocket + monitoring

---

## Security

- SSH key login on the VPS (disable password auth when possible)
- `chmod 600 .env`
- Rotate Telegram bot token if it was ever shared publicly (`/revoke` in BotFather)

---

## Cost

- VPS: about **$4–6/month**
- PumpPortal `subscribeNewToken`: documented as **free**
- Telegram: free
