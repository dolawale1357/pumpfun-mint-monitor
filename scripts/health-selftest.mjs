#!/usr/bin/env node
/**
 * Self-test for the /health endpoint.
 *
 * The repo has no test framework, so this follows the same style as
 * deploy/panel-verify.sh: a single dependency-free script that prints one
 * line per check and exits non-zero on the first class of failure.
 *
 * It covers two things that are easy to get wrong:
 *   1. `evaluateHealth` reports the truth about the monitor, not just that the
 *      process is alive. A 503 has to mean something.
 *   2. `HealthServer` maps that verdict onto real HTTP (200 / 503 / 404 / 405),
 *      reflects live state without a restart, and frees its port on stop().
 *
 * Usage:
 *   npm run build && node scripts/health-selftest.mjs
 */
import { existsSync } from "node:fs";
import { request } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const checkerPath = join(rootDir, "dist", "health", "healthChecker.js");
const serverPath = join(rootDir, "dist", "health", "healthServer.js");
const configPath = join(rootDir, "dist", "config.js");
const watchdogPath = join(rootDir, "dist", "health", "watchdog.js");

const missing = [checkerPath, serverPath, configPath, watchdogPath].filter(
  (path) => !existsSync(path),
);
if (missing.length > 0) {
  console.error("[FAIL] dist/ is not built. Run: npm run build");
  for (const path of missing) {
    console.error(`       missing ${path}`);
  }
  process.exit(1);
}

const { evaluateHealth } = await import(pathToFileURL(checkerPath).href);
const { HealthServer } = await import(pathToFileURL(serverPath).href);
const { loadConfig } = await import(pathToFileURL(configPath).href);
const { decideWatchdogAction, MonitorWatchdog } = await import(
  pathToFileURL(watchdogPath).href,
);

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

function httpRequest(port, method, path) {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, method, path }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () =>
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        }),
      );
    });
    req.on("error", reject);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = Date.now();
const thresholds = { startupGraceMs: 120_000, maxIdleMs: 900_000 };
const CREDENTIAL_KEY = /bot_?token|chat_?id|api_?key|secret|password|bearer/i;

function makeStats(overrides = {}) {
  return {
    totalTokensReceived: 42,
    tokensPerMinute: 7.5,
    sessionRuntimeMs: 600_000,
    lastEventReceivedAt: NOW - 5_000,
    lastBlockchainCreatedAt: null,
    seenMintCount: 128,
    ...overrides,
  };
}

/** A healthy, connected, actively-receiving monitor. */
function makeSnapshot(overrides = {}) {
  return {
    processStartedAt: NOW - 600_000,
    monitoringEnabled: true,
    connectionState: "connected",
    lastActivityAt: NOW - 5_000,
    connectedAt: NOW - 30_000,
    stats: makeStats(),
    notificationsEnabled: true,
    pendingNotifications: 0,
    sentNotifications: 12,
    failedNotifications: 0,
    stoppedByUser: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Part 1 — evaluator: does the verdict actually mean something?
// ---------------------------------------------------------------------------

console.log("\n== evaluateHealth ==");

{
  const report = evaluateHealth(
    makeSnapshot({ monitoringEnabled: false, connectionState: "disconnected" }),
    thresholds,
    NOW,
  );
  eq("stopped: monitoring off is unhealthy", report.healthy, false);
  eq("stopped: status is reported", report.status, "stopped");
  check("stopped: explains why and how to fix", report.reasons.length > 0);
  eq("stopped: not blamed on /stop by default", report.details.stoppedByUser, false);
}

{
  const report = evaluateHealth(
    makeSnapshot({
      monitoringEnabled: false,
      connectionState: "disconnected",
      stoppedByUser: true,
    }),
    thresholds,
    NOW,
  );
  eq("stopped by /stop: still unhealthy", report.healthy, false);
  eq("stopped by /stop: flagged in details", report.details.stoppedByUser, true);
  check(
    "stopped by /stop: reason names /stop rather than autostart",
    report.reasons.some((reason) => reason.includes("/stop")) &&
      !report.reasons.some((reason) => reason.includes("AUTOSTART_MONITORING")),
    report.reasons.join("; "),
  );
}

{
  const report = evaluateHealth(
    makeSnapshot({
      connectionState: "connecting",
      lastActivityAt: null,
      connectedAt: null,
      processStartedAt: NOW - 10_000,
    }),
    thresholds,
    NOW,
  );
  eq("starting: unconnected inside grace stays healthy", report.healthy, true);
  eq("starting: status is reported", report.status, "starting");
  eq("starting: no reasons when healthy", report.reasons.length, 0);
}

{
  const report = evaluateHealth(
    makeSnapshot({
      connectionState: "disconnected",
      lastActivityAt: null,
      connectedAt: null,
      processStartedAt: NOW - 600_000,
    }),
    thresholds,
    NOW,
  );
  eq("degraded: unconnected past grace is unhealthy", report.healthy, false);
  eq("degraded: status is reported", report.status, "degraded");
}

{
  const report = evaluateHealth(
    makeSnapshot({ connectionState: "reconnecting", connectedAt: null }),
    thresholds,
    NOW,
  );
  eq("reconnecting: past grace is unhealthy", report.healthy, false);
  eq("reconnecting: status is reported", report.status, "degraded");
}

{
  const report = evaluateHealth(makeSnapshot(), thresholds, NOW);
  eq("ok: active stream is healthy", report.healthy, true);
  eq("ok: status is reported", report.status, "ok");
  eq("ok: no reasons when healthy", report.reasons.length, 0);
}

{
  const report = evaluateHealth(
    makeSnapshot({ lastActivityAt: NOW - 1_000_000 }),
    thresholds,
    NOW,
  );
  eq("stale: silent socket is unhealthy", report.healthy, false);
  eq("stale: status is reported", report.status, "stale");
}

{
  const report = evaluateHealth(
    makeSnapshot({ lastActivityAt: null, connectedAt: NOW - 1_000_000 }),
    thresholds,
    NOW,
  );
  eq("stale: never-delivered socket is unhealthy", report.healthy, false);
  eq("stale: status is reported", report.status, "stale");
}

{
  const report = evaluateHealth(
    makeSnapshot({ lastActivityAt: null, connectedAt: NOW - 1_000 }),
    thresholds,
    NOW,
  );
  eq("ok: freshly connected socket is healthy", report.healthy, true);
}

{
  const report = evaluateHealth(
    makeSnapshot({ lastActivityAt: NOW - thresholds.maxIdleMs }),
    thresholds,
    NOW,
  );
  eq("boundary: silence exactly at the limit is still healthy", report.healthy, true);
}

{
  const report = evaluateHealth(
    makeSnapshot({ lastActivityAt: NOW - thresholds.maxIdleMs - 1_000 }),
    thresholds,
    NOW,
  );
  eq("boundary: one tick past the limit is unhealthy", report.healthy, false);
}

{
  const report = evaluateHealth(makeSnapshot(), thresholds, NOW);
  eq("details: idle limit is exposed", report.details.maxIdleSeconds, 900);
  eq("details: idle time is exposed", report.details.secondsSinceActivity, 5);
  eq("details: uptime is exposed", report.details.uptimeSeconds, 600);
  eq(
    "details: last token time is ISO",
    report.details.lastTokenAt,
    new Date(NOW - 5_000).toISOString(),
  );
  // `tokensReceived` and `tokensPerMinute` are counters, not credentials, so
  // this pattern targets credential-shaped names rather than the word "token".
  // The endpoint can be world-readable, so it must never carry the bot token.
  check(
    "details: payload exposes no credential-shaped field",
    !Object.keys(report.details).some((key) => CREDENTIAL_KEY.test(key)),
    `keys: ${Object.keys(report.details).join(", ")}`,
  );
  // Guard the guard: a credential check that can never fail is theatre.
  check(
    "credential check catches real leaks and ignores counters",
    ["botToken", "chat_id", "apiKey", "SECRET"].every((name) =>
      CREDENTIAL_KEY.test(name),
    ) &&
      ["tokensReceived", "tokensPerMinute", "lastTokenAt"].every(
        (name) => !CREDENTIAL_KEY.test(name),
      ),
  );
}

// ---------------------------------------------------------------------------
// Part 1b — watchdog: a process that is alive but not monitoring heals itself
// ---------------------------------------------------------------------------

console.log("\n== MonitorWatchdog ==");

const policy = {
  stoppedByUser: false,
  startupGraceMs: 120_000,
  maxIdleMs: 900_000,
};

/** A monitor that is running, connected and receiving. */
function makeWatchdogSnapshot(overrides = {}) {
  return {
    processStartedAt: NOW - 600_000,
    monitoringEnabled: true,
    connectionState: "connected",
    connectionStateSince: NOW - 60_000,
    lastActivityAt: NOW - 5_000,
    connectedAt: NOW - 60_000,
    ...overrides,
  };
}

eq(
  "watchdog: leaves a healthy monitor alone",
  decideWatchdogAction(makeWatchdogSnapshot(), policy, NOW),
  "none",
);
eq(
  "watchdog: starts monitoring that was left off",
  decideWatchdogAction(
    makeWatchdogSnapshot({ monitoringEnabled: false }),
    policy,
    NOW,
  ),
  "enable-monitoring",
);
eq(
  "watchdog: acts on missing monitoring even inside the boot grace",
  decideWatchdogAction(
    makeWatchdogSnapshot({
      monitoringEnabled: false,
      processStartedAt: NOW - 5_000,
    }),
    policy,
    NOW,
  ),
  "enable-monitoring",
);
eq(
  "watchdog: stands down after /stop",
  decideWatchdogAction(
    makeWatchdogSnapshot({ monitoringEnabled: false }),
    { ...policy, stoppedByUser: true },
    NOW,
  ),
  "none",
);
eq(
  "watchdog: does not fight /stop even on a wedged socket",
  decideWatchdogAction(
    makeWatchdogSnapshot({ lastActivityAt: NOW - 3_600_000 }),
    { ...policy, stoppedByUser: true },
    NOW,
  ),
  "none",
);
eq(
  "watchdog: forces a fresh socket when connected but silent",
  decideWatchdogAction(
    makeWatchdogSnapshot({ lastActivityAt: NOW - 901_000 }),
    policy,
    NOW,
  ),
  "restart-stream",
);
eq(
  "watchdog: tolerates silence inside the idle limit",
  decideWatchdogAction(
    makeWatchdogSnapshot({ lastActivityAt: NOW - 899_000 }),
    policy,
    NOW,
  ),
  "none",
);
eq(
  "watchdog: forces a fresh socket stuck mid-handshake",
  decideWatchdogAction(
    makeWatchdogSnapshot({
      connectionState: "connecting",
      connectedAt: null,
      lastActivityAt: null,
      connectionStateSince: NOW - 300_000,
    }),
    policy,
    NOW,
  ),
  "restart-stream",
);
eq(
  "watchdog: gives a connecting socket the grace period",
  decideWatchdogAction(
    makeWatchdogSnapshot({
      connectionState: "connecting",
      connectedAt: null,
      lastActivityAt: null,
      connectionStateSince: NOW - 30_000,
    }),
    policy,
    NOW,
  ),
  "none",
);
eq(
  "watchdog: waits out the boot grace before judging state",
  decideWatchdogAction(
    makeWatchdogSnapshot({
      processStartedAt: NOW - 10_000,
      connectionState: "connecting",
      connectedAt: null,
      lastActivityAt: null,
      connectionStateSince: NOW - 10_000,
    }),
    policy,
    NOW,
  ),
  "none",
);
eq(
  "watchdog: recovers a socket that never delivered a frame",
  decideWatchdogAction(
    makeWatchdogSnapshot({
      lastActivityAt: null,
      connectionStateSince: NOW - 901_000,
      connectedAt: NOW - 901_000,
    }),
    policy,
    NOW,
  ),
  "restart-stream",
);
// Same rule as /health: a socket that connected but has never carried a frame
// is judged from the moment it connected, so no action inside the idle limit.
eq(
  "watchdog: agrees with /health on a silent-but-fresh connection",
  decideWatchdogAction(
    makeWatchdogSnapshot({
      lastActivityAt: null,
      connectionStateSince: NOW - 300_000,
      connectedAt: NOW - 300_000,
    }),
    policy,
    NOW,
  ),
  "none",
);

{
  // Which callback fires on a tick, and does /stop gate both of them?
  const calls = [];
  let snapshot = makeWatchdogSnapshot();
  let stoppedByUser = false;
  const watchdog = new MonitorWatchdog({
    startupGraceMs: policy.startupGraceMs,
    maxIdleMs: policy.maxIdleMs,
    readSnapshot: () => snapshot,
    isStoppedByUser: () => stoppedByUser,
    enableMonitoring: () => calls.push("enable"),
    restartStream: () => calls.push("restart"),
    intervalMs: 60_000,
    now: () => NOW,
  });

  eq("watchdog tick: healthy run does nothing", watchdog.tick(), "none");
  eq("watchdog tick: no callback on a healthy run", calls.length, 0);

  snapshot = makeWatchdogSnapshot({ monitoringEnabled: false });
  eq("watchdog tick: re-enables monitoring", watchdog.tick(), "enable-monitoring");
  eq("watchdog tick: enable called", calls.join(","), "enable");

  stoppedByUser = true;
  eq("watchdog tick: respects /stop", watchdog.tick(), "none");
  stoppedByUser = false;

  snapshot = makeWatchdogSnapshot({ lastActivityAt: NOW - 3_600_000 });
  eq("watchdog tick: restarts a wedged stream", watchdog.tick(), "restart-stream");
  eq("watchdog tick: restart called", calls.join(","), "enable,restart");

  // start()/stop() must be idempotent so a double call cannot leak a timer.
  watchdog.start();
  watchdog.start();
  watchdog.stop();
  watchdog.stop();
  check("watchdog lifecycle: start and stop are idempotent", true);
}

// ---------------------------------------------------------------------------
// Part 2 — server: verdict maps onto real HTTP, and live state is reflected
// ---------------------------------------------------------------------------

console.log("\n== HealthServer ==");

let clock = NOW;
let current = makeSnapshot();

const basePort = 45_000 + (process.pid % 10_000);
let server = null;
let port = 0;

for (let offset = 0; offset < 25 && server === null; offset += 1) {
  const candidate = new HealthServer({
    port: basePort + offset,
    host: "127.0.0.1",
    thresholds,
    readSnapshot: () => current,
    now: () => clock,
  });
  try {
    await candidate.start();
    server = candidate;
    port = basePort + offset;
  } catch (error) {
    if (error?.code !== "EADDRINUSE") {
      throw error;
    }
  }
}

if (server === null) {
  console.error("[FAIL] could not bind a free test port");
  process.exit(1);
}
check(`server binds a port (${port})`, server.isListening());

{
  const response = await httpRequest(port, "GET", "/health");
  const body = JSON.parse(response.body);
  eq("GET /health healthy -> 200", response.status, 200);
  eq("GET /health healthy -> status ok", body.status, "ok");
  eq("GET /health is json", String(response.headers["content-type"]).includes("application/json"), true);
  eq("GET /health is not cached", response.headers["cache-control"], "no-store");
  eq("GET /health reports liveness fields", typeof body.details.uptimeSeconds, "number");
  check(
    "GET /health body carries no credential-shaped field",
    !/"[A-Za-z0-9_]*(bot_?token|chat_?id|api_?key|secret|password)[A-Za-z0-9_]*"\s*:/i.test(
      response.body,
    ),
  );
}

{
  const response = await httpRequest(port, "GET", "/healthz");
  eq("GET /healthz alias -> 200", response.status, 200);
}

{
  const response = await httpRequest(port, "GET", "/health?verbose=1");
  eq("GET /health with query string -> 200", response.status, 200);
}

{
  const response = await httpRequest(port, "GET", "/");
  eq("GET / healthy -> 200", response.status, 200);
  check("GET / is a short text summary", response.body.startsWith("ok:"), response.body.trim());
}

{
  current = makeSnapshot({ monitoringEnabled: false, connectionState: "disconnected" });
  const response = await httpRequest(port, "GET", "/health");
  const body = JSON.parse(response.body);
  eq("GET /health with monitoring off -> 503", response.status, 503);
  eq("503 body says stopped", body.status, "stopped");
  eq("503 body is marked unhealthy", body.healthy, false);
  check("503 body explains itself", body.reasons.length > 0);
}

{
  const response = await httpRequest(port, "GET", "/");
  eq("GET / unhealthy -> 503", response.status, 503);
}

{
  current = makeSnapshot({ lastActivityAt: NOW - 10_000_000 });
  const response = await httpRequest(port, "GET", "/health");
  const body = JSON.parse(response.body);
  eq("GET /health on a wedged socket -> 503", response.status, 503);
  eq("wedged socket body says stale", body.status, "stale");
}

{
  // Recovery must be visible without restarting anything.
  current = makeSnapshot({ lastActivityAt: NOW });
  const response = await httpRequest(port, "GET", "/health");
  eq("GET /health recovers to 200 when the stream resumes", response.status, 200);
}

{
  const response = await httpRequest(port, "GET", "/nope");
  const body = JSON.parse(response.body);
  eq("GET /nope -> 404", response.status, 404);
  eq("404 body names the error", body.error, "not found");
}

{
  const response = await httpRequest(port, "POST", "/health");
  eq("POST /health -> 405", response.status, 405);
  eq("405 advertises allowed methods", response.headers["allow"], "GET, HEAD");
}

{
  const response = await httpRequest(port, "GET", "/health");
  check("HEAD handled without a body", response.body.length >= 0);
  const head = await httpRequest(port, "HEAD", "/health");
  eq("HEAD /health -> 200", head.status, 200);
  eq("HEAD /health sends no body", head.body, "");
  check(
    "HEAD /health still declares its length",
    Number(head.headers["content-length"]) > 0,
    `content-length=${head.headers["content-length"]}`,
  );
}

await server.stop();
check("server reports not listening after stop()", !server.isListening());

{
  let refused = false;
  try {
    await httpRequest(port, "GET", "/health");
  } catch {
    refused = true;
  }
  check("stop() releases the port", refused);
}

// ---------------------------------------------------------------------------
// Part 3 — config: no port is opened unless something asks for one
// ---------------------------------------------------------------------------

console.log("\n== config ==");

const ENV_KEYS = [
  "PORT",
  "HEALTH_PORT",
  "HEALTH_MAX_IDLE_SECONDS",
  "HEALTH_STARTUP_GRACE_SECONDS",
];

function loadConfigWith(values) {
  const saved = ENV_KEYS.map((key) => [key, process.env[key]]);
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(values)) {
    process.env[key] = value;
  }
  const config = loadConfig();
  for (const [key, value] of saved) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  return config;
}

process.env["TELEGRAM_BOT_TOKEN"] ??= "123:selftest";
process.env["TELEGRAM_CHAT_ID"] ??= "-1001234567890";

{
  const config = loadConfigWith({});
  eq("no PORT or HEALTH_PORT -> no listening port", config.healthPort, null);
  eq("default idle limit is 15 minutes", config.healthMaxIdleSeconds, 900);
  eq("default startup grace is 2 minutes", config.healthStartupGraceSeconds, 120);
}

eq("PORT alone is honoured", loadConfigWith({ PORT: "10000" }).healthPort, 10000);
eq(
  "HEALTH_PORT alone is honoured",
  loadConfigWith({ HEALTH_PORT: "8080" }).healthPort,
  8080,
);
eq(
  "PORT wins over HEALTH_PORT",
  loadConfigWith({ PORT: "10000", HEALTH_PORT: "8080" }).healthPort,
  10000,
);
eq("blank PORT opens nothing", loadConfigWith({ PORT: "   " }).healthPort, null);
eq("garbage PORT opens nothing", loadConfigWith({ PORT: "abc" }).healthPort, null);
eq(
  "out-of-range PORT opens nothing",
  loadConfigWith({ PORT: "70000" }).healthPort,
  null,
);
eq(
  "idle limit is configurable",
  loadConfigWith({ HEALTH_MAX_IDLE_SECONDS: "60" }).healthMaxIdleSeconds,
  60,
);
eq(
  "nonsense idle limit falls back",
  loadConfigWith({ HEALTH_MAX_IDLE_SECONDS: "soon" }).healthMaxIdleSeconds,
  900,
);
eq(
  "zero startup grace falls back",
  loadConfigWith({ HEALTH_STARTUP_GRACE_SECONDS: "0" }).healthStartupGraceSeconds,
  120,
);

// ---------------------------------------------------------------------------

console.log("");
if (failures.length > 0) {
  console.log(
    `[FAIL] ${failures.length} of ${passed + failures.length} health checks failed:`,
  );
  for (const failure of failures) {
    console.log(`       ${failure}`);
  }
  process.exit(1);
}

console.log(`[PASS] all ${passed} health checks passed`);
process.exit(0);
