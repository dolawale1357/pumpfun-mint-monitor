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
}
export declare function loadConfig(): AppConfig;
//# sourceMappingURL=config.d.ts.map