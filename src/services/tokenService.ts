import type { MonitorStats, NewTokenEvent } from "../types/token.js";

const PUMP_FUN_TOTAL_SUPPLY = 1_000_000_000;

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function readFirstNumber(raw: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = readNumber(raw[key]);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function readTimestamp(value: unknown): number | undefined {
  const numeric = readNumber(value);
  if (numeric === undefined) {
    return undefined;
  }
  return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deriveMarketCapFromBondingCurve(
  vSolInBondingCurve: number | undefined,
  vTokensInBondingCurve: number | undefined,
): number | undefined {
  if (
    vSolInBondingCurve === undefined ||
    vTokensInBondingCurve === undefined ||
    vTokensInBondingCurve <= 0
  ) {
    return undefined;
  }

  return (vSolInBondingCurve / vTokensInBondingCurve) * PUMP_FUN_TOTAL_SUPPLY;
}

export function isTokenCreationPayload(payload: unknown): boolean {
  if (!isRecord(payload)) {
    return false;
  }

  const mint = readString(payload["mint"]);
  if (!mint) {
    return false;
  }

  if ("txType" in payload) {
    return payload["txType"] === "create";
  }

  return true;
}

export function normalizeTokenEvent(raw: unknown): NewTokenEvent | null {
  if (!isRecord(raw)) {
    return null;
  }

  const mint = readString(raw["mint"]);
  if (!mint) {
    return null;
  }

  const receivedAt = Date.now();

  const blockchainCreatedAt =
    readTimestamp(raw["timestamp"]) ??
    readTimestamp(raw["createdAt"]) ??
    readTimestamp(raw["blockTime"]) ??
    readTimestamp(raw["time"]);

  const event: NewTokenEvent = {
    mint,
    receivedAt,
    raw,
  };

  const name = readString(raw["name"]);
  const symbol = readString(raw["symbol"]);
  const description = readString(raw["description"]);
  const traderPublicKey =
    readString(raw["traderPublicKey"]) ?? readString(raw["creator"]);
  const bondingCurveKey = readString(raw["bondingCurveKey"]);
  const signature = readString(raw["signature"]);
  const pool = readString(raw["pool"]);

  const initialBuySol = readFirstNumber(raw, [
    "solAmount",
    "sol_amount",
    "initialBuySol",
    "initial_buy_sol",
  ]);

  const initialBuyTokens = readFirstNumber(raw, [
    "initialBuy",
    "initial_buy",
    "tokenAmount",
    "token_amount",
  ]);

  const vSolInBondingCurve = readFirstNumber(raw, [
    "vSolInBondingCurve",
    "v_sol_in_bonding_curve",
    "solInPool",
    "sol_in_pool",
  ]);

  const vTokensInBondingCurve = readFirstNumber(raw, [
    "vTokensInBondingCurve",
    "v_tokens_in_bonding_curve",
    "tokensInPool",
    "tokens_in_pool",
  ]);

  const marketCapFromApi = readFirstNumber(raw, [
    "marketCapSol",
    "market_cap_sol",
    "marketCap",
  ]);

  const marketCapSol =
    marketCapFromApi ??
    deriveMarketCapFromBondingCurve(vSolInBondingCurve, vTokensInBondingCurve);

  if (name !== undefined) event.name = name;
  if (symbol !== undefined) event.symbol = symbol;
  if (description !== undefined) event.description = description;
  if (traderPublicKey !== undefined) event.traderPublicKey = traderPublicKey;
  if (bondingCurveKey !== undefined) event.bondingCurveKey = bondingCurveKey;
  if (signature !== undefined) event.signature = signature;
  if (pool !== undefined) event.pool = pool;
  if (initialBuySol !== undefined) event.initialBuySol = initialBuySol;
  if (initialBuyTokens !== undefined) event.initialBuyTokens = initialBuyTokens;
  if (marketCapSol !== undefined) event.marketCapSol = marketCapSol;
  if (vSolInBondingCurve !== undefined) event.vSolInBondingCurve = vSolInBondingCurve;
  if (vTokensInBondingCurve !== undefined) {
    event.vTokensInBondingCurve = vTokensInBondingCurve;
  }
  if (blockchainCreatedAt !== undefined) {
    event.blockchainCreatedAt = blockchainCreatedAt;
  }

  return event;
}

/**
 * Upper bound on the in-memory dedupe cache. Without a cap the Set grows for
 * the whole lifetime of the process, which matters for a 24/7 deployment.
 * Entries are evicted in least-recently-seen order.
 */
const MAX_TRACKED_MINTS = 50_000;

export class TokenService {
  private readonly seenMints = new Set<string>();
  private totalTokensReceived = 0;
  private sessionStartedAt: number | null = null;
  private lastEventReceivedAt: number | null = null;
  private lastBlockchainCreatedAt: number | null = null;

  startSession(): void {
    if (this.sessionStartedAt !== null) {
      return;
    }

    // Counters are per-session so that /status rates describe the current run.
    // The dedupe cache is deliberately NOT cleared: resuming a session should
    // not re-alert mints that already fired before /stop.
    this.sessionStartedAt = Date.now();
    this.totalTokensReceived = 0;
    this.lastEventReceivedAt = null;
    this.lastBlockchainCreatedAt = null;
  }

  stopSession(): void {
    this.sessionStartedAt = null;
  }

  isDuplicate(mint: string): boolean {
    return this.seenMints.has(mint);
  }

  recordToken(event: NewTokenEvent): boolean {
    if (this.seenMints.has(event.mint)) {
      // Refresh recency so eviction approximates least-recently-seen.
      this.seenMints.delete(event.mint);
      this.seenMints.add(event.mint);
      return false;
    }

    this.seenMints.add(event.mint);
    if (this.seenMints.size > MAX_TRACKED_MINTS) {
      const oldest = this.seenMints.values().next().value;
      if (oldest !== undefined) {
        this.seenMints.delete(oldest);
      }
    }

    this.totalTokensReceived += 1;
    this.lastEventReceivedAt = event.receivedAt;
    if (event.blockchainCreatedAt !== undefined) {
      this.lastBlockchainCreatedAt = event.blockchainCreatedAt;
    }

    return true;
  }

  getStats(): MonitorStats {
    const now = Date.now();
    const sessionRuntimeMs =
      this.sessionStartedAt === null ? 0 : now - this.sessionStartedAt;

    const minutes = sessionRuntimeMs / 60_000;
    const tokensPerMinute =
      minutes > 0 ? this.totalTokensReceived / minutes : 0;

    return {
      totalTokensReceived: this.totalTokensReceived,
      tokensPerMinute,
      sessionRuntimeMs,
      lastEventReceivedAt: this.lastEventReceivedAt,
      lastBlockchainCreatedAt: this.lastBlockchainCreatedAt,
      seenMintCount: this.seenMints.size,
    };
  }
}
