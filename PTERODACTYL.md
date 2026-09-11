# Pterodactyl — startup crash fix

Your egg **always uses `ts-node`** because this check is broken in the egg:

```bash
[[ "${MAIN_FILE}" == "*.js" ]]   # quoted = literal match only, never true for index.js
```

So **`MAIN_FILE=index.js` does not help**. You must change the **Startup Command**.

---

## Required fix — change Startup Command

1. Pterodactyl → your server → **Startup** tab  
2. Find **Startup Command** (Docker startup)  
3. **Delete** the long default command and paste **only this**:

```bash
if [[ -d .git ]] && [[ ${AUTO_UPDATE} == "1" ]]; then git pull; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/npm start
```

4. Click **Save**  
5. **Restart** the server  

This runs `npm start` → `node index.js` and **never uses ts-node**.

---

## After changing startup

Console:

```bash
cd /home/container
git pull
npm install
npm start
```

Expected:

```text
[postinstall] Pterodactyl entry files ready
[APP] Starting Telegram bot...
[TELEGRAM] Bot is listening for commands
```

---

## If you cannot edit Startup Command

Set **`MAIN_FILE`** to `index.ts` (egg default) and ensure files exist:

```bash
git pull
npm install
ls -la index.js index.ts src/index.js dist/index.js
```

`npm install` recreates entry files and builds `dist/`. Then restart.

Still prefer changing the startup command above.

---

## Env

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=-5394919441
```

Use **Node 20** if the panel allows it. Node 25 usually works now.

Send **`/start`** in Telegram. Stop local `npm run dev`.
