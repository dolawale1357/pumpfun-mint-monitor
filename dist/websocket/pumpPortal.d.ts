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
    private monitoringEnabled;
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
    isMonitoringEnabled(): boolean;
    /** Last inbound message or ping frame, or null if nothing has arrived yet. */
    getLastActivityAt(): number | null;
    /** When the current connection opened, or null while not connected. */
    getConnectedAt(): number | null;
    start(): void;
    stop(): void;
    private connect;
    private subscribeNewToken;
    private handleMessage;
    private scheduleReconnect;
    private clearReconnectTimer;
    private closeSocket;
    private setConnectionState;
}
//# sourceMappingURL=pumpPortal.d.ts.map