# Pterodactyl setup (locked startup command)

Your host uses a **fixed startup command** you cannot edit. That is OK.

The egg picks **`node`** vs **`ts-node`** using this check:

```bash
[[ "${MAIN_FILE}" == "*.js" ]]
```

That compares to the **literal text** `*.js` (not a wildcard).  
So you must set **`MAIN_FILE`** to exactly **`*.js`**.

---

## Step 1 — Upload latest files

Re-upload the GitHub zip **or** `git pull`, then:

```bash
cd /home/container
npm install
```

Files must be **directly** in `/home/container/` (not inside a subfolder).

Check:

```bash
ls -la '*.js' index.js dist/index.js package.json
```

You must see a file literally named `*.js`.

---

## Step 2 — Set MAIN_FILE (Startup variables)

1. Open your server → **Startup** tab  
2. Under **Variables**, find **`MAIN_FILE`**  
3. Set value to exactly:

```text
*.js
```

(no `./`, no `index.js`)

4. **Save**

This makes the egg run:

```bash
node /home/container/*.js
```

instead of `ts-node`.

---

## Step 3 — .env

In `/home/container/.env`:

```env
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_CHAT_ID=-1001234567890
```

---

## Step 4 — Restart server

Console should show **node**, not **ts-node**, then:

```text
[APP] Starting Telegram bot...
[TELEGRAM] Bot is listening for commands
```

Send **`/start`** in Telegram.

---

## If it still fails

In the **Console** tab run manually:

```bash
cd /home/container
npm install
node '*.js'
```

Paste the full output here.

---

## Optional: change startup command (if your host allows)

Replace startup with:

```bash
if [[ -d .git ]] && [[ ${AUTO_UPDATE} == "1" ]]; then git pull; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/npm start
```

Only needed if `MAIN_FILE=*.js` does not work on your egg.
