import "dotenv/config";
export interface AppConfig {
    pumpPortalApiKey: string | undefined;
    telegramBotToken: string;
    telegramChatId: string;
    pumpPortalWsUrl: string;
    /**
     * When true, monitoring starts as soon as the process boots instead of
     * waiting for /start. Useful on hosts that restart the app unattended,
     * where nobody is around to send /start.
     */
    autostartMonitoring: boolean;
    /**
     * Port for the HTTP health endpoint. `null` disables the server entirely, so
     * hosts that do not need it keep the original "no listening port" property.
     * Render injects `PORT` on its own; elsewhere set `HEALTH_PORT` to opt in.
     */
    healthPort: number | null;
    /** Inbound socket silence, in seconds, after which health reports unhealthy. */
    healthMaxIdleSeconds: number;
    /** Grace period after boot before a not-yet-connected socket counts as a fault. */
    healthStartupGraceSeconds: number;
}
export declare function loadConfig(): AppConfig;
//# sourceMappingURL=config.d.ts.map