function toSeconds(ms) {
    return Math.max(0, Math.floor(ms / 1000));
}
function buildReport(healthy, status, reasons, details) {
    return { healthy, status, reasons, details };
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
export function evaluateHealth(snapshot, thresholds, now = Date.now()) {
    const uptimeSeconds = toSeconds(now - snapshot.processStartedAt);
    const secondsSinceActivity = snapshot.lastActivityAt === null
        ? null
        : toSeconds(now - snapshot.lastActivityAt);
    // Prefer real inbound traffic; fall back to connection time so a socket that
    // connected but never delivered anything still eventually counts as stale.
    const progressAt = snapshot.lastActivityAt ?? snapshot.connectedAt;
    const secondsSinceProgress = progressAt === null ? null : toSeconds(now - progressAt);
    const details = {
        uptimeSeconds,
        monitoringEnabled: snapshot.monitoringEnabled,
        connectionState: snapshot.connectionState,
        secondsSinceActivity,
        secondsSinceProgress,
        maxIdleSeconds: toSeconds(thresholds.maxIdleMs),
        tokensReceived: snapshot.stats.totalTokensReceived,
        tokensPerMinute: Number(snapshot.stats.tokensPerMinute.toFixed(2)),
        lastTokenAt: snapshot.stats.lastEventReceivedAt === null
            ? null
            : new Date(snapshot.stats.lastEventReceivedAt).toISOString(),
        trackedMints: snapshot.stats.seenMintCount,
        notificationsEnabled: snapshot.notificationsEnabled,
        pendingNotifications: snapshot.pendingNotifications,
        sentNotifications: snapshot.sentNotifications,
        failedNotifications: snapshot.failedNotifications,
        stoppedByUser: snapshot.stoppedByUser,
    };
    if (!snapshot.monitoringEnabled) {
        return buildReport(false, "stopped", [
            snapshot.stoppedByUser
                ? "monitoring is stopped: /stop was sent in this run, so the watchdog is standing down. Send /start to resume"
                : "monitoring is not running: send /start, or set AUTOSTART_MONITORING=true so it starts on boot",
        ], details);
    }
    if (snapshot.connectionState !== "connected") {
        const withinStartupGrace = now - snapshot.processStartedAt < thresholds.startupGraceMs;
        if (withinStartupGrace) {
            // Deploys and cold starts need a moment before the stream is up.
            return buildReport(true, "starting", [], details);
        }
        return buildReport(false, "degraded", [
            `stream socket is ${snapshot.connectionState}, not connected`,
        ], details);
    }
    if (secondsSinceProgress !== null &&
        secondsSinceProgress * 1000 > thresholds.maxIdleMs) {
        const detail = snapshot.lastActivityAt === null
            ? "has never delivered a message"
            : `has received nothing for ${secondsSinceProgress}s`;
        return buildReport(false, "stale", [
            `stream socket reports connected but ${detail} (limit ${details.maxIdleSeconds}s)`,
        ], details);
    }
    return buildReport(true, "ok", [], details);
}
//# sourceMappingURL=healthChecker.js.map