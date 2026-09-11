# Deploy 24/7 (PC can be off)

This bot must run **continuously** (Telegram polling + PumpPortal WebSocket). Use a small **always-on server**, not your laptop.

**Recommended:** Linux VPS (~$4–6/month) + **PM2** process manager.

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
TELEGRAM_CHAT_ID=-5394919441
```

Save and exit. Restrict permissions:

```bash
chmod 600 .env
```

### 5. Install, build, run with PM2

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

## Option B — Railway / Render / Fly.io

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
- [ ] Group chat ID is negative if using a group (e.g. `-5394919441`)
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
