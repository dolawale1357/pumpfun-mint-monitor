# Pterodactyl setup (quick)

## 1. Startup variable

Set **`MAIN_FILE`** to:

```text
index.js
```

The egg uses **`node`** only when the file ends with `.js`.  
If `MAIN_FILE` is `src/index.ts` (or anything else), it runs **`ts-node`** and will crash.

## 2. Upload files

Upload the full project: `src/`, `package.json`, `tsconfig.json`, `index.js`, `.env`.

## 3. Environment

Create `/home/container/.env` or set panel variables:

```env
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_CHAT_ID=-5394919441
PUMPPORTAL_API_KEY=
```

## 4. Install & start

On first start, `index.js` runs **`npm run build`** automatically if `dist/` is missing.

Or in the console:

```bash
npm install
npm start
```

## 5. Telegram

Send **`/start`** in your authorized group.  
Stop **`npm run dev`** on your PC (one bot instance only).

## Optional: custom startup command

If your egg allows replacing the start command:

```bash
bash start.sh
```

Or:

```bash
npm install && node index.js
```

## Node version

Use **Node 20 LTS** in the panel if available.
