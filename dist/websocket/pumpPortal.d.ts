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
    constructor(options: PumpPortalClientOptions);
    getConnectionState(): WebSocketConnectionState;
    isMonitoringEnabled(): boolean;
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