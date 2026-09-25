import type { MonitorStats, WebSocketConnectionState } from "../types/token.js";
export type HealthStatus = "ok" | "starting" | "degraded" | "stale" | "stopped";
export interface HealthThresholds {
    /** How long after boot an unconnected socket is tolerated (deploy spin-up). */
    startupGraceMs: number;
    /** Inbound socket silence after which a connected socket is presumed wedged. */
    maxIdleMs: number;
}
export interface HealthSnapshot {
    processStartedAt: number;
    monitoringEnabled: boolean;
    connectionState: WebSocketConnectionState;
    /** Last inbound message or ping frame, or null if none has arrived. */
    lastActivityAt: number | null;
    /** When the current connection opened, or null while disconnected. */
    connectedAt: number | null;
    stats: MonitorStats;
    notificationsEnabled: boolean;
    pendingNotifications: number;
    sentNotifications: number;
    failedNotifications: number;
    /** True when the operator sent /stop during this run. */
    stoppedByUser: boolean;
}
export interface HealthDetails {
    uptimeSeconds: number;
    monitoringEnabled: boolean;
    connectionState: WebSocketConnectionState;
    secondsSinceActivity: number | null;
    secondsSinceProgress: number | null;
    maxIdleSeconds: number;
    tokensReceived: number;
    tokensPerMinute: number;
    lastTokenAt: string | null;
    trackedMints: number;
    notificationsEnabled: boolean;
    pendingNotifications: number;
    sentNotifications: number;
    failedNotifications: number;
    /** Monitoring is off because /stop was sent, not because it failed. */
    stoppedByUser: boolean;
}
export interface HealthReport {
    healthy: boolean;
    status: HealthStatus;
    /** Human-readable explanations. Empty when healthy. */
    reasons: string[];
    details: HealthDetails;
}
/**
 * Decide whether the monitor is genuinely working, not merely running.
 *
 * A health endpoint that only proves "the HTTP server answered" is worse than
 * useless on a hosted deployment: the container stays green while the bot is
 * silent. So this returns unhealthy when monitoring is switched off, when the
 * stream socket is not connected, and when a connected socket has gone quiet
 * for longer than `maxIdleMs`, which is the silent-wedge case that no `close`
 * event will ever report.
 */
export declare function evaluateHealth(snapshot: HealthSnapshot, thresholds: HealthThresholds, now?: number): HealthReport;
//# sourceMappingURL=healthChecker.d.ts.map