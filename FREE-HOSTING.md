# Free 24/7 hosting (PC can be off)

This app must run **continuously** and holds two long-lived **outbound** connections:
Telegram long-polling, and a PumpPortal WebSocket.

Measured footprint on the machine that runs it:

| Metric | Value |
|---|---|
| RAM | ~55 MB |
| CPU | ~0% |
| Listening ports | **none** |

That last row matters more than anything else on this page. Because the bot
opens **no HTTP port**, any host that expects a port to probe, or that sleeps
idle services, cannot run it. Most "free tier" platforms work that way.

---

## Rule these out first (save yourself the time)

| Platform | Why it will not work |
|---|---|
| Render (free) | Free Web Services sleep after ~15 min idle and require an HTTP port. Background Workers are a paid feature. |
| Railway | Trial credit only, then paid. |
| Vercel / Netlify / Deno Deploy / Cloudflare Workers | Request-scoped. Cannot hold a Telegram long-poll and a WebSocket open forever. |
| GitHub Codespaces / Actions | Not always-on. Actions is disabled after 60 days of repo inactivity. |
| Fly.io / Koyeb / Northflank | Card required, and the genuinely free always-on tier is gone. |

---

## Option 1 — Oracle Cloud Always Free ★ best if you have a card

Free with **no time limit**. ARM Ampere A1 or two AMD micro instances. This is
far more machine than the bot needs.

**Oracle halved the ARM allowance on 15 June 2026**, from 4 CPU / 24 GB down to
**2 CPU / 12 GB**, enforced from 18 August 2026. Older guides still quote the
old figure. It is still enormously more than this bot needs.

Two catches, both manageable:

1. **A card is required at signup.** It is used for identity verification, not
   charged, as long as you stay inside the Always Free limits.
2. **Oracle reclaims "idle" instances.** Over a 7-day window, if the
   95th-percentile CPU is under ~10-20%, network under 10%, and memory under
   10%, the instance is considered idle and can be stopped. This bot is around
   0% CPU, so **it will look idle**.

Fix for the idle rule, pick one:

- **Upgrade the account to Pay As You Go.** Always Free resources stay free on
  a PAYG account, and PAYG accounts are exempt from idle reclamation. This is
  the clean fix.
- Or schedule a daily CPU burn so the instance never looks idle, e.g. a cron
  job that runs `sysbench --test=cpu --time=7200 run` for a couple of hours a
  day.

Then, on the VM (Ubuntu 24.04, ARM or x86 both fine):

```bash
git clone https://github.com/dolawale1357/pumpfun-mint-monitor.git
cd pumpfun-mint-monitor
sudo bash deploy/install-vps.sh
sudo nano /opt/pumpfun-mint-monitor/.env    # paste your token + chat id
sudo systemctl start pumpfun-mint-monitor
sudo journalctl -u pumpfun-mint-monitor -f
```

---

## Option 2 — Google Cloud e2-micro Always Free (card required)

One always-free `e2-micro` in `us-west1`, `us-central1`, or `us-east1`:
1 GB RAM, 30 GB disk, **1 GB egress/month**.

- Good news: Google does **not** have Oracle's idle-reclamation policy.
- Watch the egress budget. Telegram long-polling while idle is tiny, and each
  token alert is roughly 700 bytes, so a normal month fits well inside 1 GB.

Deploy exactly the same way as Option 1.

---

## Option 3 — Free bot panel, no card at all

Free Pterodactyl-based bot panels are built for precisely this workload: a
24/7 container that does not sleep, no card required. Your project already
targets this, see **PTERODACTYL.md**.

- Memory: a 256-512 MB plan is plenty, the bot needs ~55 MB.
- Trade-offs: no root or SSH, shared CPU, hosts sometimes vanish, and some
  panels require you to log in periodically to keep the server alive.

Panel steps:

1. Upload or `git pull` the repo into `/home/container`.
2. In the console: `npm ci --omit=dev --ignore-scripts`
3. Set the env vars in the panel, or create `.env`:
   `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (group ids are negative),
   optional `PUMPPORTAL_API_KEY`, and **`AUTOSTART_MONITORING=true`**.
4. Start, then send `/start` in Telegram.

**Set `AUTOSTART_MONITORING=true`.** Panels restart containers on their own
schedule. Without this, the bot comes back up with monitoring **off** and
stays silent until a human sends `/start`, so you would think it is running
when it is not.

No build step is needed: `dist/` is committed.

---

## Option 4 — Cheapest paid VPS, if you can pay by card

If a card is available and you want this genuinely hands-off, a small root VPS
beats every option above. No panel, no sleep, no idle reclamation, no forced
logins, and you own the machine.

| Provider | Cheapest usable plan | Notes |
|---|---|---|
| **RackNerd** | ~$11-22 **per year** — 1 GB RAM / 1 vCPU / 20 GB SSD | Best value by a wide margin. Annual billing, cards and PayPal, no idle policy, full root, instant setup. |
| Vultr | $2.50-5/mo | Instant, monthly billing, card. Costs more over a year. |
| DigitalOcean | $4-6/mo | Same idea, friendlier UI. |
| Hetzner | ~EUR 4-5/mo | Reputable, but raised prices across the board in June 2026 and sometimes asks for ID. |

Even the smallest plan is about 16x more machine than the bot needs (~55-62 MB
RAM). From a fresh Ubuntu or Debian VM, one command does the rest. It installs
Node 20, clones this repo, creates a service user, installs dependencies,
writes `.env`, and registers the service to start on boot:

```bash
curl -fsSL https://raw.githubusercontent.com/dolawale1357/pumpfun-mint-monitor/main/deploy/install-vps.sh -o /tmp/install.sh
sudo bash /tmp/install.sh
sudo nano /opt/pumpfun-mint-monitor/.env   # paste token + chat id
sudo systemctl start pumpfun-mint-monitor
sudo journalctl -u pumpfun-mint-monitor -f
```

The installer writes `AUTOSTART_MONITORING=true` into `.env`, so an unattended
restart resumes monitoring instead of leaving the bot silent.

One caution: **Oracle is not the right free pick for this bot** even when you
have a card, because of the idle policy below. Paying ~$1-2/month removes that
entire category of problem.

---

## Which should you pick?

| Situation | Use |
|---|---|
| You can pay by card and want it to just work | **Option 4, cheap paid VPS.** ~$11-22/year at RackNerd, no idle games, one command to deploy. |
| You have any card (even with no balance) | Option 1, Oracle. Upgrade to Pay As You Go so it is never reclaimed. |
| You have a card but want zero fuss and zero cost | Option 2, GCP e2-micro. No idle policy, but a 1 GB/month egress cap. |
| You have no card at all | **Option 3, free panel.** This is the only real no-card path. |

**No card and no money?** Option 3 is your only path. Options 1 and 2 both
require a card for identity verification, even though the compute itself is
free.

### Picking a free panel, and staying safe on it

- Prefer a panel that advertises **no sleep** and **no forced renewals**. Some
  free hosts stop your server unless you log in every week or two, which
  defeats the point of "PC can be off".
- 256 MB RAM is enough. The bot needs about 55 MB.
- **Trust matters.** On a shared panel the host operator can read your files,
  which includes `.env` and therefore your **Telegram bot token**. Anyone with
  that token fully controls your bot. Only use a panel you trust, and if you
  ever paste the token somewhere risky, revoke it with `/revoke` in BotFather
  and use the new one.
- Panels are not permanent. Keep your code on GitHub so you can move hosts in
  minutes if one disappears.

After installing on a panel, run the checker to confirm the setup:

```bash
bash deploy/panel-verify.sh
```

## Only ever run ONE instance

The bot uses Telegram long-polling, and a bot token allows only one poller.
Two instances at once means `409 Conflict` errors and missed or delayed
alerts. Before you start the server, stop the local copy:

```bash
npm run stop
```

## Why panel builds used to fail

`package.json` has two lifecycle scripts:

- `postinstall` -> `scripts/ensure-pterodactyl.mjs` (needs `scripts/`)
- `prepare` -> `npm run build` (needs `src/` and `tsconfig.json`)

`npm install` runs both, so it fails whenever the tree is incomplete, which is
common on panels. Because `dist/` **and** the entry shims are committed, you
can skip both entirely:

```bash
npm ci --omit=dev --ignore-scripts
```

That is what the Dockerfile and `deploy/install-vps.sh` do, and it is the
fastest path on a small or slow host.

## Free-tier cost summary

| Item | Cost |
|---|---|
| Oracle / GCP Always Free VM | $0 |
| Free bot panel | $0 |
| Cheapest paid VPS (RackNerd 1 GB) | ~$11-22/year, about $1-2/month |
| PumpPortal `subscribeNewToken` | free (documented) |
| Telegram bot | free |
