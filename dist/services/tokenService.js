const PUMP_FUN_TOTAL_SUPPLY = 1_000_000_000;
function readString(value) {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}
function readNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
}
function readFirstNumber(raw, keys) {
    for (const key of keys) {
        const value = readNumber(raw[key]);
        if (value !== undefined) {
            return value;
        }
    }
    return undefined;
}
function readTimestamp(value) {
    const numeric = readNumber(value);
    if (numeric === undefined) {
        return undefined;
    }
    return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function deriveMarketCapFromBondingCurve(vSolInBondingCurve, vTokensInBondingCurve) {
    if (vSolInBondingCurve === undefined ||
        vTokensInBondingCurve === undefined ||
        vTokensInBondingCurve <= 0) {
        return undefined;
    }
    return (vSolInBondingCurve / vTokensInBondingCurve) * PUMP_FUN_TOTAL_SUPPLY;
}
export function isTokenCreationPayload(payload) {
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
export function normalizeTokenEvent(raw) {
    if (!isRecord(raw)) {
        return null;
    }
    const mint = readString(raw["mint"]);
    if (!mint) {
        return null;
    }
    const receivedAt = Date.now();
    const blockchainCreatedAt = readTimestamp(raw["timestamp"]) ??
        readTimestamp(raw["createdAt"]) ??
        readTimestamp(raw["blockTime"]) ??
        readTimestamp(raw["time"]);
    const event = {
        mint,
        receivedAt,
        raw,
    };
    const name = readString(raw["name"]);
    const symbol = readString(raw["symbol"]);
    const description = readString(raw["description"]);
    const traderPublicKey = readString(raw["traderPublicKey"]) ?? readString(raw["creator"]);
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
    const marketCapSol = marketCapFromApi ??
        deriveMarketCapFromBondingCurve(vSolInBondingCurve, vTokensInBondingCurve);
    if (name !== undefined)
        event.name = name;
    if (symbol !== undefined)
        event.symbol = symbol;
    if (description !== undefined)
        event.description = description;
    if (traderPublicKey !== undefined)
        event.traderPublicKey = traderPublicKey;
    if (bondingCurveKey !== undefined)
        event.bondingCurveKey = bondingCurveKey;
    if (signature !== undefined)
        event.signature = signature;
    if (pool !== undefined)
        event.pool = pool;
    if (initialBuySol !== undefined)
        event.initialBuySol = initialBuySol;
    if (initialBuyTokens !== undefined)
        event.initialBuyTokens = initialBuyTokens;
    if (marketCapSol !== undefined)
        event.marketCapSol = marketCapSol;
    if (vSolInBondingCurve !== undefined)
        event.vSolInBondingCurve = vSolInBondingCurve;
    if (vTokensInBondingCurve !== undefined) {
        event.vTokensInBondingCurve = vTokensInBondingCurve;
    }
    if (blockchainCreatedAt !== undefined) {
        event.blockchainCreatedAt = blockchainCreatedAt;
    }
    return event;
}
export class TokenService {
    seenMints = new Set();
    totalTokensReceived = 0;
    sessionStartedAt = null;
    lastEventReceivedAt = null;
    lastBlockchainCreatedAt = null;
    startSession() {
        if (this.sessionStartedAt === null) {
            this.sessionStartedAt = Date.now();
        }
    }
    stopSession() {
        this.sessionStartedAt = null;
    }
    isDuplicate(mint) {
        return this.seenMints.has(mint);
    }
    recordToken(event) {
        if (this.seenMints.has(event.mint)) {
            return false;
        }
        this.seenMints.add(event.mint);
        this.totalTokensReceived += 1;
        this.lastEventReceivedAt = event.receivedAt;
        if (event.blockchainCreatedAt !== undefined) {
            this.lastBlockchainCreatedAt = event.blockchainCreatedAt;
        }
        return true;
    }
    getStats() {
        const now = Date.now();
        const sessionRuntimeMs = this.sessionStartedAt === null ? 0 : now - this.sessionStartedAt;
        const minutes = sessionRuntimeMs / 60_000;
        const tokensPerMinute = minutes > 0 ? this.totalTokensReceived / minutes : 0;
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
//# sourceMappingURL=tokenService.js.map