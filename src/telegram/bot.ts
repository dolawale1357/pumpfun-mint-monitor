import { Bot } from "grammy";
import type { AppConfig } from "../config.js";
import type { PumpPortalClient } from "../websocket/pumpPortal.js";
import type { TokenService } from "../services/tokenService.js";
import { logger } from "../utils/logger.js";
import { escapeHtmlForTelegram } from "./messages.js";
import type { TelegramNotificationQueue } from "./outboundQueue.js";

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function formatIsoTimestamp(timestamp: number | null): string {
  if (timestamp === null) {
    return "N/A";
  }
  return new Date(timestamp).toISOString();
}

export interface TelegramBotContext {
  config: AppConfig;
  pumpPortalClient: PumpPortalClient;
  tokenService: TokenService;
  notificationQueue: TelegramNotificationQueue;
}

export function registerTelegramCommands(bot: Bot, context: TelegramBotContext): void {
  const { config, pumpPortalClient, tokenService, notificationQueue } = context;

  const isAuthorized = (chatId: number | undefined): boolean => {
    if (chatId === undefined) {
      return false;
    }
    return String(chatId) === config.telegramChatId;
  };

  bot.command("start", async (ctx) => {
    if (!isAuthorized(ctx.chat?.id)) {
      logger.telegramWarn(`Ignored /start from unauthorized chat ${ctx.chat?.id ?? "unknown"}`);
      return;
    }

    notificationQueue.enable();
    pumpPortalClient.start();
    tokenService.startSession();

    await ctx.reply(
      "✅ Pump.fun mint monitor started.\n\nListening for new token creation events via PumpPortal.\nTrading: DISABLED",
      { parse_mode: "HTML" },
    );
  });

  bot.command("stop", async (ctx) => {
    if (!isAuthorized(ctx.chat?.id)) {
      logger.telegramWarn(`Ignored /stop from unauthorized chat ${ctx.chat?.id ?? "unknown"}`);
      return;
    }

    notificationQueue.stopAndClear();
    pumpPortalClient.stopByUser();
    tokenService.stopSession();

    await ctx.reply(
      "⏹ Pump.fun mint monitor stopped.\n\nNo further notifications will be sent until /start.",
      { parse_mode: "HTML" },
    );
  });

  bot.command("status", async (ctx) => {
    if (!isAuthorized(ctx.chat?.id)) {
      logger.telegramWarn(`Ignored /status from unauthorized chat ${ctx.chat?.id ?? "unknown"}`);
      return;
    }

    const stats = tokenService.getStats();
    const wsState = pumpPortalClient.getConnectionState();
    const monitoring = pumpPortalClient.isMonitoringEnabled();

    const message = [
      "<b>Monitor Status</b>",
      "",
      `<b>WebSocket:</b> ${escapeHtmlForTelegram(wsState)}`,
      `<b>Monitoring:</b> ${monitoring ? "ACTIVE" : "STOPPED"}`,
      `<b>Tokens received:</b> ${stats.totalTokensReceived}`,
      `<b>Unique mints tracked:</b> ${stats.seenMintCount}`,
      `<b>Runtime:</b> ${formatDuration(stats.sessionRuntimeMs)}`,
      `<b>Tokens/min:</b> ${stats.tokensPerMinute.toFixed(2)}`,
      `<b>Last event received:</b> ${formatIsoTimestamp(stats.lastEventReceivedAt)}`,
      `<b>Last blockchain timestamp:</b> ${formatIsoTimestamp(stats.lastBlockchainCreatedAt)}`,
      `<b>Trading:</b> DISABLED`,
      "",
      `<i>Updated: ${formatIsoTimestamp(Date.now())}</i>`,
    ].join("\n");

    await ctx.reply(message, { parse_mode: "HTML" });
  });

  bot.command("help", async (ctx) => {
    if (!isAuthorized(ctx.chat?.id)) {
      logger.telegramWarn(`Ignored /help from unauthorized chat ${ctx.chat?.id ?? "unknown"}`);
      return;
    }

    await ctx.reply(
      [
        "<b>Pump.fun Mint Monitor</b>",
        "",
        "Read-only monitoring of new Pump.fun token creation events.",
        "",
        "<b>Commands</b>",
        "/start — Start the PumpPortal WebSocket listener",
        "/stop — Stop monitoring and close the WebSocket",
        "/status — Show connection, stats, and runtime",
        "/help — Show this message",
        "",
        "<b>Trading:</b> DISABLED",
        "",
        "This bot does not buy, sell, sign transactions, or connect to wallets.",
      ].join("\n"),
      { parse_mode: "HTML" },
    );
  });

}
