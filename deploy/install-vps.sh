#!/usr/bin/env bash
#
# One-shot installer for a fresh Ubuntu / Debian VM.
# Works on any KVM VPS with root: RackNerd, Vultr, Hetzner, DigitalOcean,
# Oracle Cloud Always Free (ARM or AMD), Google Cloud e2-micro.
#
# Usage, on the server, from inside the project folder:
#   sudo bash deploy/install-vps.sh
#
# It will: install Node, create a service user, install dependencies, write a
# .env template, register a systemd service, and enable it on boot.
#
set -euo pipefail

APP_DIR="/opt/pumpfun-mint-monitor"
APP_USER="pumpmon"
NODE_MAJOR="20"
REPO_URL="${REPO_URL:-https://github.com/dolawale1357/pumpfun-mint-monitor.git}"
UNIT_NAME="pumpfun-mint-monitor"

log() { printf '\n==> %s\n' "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

[[ "${EUID}" -eq 0 ]] || die "Run this with sudo: sudo bash deploy/install-vps.sh"

log "Installing base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates git

log "Installing Node.js ${NODE_MAJOR}"
current_major="$(node -v 2>/dev/null | cut -c2- | cut -d. -f1 || true)"
if [[ "${current_major}" != "${NODE_MAJOR}" ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
printf 'node %s / npm %s\n' "$(node -v)" "$(npm -v)"

log "Creating service user ${APP_USER}"
if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  useradd --system --create-home --shell /usr/sbin/nologin "${APP_USER}"
fi

log "Placing the application in ${APP_DIR}"
if [[ -d "${APP_DIR}/.git" ]]; then
  git -C "${APP_DIR}" pull --ff-only
elif [[ -f "${PWD}/package.json" && -f "${PWD}/index.js" ]]; then
  # Install from the folder this script was run from.
  mkdir -p "${APP_DIR}"
  tar --exclude=./node_modules --exclude=./.git --exclude=./.env -cf - . \
    | tar -xf - -C "${APP_DIR}"
else
  git clone --depth 1 "${REPO_URL}" "${APP_DIR}"
fi

cd "${APP_DIR}"

log "Installing dependencies"
# devDependencies are not needed because dist/ is committed.
# --ignore-scripts skips "prepare" (npm run build) and "postinstall"; both
# outputs are committed, and skipping them keeps the install cheap on a 1 GB
# machine. Run `npm run build` yourself after editing src/.
npm ci --omit=dev --ignore-scripts

log "Ensuring dist/ exists"
if [[ ! -f dist/index.js ]]; then
  npm run build
fi

log "Configuring environment"
if [[ ! -f .env ]]; then
  cat > .env <<'ENVEOF'
PUMPPORTAL_API_KEY=
TELEGRAM_BOT_TOKEN=REPLACE_ME
TELEGRAM_CHAT_ID=REPLACE_ME
# Start monitoring as soon as the service boots. Required on any host that
# restarts the app on its own (systemd after a reboot, panel containers),
# otherwise the bot comes back up with monitoring off and waits for /start.
AUTOSTART_MONITORING=true
ENVEOF
fi
chmod 600 .env
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

log "Registering systemd service"
install -m 0644 deploy/pumpfun-mint-monitor.service "/etc/systemd/system/${UNIT_NAME}.service"
systemctl daemon-reload
systemctl enable "${UNIT_NAME}"

if grep -q "REPLACE_ME" .env; then
  printf '\n%s\n' "----------------------------------------------------------------"
  printf '%s\n' " .env still contains placeholders, so the bot was NOT started."
  printf '%s\n' " Edit it, then start the service:"
  printf '%s\n' ""
  printf '%s\n' "   sudo nano ${APP_DIR}/.env"
  printf '%s\n' "   sudo systemctl start ${UNIT_NAME}"
  printf '%s\n' "   sudo journalctl -u ${UNIT_NAME} -f"
  printf '%s\n' "----------------------------------------------------------------"
  exit 0
fi

log "Starting the monitor"
systemctl restart "${UNIT_NAME}"
sleep 4
systemctl --no-pager --full status "${UNIT_NAME}" || true

printf '\n%s\n' "Done. Watch the logs with:"
printf '%s\n' "  sudo journalctl -u ${UNIT_NAME} -f"
printf '%s\n' "Then send /start to your bot in Telegram."
