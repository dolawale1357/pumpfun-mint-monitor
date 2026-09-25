# Runs the monitor as a tiny always-on worker.
#
# dist/ is committed, so no TypeScript build is needed at image build time.
# This app opens NO listening port - it is a pure outbound worker
# (Telegram long-polling + PumpPortal WebSocket), so no EXPOSE and no
# port-based healthcheck.

FROM node:20-slim

ENV NODE_ENV=production

WORKDIR /app

# --ignore-scripts is required here. package.json has two lifecycle scripts:
#   postinstall -> scripts/ensure-pterodactyl.mjs  (needs scripts/)
#   prepare     -> npm run build                   (needs src/ + tsconfig.json)
# Running them before the source tree is copied makes `npm ci` fail. The entry
# shims and dist/ are both committed, so neither script is needed to run.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# App code, including the committed dist/ output.
COPY src ./src
COPY dist ./dist
COPY index.js ./index.js
COPY tsconfig.json ./

# Run as the non-root user that the node image ships with.
USER node

# index.js checks for dist/index.js, then imports it.
CMD ["node", "index.js"]
