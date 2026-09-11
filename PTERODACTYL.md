# Pterodactyl — fix startup crash

Your error means the egg is running **`ts-node`** on a **`.ts`** path.  
This project ships **pre-built `dist/`** + root **`index.js`** so **`node`** can start without building.

---

## Step A — Pull latest code

```bash
cd /home/container
git pull
npm install
```

`npm install` runs **`npm run build`** automatically (`prepare` script).

---

## Step B — Set `MAIN_FILE` (Startup variables)

Use **exactly one** of these (no `./` needed):

| Value | How it starts |
|--------|----------------|
| **`index.js`** | `node` (recommended) |
| `server.js` | `node` |
| `app.js` | `node` |
| `index.ts` | `ts-node` → loads `dist/` |

**Do not use:** `src/index.ts` — that triggers `ts-node` on source and crashes.

---

## Step C — Replace startup command (if it still crashes)

**Startup** tab → replace **Startup Command** with:

```bash
if [[ -d .git ]] && [[ ${AUTO_UPDATE} == "1" ]]; then git pull; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/npm start
```

This always runs **`npm start`** → **`node index.js`** (ignores broken `MAIN_FILE` / `ts-node`).

---

## Step D — Test in console

```bash
cd /home/container
ls -la index.js dist/index.js
npm start
```

Expected:

```text
[APP] Starting Telegram bot (PumpPortal stream will start on /start)
[TELEGRAM] Bot is listening for commands
```

---

## Env & Node

`.env` in `/home/container/`:

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=-5394919441
```

Set **Node 20** in the panel (avoid Node 25 if possible).

Send **`/start`** in Telegram. Only **one** bot instance (stop local `npm run dev`).
