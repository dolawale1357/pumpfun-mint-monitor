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
    monitoringEnabled = false;
    reconnectAttempts = 0;
    reconnectTimer = null;
    intentionalClose = false;
    constructor(options) {
        this.wsUrl = options.wsUrl;
        this.onToken = options.onToken;
        this.onConnectionStateChange = options.onConnectionStateChange;
    }
    getConnectionState() {
        return this.connectionState;
    }
    isMonitoringEnabled() {
        return this.monitoringEnabled;
    }
    start() {
        if (this.monitoringEnabled && this.ws && this.ws.readyState === WebSocket.OPEN) {
            logger.ws("Already connected — skipping duplicate start");
            return;
        }
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
    stop() {
        this.monitoringEnabled = false;
        this.intentionalClose = true;
        this.reconnectAttempts = 0;
        this.clearReconnectTimer();
        this.closeSocket();
        this.setConnectionState("disconnected");
        logger.ws("Monitoring stopped");
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
            this.setConnectionState("connected");
            logger.ws("Connected");
            this.subscribeNewToken();
        });
        ws.on("message", (data) => {
            if (this.ws !== ws) {
                return;
            }
            this.handleMessage(data);
        });
        ws.on("error", (error) => {
            logger.wsError(`WebSocket error: ${error.message}`);
        });
        ws.on("close", (code, reason) => {
            if (this.ws !== ws) {
                return;
            }
            this.ws = null;
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
        this.connectionState = state;
        this.onConnectionStateChange?.(state);
    }
}
//# sourceMappingURL=pumpPortal.js.map