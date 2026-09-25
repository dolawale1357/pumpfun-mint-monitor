#!/usr/bin/env bash
#
# Run this INSIDE the panel console (or by SSH, if your host gives you one):
#
#   bash deploy/panel-verify.sh
#
# It is read-only. It checks that the install is complete and tells you exactly
# what to fix. No root required, and it never prints your token.

cd "$(dirname "$0")/.." || exit 1

ok=0
warn=0
bad=0

pass() { printf '  \033[32mOK\033[0m    %s\n' "$1"; ok=$((ok + 1)); }
note() { printf '  \033[33mWARN\033[0m  %s\n' "$1"; warn=$((warn + 1)); }
fail() { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; bad=$((bad + 1)); }

printf '\nPump.fun mint monitor - panel readiness check\n'
printf 'Working directory: %s\n\n' "$(pwd)"

# --- Node -------------------------------------------------------------------
if command -v node >/dev/null 2>&1; then
  node_major="$(node -v | cut -c2- | cut -d. -f1)"
  if [[ "${node_major}" -ge 18 ]]; then
    pass "node $(node -v)"
  else
    fail "node $(node -v) is too old - this app needs Node 18+ (20 LTS best)"
  fi
else
  fail "node not found on PATH"
fi

# --- Files ------------------------------------------------------------------
for f in package.json index.js dist/index.js; do
  if [[ -f "${f}" ]]; then
    pass "found ${f}"
  else
    fail "missing ${f}"
  fi
done

if [[ -d node_modules ]]; then
  pass "node_modules present"
else
  fail "node_modules missing - run: npm ci --omit=dev --ignore-scripts"
fi

# --- Dependencies actually resolvable --------------------------------------
for mod in ws grammy dotenv; do
  if node -e "require.resolve('${mod}')" >/dev/null 2>&1; then
    pass "dependency '${mod}' resolves"
  else
    fail "dependency '${mod}' is not installed properly - reinstall dependencies"
  fi
done

# --- Environment ------------------------------------------------------------
if [[ -f .env ]]; then
  pass ".env present"
  # shellcheck disable=SC1091
  token="$(grep -E '^TELEGRAM_BOT_TOKEN=' .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | xargs)"
  chat="$(grep -E '^TELEGRAM_CHAT_ID=' .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | xargs)"

  if [[ -z "${token}" || "${token}" == "REPLACE_ME" || "${token}" == "your_bot_token_here" ]]; then
    fail "TELEGRAM_BOT_TOKEN is empty or still a placeholder"
  elif [[ "${token}" =~ ^[0-9]+:[A-Za-z0-9_-]{30,}$ ]]; then
    pass "TELEGRAM_BOT_TOKEN looks well formed (value hidden)"
  else
    note "TELEGRAM_BOT_TOKEN is set but does not look like a BotFather token"
  fi

  if [[ -z "${chat}" || "${chat}" == "REPLACE_ME" || "${chat}" == "your_chat_id_here" ]]; then
    fail "TELEGRAM_CHAT_ID is empty or still a placeholder"
  else
    pass "TELEGRAM_CHAT_ID set to ${chat}"
    if [[ "${chat}" =~ ^-?[0-9]+$ ]]; then
      pass "TELEGRAM_CHAT_ID is numeric"
    else
      note "TELEGRAM_CHAT_ID is not numeric - Telegram chat ids are numbers"
    fi
  fi

  perms="$(stat -c '%a' .env 2>/dev/null || stat -f '%Lp' .env 2>/dev/null || echo '?')"
  if [[ "${perms}" == "600" ]]; then
    pass ".env permissions are 600"
  else
    note ".env permissions are ${perms} - consider: chmod 600 .env"
  fi
else
  fail ".env missing - copy .env.example to .env and fill it in"
fi

# --- Outbound connectivity --------------------------------------------------
if node -e "
const net = require('net');
const s = net.connect(443, 'api.telegram.org');
s.setTimeout(8000);
s.on('connect', () => { s.destroy(); process.exit(0); });
s.on('timeout', () => { s.destroy(); process.exit(1); });
s.on('error',   () => { process.exit(1); });
" >/dev/null 2>&1; then
  pass "can reach api.telegram.org:443"
else
  fail "cannot reach api.telegram.org:443 - outbound network is blocked"
fi

printf '\n--------------------------------------------\n'
printf ' passed: %d   warnings: %d   failed: %d\n' "${ok}" "${warn}" "${bad}"
printf '%s\n' '--------------------------------------------'

if [[ "${bad}" -gt 0 ]]; then
  printf '\nFix the FAIL lines above, then start the server again.\n'
  printf 'Still stuck? Run: node index.js\n and paste the output.\n\n'
  exit 1
fi

printf '\nReady. Start the server, then send /start to your bot in Telegram.\n'
printf 'Confirm with /status that WebSocket is connected and Monitoring is ACTIVE.\n\n'
