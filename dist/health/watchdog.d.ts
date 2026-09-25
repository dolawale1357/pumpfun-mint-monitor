import type { WebSocketConnectionState } from "../types/token.js";
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
export declare function decideWatchdogAction(snapshot: WatchdogSnapshot, policy: WatchdogPolicy, now?: number): WatchdogAction;
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
/**
 * Periodic self-heal for a monitor that is running but not monitoring.
 *
 * Only ever constructed for deployments that asked for monitoring to start on
 * boot (`AUTOSTART_MONITORING=true`). A manual deployment keeps manual control:
 * with autostart off there is no watchdog, so `/stop` stays stopped.
 */
export declare class MonitorWatchdog {
    private readonly options;
    private timer;
    constructor(options: MonitorWatchdogOptions);
    start(): void;
    stop(): void;
    /** One evaluation. Public so tests can drive it without waiting on a timer. */
    tick(): WatchdogAction;
}
//# sourceMappingURL=watchdog.d.ts.map