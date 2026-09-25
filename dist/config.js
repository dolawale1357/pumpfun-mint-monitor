import "dotenv/config";
function readBoolean(value) {
    if (value === undefined) {
        return false;
    }
    return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}
function readPositiveInt(value, fallback) {
    if (value === undefined) {
        return fallback;
    }
    const parsed = Number(value.trim());
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }
    return Math.floor(parsed);
}
function readPort(value) {
    if (value === undefined) {
        return null;
    }
    const parsed = Number(value.trim());
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
        return null;
    }
    return parsed;
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
    // Render injects PORT automatically. HEALTH_PORT lets other hosts opt in
    // without colliding with anything a panel sets.
    const healthPort = readPort(process.env["PORT"]) ?? readPort(process.env["HEALTH_PORT"]);
    const healthMaxIdleSeconds = readPositiveInt(process.env["HEALTH_MAX_IDLE_SECONDS"], 900);
    const healthStartupGraceSeconds = readPositiveInt(process.env["HEALTH_STARTUP_GRACE_SECONDS"], 120);
    return {
        pumpPortalApiKey,
        telegramBotToken,
        telegramChatId,
        pumpPortalWsUrl: buildPumpPortalWsUrl(pumpPortalApiKey),
        autostartMonitoring,
        healthPort,
        healthMaxIdleSeconds,
        healthStartupGraceSeconds,
    };
}
//# sourceMappingURL=config.js.map