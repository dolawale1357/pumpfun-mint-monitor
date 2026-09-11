import "dotenv/config";

export interface AppConfig {
  pumpPortalApiKey: string | undefined;
  telegramBotToken: string;
  telegramChatId: string;
  pumpPortalWsUrl: string;
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

  return {
    pumpPortalApiKey,
    telegramBotToken,
    telegramChatId,
    pumpPortalWsUrl: buildPumpPortalWsUrl(pumpPortalApiKey),
  };
}
