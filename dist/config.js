import "dotenv/config";
function readBoolean(value) {
    if (value === undefined) {
        return false;
    }
    return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}
function requireEnv(name) {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}. Copy .env.example to .env and configure it.`);
    }
    return value;
}
function buildPumpPortalWsUrl(apiKey) {
    const baseUrl = "wss://pumpportal.fun/api/data";
    if (apiKey && apiKey.length > 0) {
        return `${baseUrl}?api-key=${encodeURIComponent(apiKey)}`;
    }
    return baseUrl;
}
export function loadConfig() {
    const pumpPortalApiKey = process.env["PUMPPORTAL_API_KEY"]?.trim() || undefined;
    const telegramBotToken = requireEnv("TELEGRAM_BOT_TOKEN");
    const telegramChatId = requireEnv("TELEGRAM_CHAT_ID");
    const autostartMonitoring = readBoolean(process.env["AUTOSTART_MONITORING"]);
    return {
        pumpPortalApiKey,
        telegramBotToken,
        telegramChatId,
        pumpPortalWsUrl: buildPumpPortalWsUrl(pumpPortalApiKey),
        autostartMonitoring,
    };
}
//# sourceMappingURL=config.js.map