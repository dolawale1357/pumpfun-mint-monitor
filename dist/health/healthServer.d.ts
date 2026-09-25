import { type HealthSnapshot, type HealthThresholds } from "./healthChecker.js";
export interface HealthServerOptions {
    port: number;
    host?: string;
    thresholds: HealthThresholds;
    /** Read live state per request so the report is never stale. */
    readSnapshot: () => HealthSnapshot;
    now?: () => number;
}
/**
 * Minimal HTTP endpoint used to answer "is the bot actually working?".
 *
 * Deliberately built on `node:http` rather than Express: this is one route,
 * and a framework would add dependencies to an install that has to survive on
 * a 256 MB container and a cold-starting free instance.
 *
 * It exposes no secrets. The bot token and chat id are never referenced here.
 */
export declare class HealthServer {
    private readonly options;
    private server;
    constructor(options: HealthServerOptions);
    isListening(): boolean;
    start(): Promise<void>;
    stop(): Promise<void>;
    private buildReport;
    private handleRequest;
    private sendJson;
    private sendText;
}
//# sourceMappingURL=healthServer.d.ts.map