import type { WebSocketConnectionState } from "../types/token.js";
import { logger } from "../utils/logger.js";

/** Live state the supervisor judges. Read fresh on every tick. */
export interface WatchdogSnapshot {
  processStartedAt: number;
  monitoringEnabled: boolean;
  connectionState: WebSocketConnectionState;
  /** When `connectionState` last changed. */
  connectionStateSince: number;
  /** Last inbound frame on the current socket, or null if none has arrived. */
  lastActivityAt: number | null;
  /** When the current socket opened, or null while it never has. */
  connectedAt: number | null;
}

export type WatchdogAction = "none" | "enable-monitoring" | "restart-stream";

export interface WatchdogPolicy {
  /**
   * The operator sent /stop during this run. A human decision outranks the
   * supervisor, which then stands down until the next /start.
   */
  stoppedByUser: boolean;
  /** Grace period after boot before an unconnected socket counts as wedged. */
  startupGraceMs: number;
  /** Inbound silence on a connected socket before it is presumed wedged. */
  maxIdleMs: number;
}

/**
 * Decide whether a live monitor needs intervention.
 *
 * Kept separate from the timer so every reachable state can be tested. Three
 * failures happen in production, and the client's own reconnect does not fix
 * any of them, because in all three cases no `close` event ever fires:
 *
 *   1. monitoring off — a restart that did not get AUTOSTART_MONITORING, or a
 *      stop() from anywhere other than /stop. The process looks alive, the bot
 *      answers commands, and nothing is ever notified.
 *   2. a socket stuck connecting — `ws` has no connect timeout, so a handshake
 *      that never completes leaves the client in "connecting" indefinitely.
 *   3. a connected socket gone silent — the wedge that /health calls "stale".
 */
export function decideWatchdogAction(
  snapshot: WatchdogSnapshot,
  policy: WatchdogPolicy,
  now: number = Date.now(),
): WatchdogAction {
  if (policy.stoppedByUser) {
    return "none";
  }

  if (!snapshot.monitoringEnabled) {
    return "enable-monitoring";
  }

  // Deploys and cold starts need a moment before the stream is expected up.
  if (now - snapshot.processStartedAt < policy.startupGraceMs) {
    return "none";
  }

  if (snapshot.connectionState !== "connected") {
    const stuckFor = now - snapshot.connectionStateSince;
    return stuckFor > policy.startupGraceMs ? "restart-stream" : "none";
  }

  // A connected socket that has never delivered a frame is judged against the
  // grace period; one that has delivered frames is judged against the idle
  // limit. Either way, only a fresh socket clears it.
  const progressAt = snapshot.lastActivityAt ?? snapshot.connectedAt;
  const silentFor =
    progressAt === null ? now - snapshot.connectionStateSince : now - progressAt;

  return silentFor > policy.maxIdleMs ? "restart-stream" : "none";
}

export interface MonitorWatchdogOptions {
  startupGraceMs: number;
  maxIdleMs: number;
  readSnapshot: () => WatchdogSnapshot;
  isStoppedByUser: () => boolean;
  /** Resume monitoring: enable notifications, start the stream, start a session. */
  enableMonitoring: () => void;
  /** Drop the current socket and open a fresh one, keeping monitoring on. */
  restartStream: () => void;
  intervalMs?: number;
  now?: () => number;
}

const DEFAULT_INTERVAL_MS = 30_000;

/**
 * Periodic self-heal for a monitor that is running but not monitoring.
 *
 * Only ever constructed for deployments that asked for monitoring to start on
 * boot (`AUTOSTART_MONITORING=true`). A manual deployment keeps manual control:
 * with autostart off there is no watchdog, so `/stop` stays stopped.
 */
export class MonitorWatchdog {
  private readonly options: MonitorWatchdogOptions;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: MonitorWatchdogOptions) {
    this.options = options;
  }

  start(): void {
    if (this.timer !== null) {
      return;
    }

    const intervalMs = this.options.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.timer = setInterval(() => {
      this.tick();
    }, intervalMs);
    // Never hold the process open on its own; the bot and health server do that.
    this.timer.unref?.();
    logger.health(`Watchdog armed (every ${Math.round(intervalMs / 1000)}s)`);
  }

  stop(): void {
    if (this.timer === null) {
      return;
    }
    clearInterval(this.timer);
    this.timer = null;
    logger.health("Watchdog disarmed");
  }

  /** One evaluation. Public so tests can drive it without waiting on a timer. */
  tick(): WatchdogAction {
    const now = this.options.now?.() ?? Date.now();
    const snapshot = this.options.readSnapshot();
    const action = decideWatchdogAction(
      snapshot,
      {
        stoppedByUser: this.options.isStoppedByUser(),
        startupGraceMs: this.options.startupGraceMs,
        maxIdleMs: this.options.maxIdleMs,
      },
      now,
    );

    if (action === "enable-monitoring") {
      logger.healthWarn(
        "Monitoring was off while autostart is enabled — starting it again",
      );
      this.options.enableMonitoring();
    } else if (action === "restart-stream") {
      const progressAt = snapshot.lastActivityAt ?? snapshot.connectedAt;
      const silentFor =
        progressAt === null
          ? Math.round((now - snapshot.connectionStateSince) / 1000)
          : Math.round((now - progressAt) / 1000);
      logger.healthWarn(
        `Stream ${snapshot.connectionState} and quiet for ${silentFor}s — forcing a fresh connection`,
      );
      this.options.restartStream();
    }

    return action;
  }
}
