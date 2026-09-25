import type { NewTokenEvent, WebSocketConnectionState } from "../types/token.js";
export interface PumpPortalClientOptions {
    wsUrl: string;
    onToken: (event: NewTokenEvent) => void;
    onConnectionStateChange?: (state: WebSocketConnectionState) => void;
}
export declare class PumpPortalClient {
    private readonly wsUrl;
    private readonly onToken;
    private readonly onConnectionStateChange;
    private ws;
    private connectionState;
    /** When connectionState last changed, so a stuck "connecting" is detectable. */
    private connectionStateSince;
    private monitoringEnabled;
    /** True once the operator has sent /stop in this run. */
    private stoppedByUser;
    private reconnectAttempts;
    private reconnectTimer;
    private intentionalClose;
    /**
     * Timestamp of the last inbound socket activity (message or ping frame).
     * A socket can stay "connected" while silently wedged, so health checks
     * need this rather than readyState alone.
     */
    private lastActivityAt;
    /** When the current connection opened, or null while not connected. */
    private connectedAt;
    constructor(options: PumpPortalClientOptions);
    getConnectionState(): WebSocketConnectionState;
    /** When getConnectionState() last changed. */
    getConnectionStateSince(): number;
    isMonitoringEnabled(): boolean;
    /**
     * True when the operator turned monitoring off with /stop. The watchdog uses
     * this to stand down rather than fight a human decision.
     */
    isStoppedByUser(): boolean;
    /** Last inbound message or ping frame, or null if nothing has arrived yet. */
    getLastActivityAt(): number | null;
    /** When the current connection opened, or null while not connected. */
    getConnectedAt(): number | null;
    start(): void;
    /** Operator-initiated stop (/stop). The watchdog stands down for this run. */
    stopByUser(): void;
    stop(): void;
    /**
     * Drop the current socket and open a fresh one, keeping monitoring on. Used
     * by the watchdog: a socket that is wedged, or stuck mid-handshake, will
     * never emit `close`, so the reconnect has to be driven from outside.
     */
    restart(): void;
    private connect;
    private subscribeNewToken;
    private handleMessage;
    private scheduleReconnect;
    private clearReconnectTimer;
    private closeSocket;
    private setConnectionState;
}
//# sourceMappingURL=pumpPortal.d.ts.map