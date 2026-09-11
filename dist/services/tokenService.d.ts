import type { MonitorStats, NewTokenEvent } from "../types/token.js";
export declare function isTokenCreationPayload(payload: unknown): boolean;
export declare function normalizeTokenEvent(raw: unknown): NewTokenEvent | null;
export declare class TokenService {
    private readonly seenMints;
    private totalTokensReceived;
    private sessionStartedAt;
    private lastEventReceivedAt;
    private lastBlockchainCreatedAt;
    startSession(): void;
    stopSession(): void;
    isDuplicate(mint: string): boolean;
    recordToken(event: NewTokenEvent): boolean;
    getStats(): MonitorStats;
}
//# sourceMappingURL=tokenService.d.ts.map