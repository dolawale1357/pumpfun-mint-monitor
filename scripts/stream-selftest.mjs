#!/usr/bin/env node
/**
 * Self-test for PumpPortalClient against a real local WebSocket server.
 *
 * The health selftest covers what the process *reports*. This covers what the
 * stream client actually *does* on the wire, which is where the two recovery
 * paths live:
 *
 *   1. restart() — the watchdog's fix for a socket that is wedged or stuck
 *      mid-handshake. Both states are silent: no `close`, no `error`, so the
 *      client's own reconnect never fires. The old socket must be retired and
 *      exactly one fresh connection must take its place, resubscribed.
 *   2. stopByUser() / start() — /stop has to latch so the watchdog stands down,
 *      and /start has to clear the latch so it can step in again later.
 *
 * No network access is required: the server binds to 127.0.0.1 on a free port.
 *
 * Usage:
 *   npm run build && node scripts/stream-selftest.mjs
 */
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const clientPath = join(rootDir, "dist", "websocket", "pumpPortal.js");
const watchdogPath = join(rootDir, "dist", "health", "watchdog.js");

const missing = [clientPath, watchdogPath].filter((path) => !existsSync(path));
if (missing.length > 0) {
  console.error("[FAIL] dist/ is not built. Run: npm run build");
  for (const path of missing) {
    console.error(`       missing ${path}`);
  }
  process.exit(1);
}

const { PumpPortalClient } = await import(pathToFileURL(clientPath).href);
const { MonitorWatchdog } = await import(pathToFileURL(watchdogPath).href);
const { WebSocketServer } = await import("ws");

let passed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`[PASS] ${name}`);
    return true;
  }
  const suffix = detail === "" ? "" : ` — ${detail}`;
  console.log(`[FAIL] ${name}${suffix}`);
  failures.push(`${name}${suffix}`);
  return false;
}

function eq(name, actual, expected) {
  return check(
    name,
    actual === expected,
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Wait until `predicate()` is true, or give up. */
async function waitFor(predicate, timeoutMs = 5_000, stepMs = 25) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return true;
    }
    await sleep(stepMs);
  }
  return predicate();
}

// ---------------------------------------------------------------------------
// Fixtures — a local server that records every connection and frame
// ---------------------------------------------------------------------------

const server = createServer();
const wss = new WebSocketServer({ server });
const connections = [];
const subscribeFrames = [];

wss.on("connection", (socket) => {
  const record = { socket, closed: false };
  connections.push(record);
  socket.on("message", (data) => {
    subscribeFrames.push(data.toString("utf8"));
  });
  socket.on("close", () => {
    record.closed = true;
  });
  socket.on("error", () => {});
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const wsUrl = `ws://127.0.0.1:${port}`;

const liveConnections = () => connections.filter((record) => !record.closed);

console.log("\n== PumpPortalClient (local stream) ==");

const tokens = [];
const client = new PumpPortalClient({
  wsUrl,
  onToken: (event) => tokens.push(event),
});

// --- 1. start() connects and subscribes -----------------------------------
client.start();
const connected = await waitFor(() => client.getConnectionState() === "connected");
check("connect: reaches connected state", connected, client.getConnectionState());
eq("connect: exactly one socket on the server", liveConnections().length, 1);
await waitFor(() => subscribeFrames.length > 0);
eq(
  "connect: subscribes to the new token stream",
  subscribeFrames[0],
  JSON.stringify({ method: "subscribeNewToken" }),
);
eq("connect: monitoring is on", client.isMonitoringEnabled(), true);
eq("connect: not latched as /stop", client.isStoppedByUser(), false);
check(
  "connect: activity starts empty on a fresh socket",
  client.getLastActivityAt() === null,
  `lastActivityAt=${client.getLastActivityAt()}`,
);

// --- 2. a real token payload reaches the callback --------------------------
liveConnections()[0].socket.send(
  JSON.stringify({ txType: "create", mint: "MiNt111111111111111111111111111111111111111", symbol: "SELF" }),
);
await waitFor(() => tokens.length > 0);
eq("delivery: create payload reaches onToken", tokens.length, 1);
eq("delivery: mint is carried through", tokens[0]?.mint, "MiNt111111111111111111111111111111111111111");
check(
  "delivery: inbound frame recorded as activity",
  client.getLastActivityAt() !== null,
);

// --- 3. restart() retires the old socket and resubscribes ------------------
const staleSocket = liveConnections()[0].socket;
const framesBefore = subscribeFrames.length;
client.restart();
const reconnected = await waitFor(
  () => client.getConnectionState() === "connected" && liveConnections().length === 1,
);
check("restart: comes back connected", reconnected, client.getConnectionState());
eq("restart: still exactly one live socket", liveConnections().length, 1);
check(
  "restart: the old socket is retired, not left open",
  staleSocket.readyState === 1 || staleSocket.readyState === 2 || staleSocket.readyState === 3,
);
check(
  "restart: the retired socket is not the live one",
  liveConnections()[0]?.socket !== staleSocket,
);
await waitFor(() => subscribeFrames.length > framesBefore);
eq(
  "restart: the fresh socket resubscribes",
  subscribeFrames[subscribeFrames.length - 1],
  JSON.stringify({ method: "subscribeNewToken" }),
);
eq("restart: monitoring stays on", client.isMonitoringEnabled(), true);
check(
  "restart: activity is reset so a new socket is not judged stale",
  client.getLastActivityAt() === null,
  `lastActivityAt=${client.getLastActivityAt()}`,
);

// --- 4. a wedged socket is what the watchdog detects ----------------------
// The socket stays open and the server goes silent. Nothing will fire a close
// or error event, so only an external restart clears it.
const wedged = liveConnections()[0].socket;
eq("wedge: socket is still open while silent", wedged.readyState, 1);
eq("wedge: client still reports connected", client.getConnectionState(), "connected");
check(
  "wedge: silence is invisible to the client",
  client.getLastActivityAt() === null,
  "no frames, no close — this is the case restart() exists for",
);

// --- 5. /stop latches, /start clears --------------------------------------
client.stopByUser();
eq("stop: monitoring is off", client.isMonitoringEnabled(), false);
eq("stop: latch is set so the watchdog stands down", client.isStoppedByUser(), true);
eq("stop: state is disconnected", client.getConnectionState(), "disconnected");
await waitFor(() => liveConnections().length === 0);
eq("stop: server sees the socket close", liveConnections().length, 0);

await sleep(150);
eq("stop: no reconnect after an operator stop", liveConnections().length, 0);

client.start();
const restarted = await waitFor(() => client.getConnectionState() === "connected");
check("start: reconnects after a stop", restarted, client.getConnectionState());
eq("start: latch is cleared", client.isStoppedByUser(), false);
eq("start: monitoring is on again", client.isMonitoringEnabled(), true);

// --- 6. the watchdog actually drives that recovery on the wire ------------
// Composed path: real sockets, real client, watchdog judging with a fake clock.
const fakeNow = { value: Date.now() };
const watchdog = new MonitorWatchdog({
  startupGraceMs: 120_000,
  maxIdleMs: 900_000,
  readSnapshot: () => ({
    processStartedAt: fakeNow.value - 3_600_000,
    monitoringEnabled: client.isMonitoringEnabled(),
    connectionState: client.getConnectionState(),
    connectionStateSince: client.getConnectionStateSince(),
    lastActivityAt: client.getLastActivityAt(),
    connectedAt: client.getConnectedAt(),
  }),
  isStoppedByUser: () => client.isStoppedByUser(),
  enableMonitoring: () => client.start(),
  restartStream: () => client.restart(),
  intervalMs: 60_000,
  now: () => fakeNow.value,
});

let framesBeforeWatchdog = subscribeFrames.length;
fakeNow.value = Date.now() + 3_600_000; // the socket has gone quiet (no frames)
eq(
  "watchdog on the wire: a silent socket is restarted",
  watchdog.tick(),
  "restart-stream",
);
const watchdogReconnected = await waitFor(
  () => client.getConnectionState() === "connected" && liveConnections().length === 1,
);
check(
  "watchdog on the wire: a fresh socket is up",
  watchdogReconnected,
  client.getConnectionState(),
);
eq("watchdog on the wire: one socket, not two", liveConnections().length, 1);
await waitFor(() => subscribeFrames.length > framesBeforeWatchdog);
eq(
  "watchdog on the wire: the fresh socket resubscribes",
  subscribeFrames[subscribeFrames.length - 1],
  JSON.stringify({ method: "subscribeNewToken" }),
);

// monitoring off (not by /stop) is the state that made the bot look alive while
// silent: the watchdog has to turn the stream back on by itself.
fakeNow.value = Date.now();
client.stop();
await waitFor(() => liveConnections().length === 0);
framesBeforeWatchdog = subscribeFrames.length;
eq(
  "watchdog on the wire: monitoring left off is restarted",
  watchdog.tick(),
  "enable-monitoring",
);
const watchdogEnabled = await waitFor(() => client.getConnectionState() === "connected");
check(
  "watchdog on the wire: monitoring is live again",
  watchdogEnabled,
  client.getConnectionState(),
);
eq("watchdog on the wire: monitoring flag is on", client.isMonitoringEnabled(), true);

// ...but a /stop from the operator is not a fault to correct.
client.stopByUser();
await waitFor(() => liveConnections().length === 0);
eq("watchdog on the wire: stands down after /stop", watchdog.tick(), "none");
await sleep(150);
eq("watchdog on the wire: /stop stays stopped", liveConnections().length, 0);

// --- 7. shutdown ----------------------------------------------------------
client.stop();
await waitFor(() => liveConnections().length === 0);
eq("teardown: sockets closed", liveConnections().length, 0);

for (const record of connections) {
  record.socket.terminate();
}
await new Promise((resolve) => wss.close(resolve));
await new Promise((resolve) => server.close(resolve));

console.log("");
if (failures.length > 0) {
  console.log(
    `[FAIL] ${failures.length} of ${passed + failures.length} stream checks failed:`,
  );
  for (const failure of failures) {
    console.log(`       ${failure}`);
  }
  process.exit(1);
}

console.log(`[PASS] all ${passed} stream checks passed`);
process.exit(0);
