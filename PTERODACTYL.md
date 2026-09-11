# Pterodactyl setup

Your error (`ts-node` + `Cannot find module './index.js'`) means the **default egg startup** is still running **`ts-node`** on a `.ts` file.  
**Do not rely on `MAIN_FILE` alone** — replace the startup command (recommended).

---

## Fix (recommended): replace startup command

1. Open the server in Pterodactyl → **Startup** tab.
2. Find **Startup Command** (Docker startup / start command).
3. **Replace the entire command** with:

```bash
if [[ -f package.json ]]; then /usr/local/bin/npm install; fi; /usr/local/bin/npm start
```

4. Save, then **Reinstall** or restart the server.

This runs **`npm start`** → **`node index.js`** → **`tsx src/index.ts`** (no `ts-node`, no manual build).

---

## If you must use `MAIN_FILE` only

Set **`MAIN_FILE`** to exactly (no `./` prefix):

```text
index.js
```

Or try:

```text
server.js
```

Both files are in the project root. The egg must use **`node`**, not **`ts-node`**.

If `MAIN_FILE` is `index.ts`, `src/index.ts`, or `./index.js`, the egg often still uses **ts-node** and will crash.

---

## Files & env

Upload the full repo to `/home/container/`:

- `src/`, `package.json`, `tsconfig.json`, `index.js`, `server.js`, `.env`

`.env` example:

```env
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_CHAT_ID=-5394919441
PUMPPORTAL_API_KEY=
```

---

## Console test

```bash
cd /home/container
npm install
npm start
```

Expected:

```text
[APP] Starting Telegram bot (PumpPortal stream will start on /start)
[TELEGRAM] Bot is listening for commands
```

Then send **`/start`** in Telegram. Stop **`npm run dev`** on your PC (one bot instance).

---

## Node version

Use **Node 20 LTS** in the panel if you can (not required, but safer than Node 25).
