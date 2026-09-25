# Deploying on Render (free)

Render can run this bot on its free plan with **no credit card and no cost**.
This file is the whole procedure. Read the risk section before you start,
because the free plan has one failure mode that cannot be engineered away.

---

## The risk, stated plainly

Render's free tier gives **750 instance hours per workspace per month**.

Always-on for a 31-day month is **744 hours**. That leaves roughly **6 hours of
margin**. If you cross the cap, Render **suspends every Free web service until
the first day of the next calendar month**, and you cannot restart it early.
Every other hosting option in `FREE-HOSTING.md` fails softly. This one fails
hard and locked.

Two other things Render's docs say about the free plan, both relevant here:

- "Render may suspend a Free web service that initiates an uncommonly high
  volume of traffic over the public internet," with "invoking external APIs"
  given as an example. A permanent WebSocket to PumpPortal plus continuous
  Telegram polling is exactly that pattern, and the call is discretionary.
- "Render might restart a Free web service at any time," and its docs say
  "Do not use them for production applications."

So: Render free is a real, working, $0 deployment. It is also the only option
here that can lock you out mid-month. If the monitor has to be genuinely
always-on, the paid VPS in `FREE-HOSTING.md` (RackNerd, ~$22/year) is the answer
and this file is not.

---

## What is different about this bot on Render

Render **requires a web service to listen on a port**. The bot was previously a
pure outbound worker that opened no port at all. It now opens a small HTTP
endpoint when, and only when, `PORT` or `HEALTH_PORT` is set:

- On Render, `PORT` is injected automatically, so the endpoint runs.
- On a VPS or a panel, neither variable is set, so the process still opens no
  listening socket at all. That property is preserved on purpose.

The endpoint is `GET /health`, and it is designed to be **honest rather than
reassuring**:

| Status | HTTP | Meaning |
| --- | --- | --- |
| `ok` | 200 | Monitoring is on and the stream is delivering |
| `starting` | 200 | Within 2 minutes of boot; the socket is still coming up |
| `stopped` | 503 | Monitoring is off, so no tokens are being detected |
| `degraded` | 503 | Monitoring is on but the socket is not connected |
| `stale` | 503 | Socket says "connected" but has received nothing for 15 minutes |

The `stale` case is the important one. A socket can stay "connected" while
silently wedged, and no `close` event ever fires. `/health` returns 503 once
inbound traffic stops, which is the only way an external check can tell that
the bot is actually dead.

`/` returns the same verdict as a one-line text summary. `POST` returns 405, an
unknown path returns 404. The payload never contains your bot token or chat id.

---

## Setup

**1. Get your two secret values.** In the project folder:

```bash
cd "$HOME/Desktop/TELEGRAM PROJECT/pumpfun-mint-monitor"
grep -E '^TELEGRAM_(BOT_TOKEN|CHAT_ID)=' .env
```

**2. Push the repo.** Render deploys from GitHub, so `main` must contain
`render.yaml`. `dist/` is committed, which is why Render needs no build step.

**3. Sign up at [render.com](https://render.com) with your GitHub account.**
No card is required for the free plan.

**4. In the dashboard: `New +` → `Blueprint`.**

**5. Pick the `pumpfun-mint-monitor` repository.** Render reads `render.yaml`
and shows a preview of the service it will create.

**6. Fill in the two secrets it asks for.** They are marked `sync: false` in
`render.yaml`, so Render prompts for them instead of reading them from the repo:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

**7. Click `Apply`.** The first deploy takes a couple of minutes.

**8. Open `https://<service-name>.onrender.com/health`.**

A healthy report looks like this:

```json
{
  "healthy": true,
  "status": "ok",
  "reasons": [],
  "details": {
    "uptimeSeconds": 40,
    "monitoringEnabled": true,
    "connectionState": "connected",
    "secondsSinceActivity": 4,
    "tokensReceived": 18,
    "tokensPerMinute": 26.36,
    "lastTokenAt": "2026-09-25T20:03:10.147Z",
    "sentNotifications": 16,
    "failedNotifications": 0
  }
}
```

In the Render log, a good boot reads:

```
[APP] Autostart enabled — monitoring starts without waiting for /start
[HEALTH] Health endpoint listening on http://0.0.0.0:<port>/health
[TELEGRAM] Bot is listening for commands
[WS] Connected
```

---

## Sleeping, and the keep-awake trade-off

A free instance **spins down after 15 minutes with no inbound traffic**. Because
the bot opens no port when run elsewhere, the Render instance has no reason to
receive any, so it will sleep. While it sleeps, the bot is not monitoring.

The usual workaround is an external pinger. Point a free UptimeRobot monitor at
`/health` every 5 minutes and the idle timer never fires. Two notes:

- Before this change that trick was worthless, because a web server answering
  "OK" proved nothing about the bot. It now works properly, since `/health`
  turns into a 503 the moment the stream goes stale.
- But keeping it awake around the clock is exactly what spends the 750-hour
  budget. Sleeping is what keeps you inside the quota; sleeping is also what
  stops the monitor. **You cannot have both free and always-on.**

Setting up the pinger, if you want the longest possible uptime inside the free
quota:

1. Create a free account at [uptimerobot.com](https://uptimerobot.com).
2. `Add New Monitor` → type `HTTP(s)`.
3. URL: `https://<service-name>.onrender.com/health`
4. Monitoring interval: `5 minutes`.
5. Optionally set an alert contact, so a 503 emails you when the bot dies.

When the instance has slept, the first request takes roughly 30 to 60 seconds
to wake it, and `/health` reports `starting` until the socket connects.

---

## Settings

Set these in the Render dashboard under `Environment`. `render.yaml` already
sets the first three.

| Variable | Default | Purpose |
| --- | --- | --- |
| `AUTOSTART_MONITORING` | `true` (in `render.yaml`) | Starts monitoring on boot, since a restart leaves nobody to send `/start` |
| `TELEGRAM_BOT_TOKEN` | — | Bot token from @BotFather. Secret. |
| `TELEGRAM_CHAT_ID` | — | The one chat allowed to control the bot. Secret. |
| `HEALTH_MAX_IDLE_SECONDS` | `900` | Inbound silence before `/health` reports `stale`. Lower to detect a dead stream faster. |
| `HEALTH_STARTUP_GRACE_SECONDS` | `120` | Boot grace period before an unconnected socket counts as a fault. |
| `PORT` | injected by Render | Do not set this by hand; Render provides it. |

---

## Running the checks yourself

```bash
npm run verify        # lint, typecheck, build, then 67 health checks
```

The health self-test starts the endpoint on a throwaway port and asserts every
state maps to the right HTTP code, that live state changes are reflected without
a restart, that the port is released on shutdown, and that credentials never
appear in the payload.

---

## Deliberately not done here

`typescript`, `tsx`, `@types/node` and `@types/ws` sit in `dependencies` rather
than `devDependencies`, so a production install pulls build tooling it does not
run. Moving them would shrink installs and cold starts, but it also invalidates
the install sizes measured in `FREE-HOSTING.md`, so it belongs in its own change
with its own measurements.
