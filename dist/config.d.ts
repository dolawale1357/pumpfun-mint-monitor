import "dotenv/config";
export interface AppConfig {
    pumpPortalApiKey: string | undefined;
    telegramBotToken: string;
    telegramChatId: string;
    pumpPortalWsUrl: string;
}
export declare function loadConfig(): AppConfig;
//# sourceMappingURL=config.d.ts.map