import WebSocket from "ws";
import {
  isTokenCreationPayload,
  normalizeTokenEvent,
} from "../services/tokenService.js";
import type { NewTokenEvent, WebSocketConnectionState } from "../types/token.js";
import { logger } from "../utils/logger.js";

const INITIAL_RECONNECT_DELAY_MS = 3_000;
const MAX_RECONNECT_DELAY_MS = 60_000;

export interface PumpPortalClientOptions {
  wsUrl: string;
  onToken: (event: NewTokenEvent) => void;
  onConnectionStateChange?: (state: WebSocketConnectionState) => void;
}

export class PumpPortalClient {
  private readonly wsUrl: string;
  private readonly onToken: (event: NewTokenEvent) => void;
  private readonly onConnectionStateChange: ((state: WebSocketConnectionState) => void) | undefined;

  private ws: WebSocket | null = null;
  private connectionState: WebSocketConnectionState = "disconnected";
  private monitoringEnabled = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;
  /**
   * Timestamp of the last inbound socket activity (message or ping frame).
   * A socket can stay "connected" while silently wedged, so health checks
   * need this rather than readyState alone.
   */
  private lastActivityAt: number | null = null;
  /** When the current connection opened, or null while not connected. */
  private connectedAt: number | null = null;

  constructor(options: PumpPortalClientOptions) {
    this.wsUrl = options.wsUrl;
    this.onToken = options.onToken;
    this.onConnectionStateChange = options.onConnectionStateChange;
  }

  getConnectionState(): WebSocketConnectionState {
    return this.connectionState;
  }

  isMonitoringEnabled(): boolean {
    return this.monitoringEnabled;
  }

  /** Last inbound message or ping frame, or null if nothing has arrived yet. */
  getLastActivityAt(): number | null {
    return this.lastActivityAt;
  }

  /** When the current connection opened, or null while not connected. */
  getConnectedAt(): number | null {
    return this.connectedAt;
  }

  start(): void {
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

  stop(): void {
    this.monitoringEnabled = false;
    this.intentionalClose = true;
    this.reconnectAttempts = 0;
    this.connectedAt = null;
    this.clearReconnectTimer();
    this.closeSocket();
    this.setConnectionState("disconnected");
    logger.ws("Monitoring stopped");
  }

  private connect(): void {
    if (!this.monitoringEnabled) {
      return;
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.setConnectionState(this.reconnectAttempts > 0 ? "reconnecting" : "connecting");
    logger.ws(
      this.reconnectAttempts > 0
        ? `Reconnecting (attempt ${this.reconnectAttempts + 1})...`
        : "Connecting...",
    );

    const ws = new WebSocket(this.wsUrl);
    this.ws = ws;

    ws.on("open", () => {
      if (this.ws !== ws || !this.monitoringEnabled) {
        ws.close();
        return;
      }

      this.reconnectAttempts = 0;
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
      logger.ws(
        `Disconnected${code ? ` (code=${code}${reasonText ? `, reason=${reasonText}` : ""})` : ""}`,
      );
      this.setConnectionState("disconnected");

      if (this.monitoringEnabled && !this.intentionalClose) {
        this.scheduleReconnect();
      }
    });
  }

  private subscribeNewToken(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const payload = { method: "subscribeNewToken" };
    this.ws.send(JSON.stringify(payload));
    logger.ws("Subscribed to new token stream");
  }

  private handleMessage(data: WebSocket.RawData): void {
    let parsed: unknown;

    try {
      const text = typeof data === "string" ? data : data.toString("utf8");
      parsed = JSON.parse(text);
    } catch {
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

  private scheduleReconnect(): void {
    if (!this.monitoringEnabled || this.reconnectTimer !== null) {
      return;
    }

    const delay = Math.min(
      INITIAL_RECONNECT_DELAY_MS * 2 ** this.reconnectAttempts,
      MAX_RECONNECT_DELAY_MS,
    );

    this.reconnectAttempts += 1;
    logger.ws(`Reconnecting in ${Math.round(delay / 1000)}s...`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.monitoringEnabled && !this.intentionalClose) {
        this.connect();
      }
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private closeSocket(): void {
    if (!this.ws) {
      return;
    }

    const ws = this.ws;
    this.ws = null;

    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close(1000, "Monitoring stopped");
    }
  }

  private setConnectionState(state: WebSocketConnectionState): void {
    this.connectionState = state;
    this.onConnectionStateChange?.(state);
  }
}
