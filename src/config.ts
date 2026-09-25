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

function readBoolean(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function requireEnv(name: "TELEGRAM_BOT_TOKEN" | "TELEGRAM_CHAT_ID"): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env and configure it.`,
    );
  }
  return value;
}

function buildPumpPortalWsUrl(apiKey: string | undefined): string {
  const baseUrl = "wss://pumpportal.fun/api/data";
  if (apiKey && apiKey.length > 0) {
    return `${baseUrl}?api-key=${encodeURIComponent(apiKey)}`;
  }
  return baseUrl;
}

export function loadConfig(): AppConfig {
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
