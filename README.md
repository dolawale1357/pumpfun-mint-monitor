# pumpfun-mint-monitor

Read-only monitoring prototype for new Pump.fun token creation events. Connects to the PumpPortal WebSocket, normalizes incoming events, and sends alerts to a Telegram bot.

## What this project does

- Listens for **new Pump.fun token creation** events via PumpPortal WebSocket
- Normalizes events into a consistent internal shape
- Deduplicates by mint address in memory
- Sends formatted Telegram notifications for each new token
- Exposes `/start`, `/stop`, `/status`, and `/help` bot commands for an authorized chat

## What this project does NOT do

This is a **read-only monitor**. It does **not**:

- Buy or sell tokens
- Create, sign, or broadcast transactions
- Store or use private keys
- Connect to wallets
- Execute trades or generate trading instructions
- Subscribe to token trades
- Use automated trading APIs
- Snipe or execute anything on-chain

**Trading: DISABLED**

## Requirements

- **Node.js 18+** (20 LTS recommended)
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- Your authorized Telegram chat ID
- Optional: PumpPortal API key (`subscribeNewToken` is documented as free)

## Create a Telegram bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot`
3. Follow the prompts to choose a name and username
4. BotFather returns your **bot token** — store it securely

## Find your Telegram chat ID

**Private chat with the bot**

1. Start a chat with your bot (`/start`)
2. Send any message
3. Open in a browser (replace `YOUR_BOT_TOKEN`):

   `https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates`

4. Look for `"chat":{"id":123456789}` — that number is your `TELEGRAM_CHAT_ID`

**Group chat**

1. Add the bot to the group and send a message
2. Use `getUpdates` as above
3. Group chat IDs are usually negative numbers

Only the chat ID configured in `TELEGRAM_CHAT_ID` can use `/start`, `/stop`, `/status`, and `/help`.

## PumpPortal API key

`subscribeNewToken` is documented as a **free** stream on PumpPortal.

- Without an API key: connect to `wss://pumpportal.fun/api/data`
- With an API key: connect to `wss://pumpportal.fun/api/data?api-key=YOUR_KEY`

Get an API key from [PumpPortal](https://pumpportal.fun/) if you want authenticated/metered access for other streams later. For new-token monitoring alone, the key is optional.

## Installation

```bash
cd pumpfun-mint-monitor
npm install
cp .env.example .env
```

Edit `.env`:

```env
PUMPPORTAL_API_KEY=
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
```

Never commit `.env` or share tokens publicly.

## Deploy 24/7

To run when your PC is off, deploy to an always-on server.

**Free options:** see **[FREE-HOSTING.md](./FREE-HOSTING.md)** for genuinely
free, always-on setups (Oracle/GCP Always Free, or a free bot panel with no
card required), plus the platforms that cannot work for this bot because it
opens no HTTP port.

**Render (free, no card):** see **[RENDER.md](./RENDER.md)**. Render requires a
web service to listen on a port, so this bot can expose an optional `/health`
endpoint. Read the suspension risk in RENDER.md before you start.

**Paid VPS + PM2:** full steps in **[DEPLOY.md](./DEPLOY.md)**.

Run **only one** bot instance (server **or** local dev, not both).

## Run

**Development (watch mode):**

```bash
npm run dev
```

**Production build:**

```bash
npm run build
npm start
```

**Type check only:**

```bash
npm run typecheck
```

**Everything:** lint, typecheck, build, then the health and stream self-tests.

```bash
npm run verify
```

## Health endpoint (optional)

The bot normally opens **no listening socket**. It is a pure outbound worker:
Telegram long-polling plus one PumpPortal WebSocket. Hosts that require an open
port (Render, for example) can be supported by an HTTP endpoint that stays
disabled unless you ask for it.

Enable it with `PORT` or `HEALTH_PORT`. Render injects `PORT` on its own.

```bash
HEALTH_PORT=8080 npm start
curl -s localhost:8080/health
```

`/health` reports real state rather than merely proving a web server answered:

| Status | HTTP | Meaning |
| --- | --- | --- |
| `ok` | 200 | Monitoring is on and the stream is delivering tokens |
| `starting` | 200 | Inside the boot grace period, socket still connecting |
| `stopped` | 503 | Monitoring is off, so nothing is being detected |
| `degraded` | 503 | Monitoring is on but the socket is not connected |
| `stale` | 503 | Socket says "connected" but has received nothing past the idle limit |

`stale` is the useful one: a socket can stay "connected" while silently wedged,
and no `close` event ever fires. `/` returns the same verdict as one line of
text, and any other path returns 404. The payload never carries your bot token
or chat id.

Related settings: `HEALTH_MAX_IDLE_SECONDS` (default `900`) and
`HEALTH_STARTUP_GRACE_SECONDS` (default `120`).

## Bot commands

The PumpPortal stream does **not** start automatically. Send `/start` from the authorized chat.

To have monitoring begin on boot instead, set `AUTOSTART_MONITORING=true` in
`.env`. Do this if you deploy somewhere that restarts your app on its own
schedule (most free panels do), because otherwise a restart leaves the bot
running but monitoring **off**, and it will stay silent until someone sends
`/start`. `/stop` still works to turn it off for the current run.

With autostart on, a watchdog also runs every 30 seconds and fixes the three
ways a process can be alive but not monitoring: monitoring switched off without
`/stop`, a socket stuck mid-handshake (`ws` has no connect timeout), and a
connected socket that has gone silent. Each of those is silent by nature, so no
`close` event ever fires and the client's own reconnect cannot see them. `/stop`
latches, so the watchdog stands down until `/start`.

| Command | Description |
|---------|-------------|
| `/start` | Start WebSocket listener and subscribe to `subscribeNewToken` |
| `/stop` | Stop monitoring, close WebSocket, disable auto-reconnect |
| `/status` | WebSocket state, stats, runtime, tokens/min, last event time |
| `/help` | Command reference |

Repeated `/start` calls do not open duplicate WebSocket connections.

## Expected Telegram output

**New token alert:**

```
🚨 NEW PUMP.FUN TOKEN

Name: Example Token
Symbol: $EXAMPLE

Mint:
<address>

Creator:
<wallet>

Initial Buy:
0.1 SOL

Market Cap:
28.5 SOL

Received:
2026-09-11T12:00:00.000Z

Links:
Pump.fun: https://pump.fun/coin/<mint>
Solscan: https://solscan.io/token/<mint>
```

Optional fields are omitted when missing from the WebSocket payload.

**Status example:**

```
Monitor Status

WebSocket: connected
Monitoring: ACTIVE
Tokens received: 42
Runtime: 15m 30s
Tokens/min: 2.71
Last event received: 2026-09-11T12:15:00.000Z
Trading: DISABLED
```

## Troubleshooting WebSocket issues

1. **No tokens arriving**
   - Confirm you sent `/start` from the authorized chat
   - Check `/status` — WebSocket should be `connected` and Monitoring `ACTIVE`
   - New tokens only appear when launches happen on Pump.fun

2. **Frequent disconnects**
   - The client uses exponential backoff (3s → 60s max) and resubscribes automatically
   - `/stop` disables reconnection; use `/start` again after fixing network issues

3. **Connection refused / immediate close**
   - Verify outbound WebSocket access to `wss://pumpportal.fun/api/data`
   - If using an API key, confirm it is valid and correctly set in `.env`

4. **Malformed messages**
   - Ignored safely — the app will not crash on bad JSON

5. **Duplicate alerts**
   - Deduplication is by mint address in memory; restarts clear the cache

6. **429 Too Many Requests (Telegram)**
   - Common in busy periods when many tokens launch at once
   - The bot throttles and retries sends automatically in the background
   - Ensure only one bot instance is running (`npm run stop` then `npm run dev`)

## Architecture

```
PumpPortal WebSocket (pumpPortal.ts)
        ↓ normalized NewTokenEvent
Token Service (tokenService.ts) — dedup + stats
        ↓ new unique mint
Telegram Bot (bot.ts) — notifications + commands
```

- `index.ts` — wires components; starts the stream when `AUTOSTART_MONITORING=true`, starts the optional health endpoint, and shuts down cleanly on SIGTERM
- `config.ts` — loads environment variables
- `websocket/pumpPortal.ts` — single connection, reconnect, subscribe, liveness tracking
- `services/tokenService.ts` — normalize, deduplicate, statistics
- `telegram/bot.ts` — commands, authorization, HTML messages
- `telegram/outboundQueue.ts` — rate-limited Telegram delivery
- `health/healthChecker.ts` — decides whether the monitor is genuinely working
- `health/healthServer.ts` — optional HTTP `/health` endpoint (`node:http`, no Express)
- `types/token.ts` — shared types
- `utils/logger.ts` — structured console logging

## Security

- `.env` is gitignored — never commit secrets
- No private keys, wallet code, or trading logic
- Unauthorized Telegram users cannot control the monitor
- Bot tokens and API keys are never logged or sent via Telegram

## License

MIT
