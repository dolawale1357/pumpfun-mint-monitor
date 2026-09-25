import WebSocket from "ws";
import { isTokenCreationPayload, normalizeTokenEvent, } from "../services/tokenService.js";
import { logger } from "../utils/logger.js";
const INITIAL_RECONNECT_DELAY_MS = 3_000;
const MAX_RECONNECT_DELAY_MS = 60_000;
export class PumpPortalClient {
    wsUrl;
    onToken;
    onConnectionStateChange;
    ws = null;
    connectionState = "disconnected";
    /** When connectionState last changed, so a stuck "connecting" is detectable. */
    connectionStateSince = Date.now();
    monitoringEnabled = false;
    /** True once the operator has sent /stop in this run. */
    stoppedByUser = false;
    reconnectAttempts = 0;
    reconnectTimer = null;
    intentionalClose = false;
    /**
     * Timestamp of the last inbound socket activity (message or ping frame).
     * A socket can stay "connected" while silently wedged, so health checks
     * need this rather than readyState alone.
     */
    lastActivityAt = null;
    /** When the current connection opened, or null while not connected. */
    connectedAt = null;
    constructor(options) {
        this.wsUrl = options.wsUrl;
        this.onToken = options.onToken;
        this.onConnectionStateChange = options.onConnectionStateChange;
    }
    getConnectionState() {
        return this.connectionState;
    }
    /** When getConnectionState() last changed. */
    getConnectionStateSince() {
        return this.connectionStateSince;
    }
    isMonitoringEnabled() {
        return this.monitoringEnabled;
    }
    /**
     * True when the operator turned monitoring off with /stop. The watchdog uses
     * this to stand down rather than fight a human decision.
     */
    isStoppedByUser() {
        return this.stoppedByUser;
    }
    /** Last inbound message or ping frame, or null if nothing has arrived yet. */
    getLastActivityAt() {
        return this.lastActivityAt;
    }
    /** When the current connection opened, or null while not connected. */
    getConnectedAt() {
        return this.connectedAt;
    }
    start() {
        if (this.monitoringEnabled && this.ws && this.ws.readyState === WebSocket.OPEN) {
            logger.ws("Already connected — skipping duplicate start");
            return;
        }
        // /start is the operator asking for monitoring, so the watchdog is free to
        // step in again if the stream later wedges.
        this.stoppedByUser = false;
        this.monitoringEnabled = true;
        this.intentionalClose = false;
        this.clearReconnectTimer();
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.subscribeNewToken();
            return;
        }
        if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
            logger.ws("Connection already in progress");
            return;
        }
        this.connect();
    }
    /** Operator-initiated stop (/stop). The watchdog stands down for this run. */
    stopByUser() {
        this.stop();
        this.stoppedByUser = true;
    }
    stop() {
        this.monitoringEnabled = false;
        this.intentionalClose = true;
        this.reconnectAttempts = 0;
        this.connectedAt = null;
        this.lastActivityAt = null;
        this.clearReconnectTimer();
        this.closeSocket();
        this.setConnectionState("disconnected");
        logger.ws("Monitoring stopped");
    }
    /**
     * Drop the current socket and open a fresh one, keeping monitoring on. Used
     * by the watchdog: a socket that is wedged, or stuck mid-handshake, will
     * never emit `close`, so the reconnect has to be driven from outside.
     */
    restart() {
        this.reconnectAttempts = 0;
        this.clearReconnectTimer();
        this.closeSocket();
        this.setConnectionState("disconnected");
        this.monitoringEnabled = true;
        this.intentionalClose = false;
        // Frames from the retired socket must not count as progress on the new one.
        this.lastActivityAt = null;
        this.connectedAt = null;
        this.connect();
    }
    connect() {
        if (!this.monitoringEnabled) {
            return;
        }
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            return;
        }
        this.setConnectionState(this.reconnectAttempts > 0 ? "reconnecting" : "connecting");
        logger.ws(this.reconnectAttempts > 0
            ? `Reconnecting (attempt ${this.reconnectAttempts + 1})...`
            : "Connecting...");
        const ws = new WebSocket(this.wsUrl);
        this.ws = ws;
        ws.on("open", () => {
            if (this.ws !== ws || !this.monitoringEnabled) {
                ws.close();
                return;
            }
            this.reconnectAttempts = 0;
            // Activity is per connection: a new socket starts with no frames, so the
            // health check must not judge it on the previous socket's last message.
            this.lastActivityAt = null;
            this.connectedAt = Date.now();
            this.setConnectionState("connected");
            logger.ws("Connected");
            this.subscribeNewToken();
        });
        ws.on("message", (data) => {
            if (this.ws !== ws) {
                return;
            }
            this.lastActivityAt = Date.now();
            this.handleMessage(data);
        });
        ws.on("ping", () => {
            if (this.ws !== ws) {
                return;
            }
            // Server pings prove the socket is alive even when no token events are
            // arriving, so they count as activity and stop the health check flapping.
            this.lastActivityAt = Date.now();
        });
        ws.on("error", (error) => {
            if (this.intentionalClose || this.ws !== ws) {
                // stop() closing a socket that is still connecting surfaces here as
                // "closed before the connection was established". That is an expected
                // side effect of shutting down, not something to alarm anyone about.
                return;
            }
            logger.wsError(`WebSocket error: ${error.message}`);
        });
        ws.on("close", (code, reason) => {
            if (this.ws !== ws) {
                return;
            }
            this.ws = null;
            this.connectedAt = null;
            const reasonText = reason.toString();
            logger.ws(`Disconnected${code ? ` (code=${code}${reasonText ? `, reason=${reasonText}` : ""})` : ""}`);
            this.setConnectionState("disconnected");
            if (this.monitoringEnabled && !this.intentionalClose) {
                this.scheduleReconnect();
            }
        });
    }
    subscribeNewToken() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return;
        }
        const payload = { method: "subscribeNewToken" };
        this.ws.send(JSON.stringify(payload));
        logger.ws("Subscribed to new token stream");
    }
    handleMessage(data) {
        let parsed;
        try {
            const text = typeof data === "string" ? data : data.toString("utf8");
            parsed = JSON.parse(text);
        }
        catch {
            logger.wsWarn("Ignoring malformed JSON message");
            return;
        }
        if (!isTokenCreationPayload(parsed)) {
            return;
        }
        const event = normalizeTokenEvent(parsed);
        if (!event) {
            logger.wsWarn("Ignoring token payload without mint");
            return;
        }
        this.onToken(event);
    }
    scheduleReconnect() {
        if (!this.monitoringEnabled || this.reconnectTimer !== null) {
            return;
        }
        const delay = Math.min(INITIAL_RECONNECT_DELAY_MS * 2 ** this.reconnectAttempts, MAX_RECONNECT_DELAY_MS);
        this.reconnectAttempts += 1;
        logger.ws(`Reconnecting in ${Math.round(delay / 1000)}s...`);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (this.monitoringEnabled && !this.intentionalClose) {
                this.connect();
            }
        }, delay);
    }
    clearReconnectTimer() {
        if (this.reconnectTimer !== null) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }
    closeSocket() {
        if (!this.ws) {
            return;
        }
        const ws = this.ws;
        this.ws = null;
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close(1000, "Monitoring stopped");
        }
    }
    setConnectionState(state) {
        if (state !== this.connectionState) {
            this.connectionStateSince = Date.now();
        }
        this.connectionState = state;
        this.onConnectionStateChange?.(state);
    }
}
//# sourceMappingURL=pumpPortal.js.map