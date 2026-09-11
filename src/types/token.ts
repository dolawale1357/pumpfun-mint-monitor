export interface NewTokenEvent {
  mint: string;
  name?: string;
  symbol?: string;
  description?: string;
  traderPublicKey?: string;
  bondingCurveKey?: string;
  signature?: string;
  marketCapSol?: number;
  /** SOL spent by creator on the initial buy (`solAmount` from PumpPortal) */
  initialBuySol?: number;
  /** Token amount bought on create (`initialBuy` from PumpPortal — not SOL) */
  initialBuyTokens?: number;
  vSolInBondingCurve?: number;
  vTokensInBondingCurve?: number;
  pool?: string;
  /** Local receive timestamp (Date.now()) — not blockchain creation time */
  receivedAt: number;
  /** Blockchain/creation timestamp from payload, if present */
  blockchainCreatedAt?: number;
  raw: unknown;
}

export type WebSocketConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

export interface MonitorStats {
  totalTokensReceived: number;
  tokensPerMinute: number;
  sessionRuntimeMs: number;
  lastEventReceivedAt: number | null;
  lastBlockchainCreatedAt: number | null;
  seenMintCount: number;
}
