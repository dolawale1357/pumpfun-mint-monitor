import { Bot } from "grammy";
import { loadConfig } from "./config.js";
import { TokenService } from "./services/tokenService.js";
import { registerTelegramCommands } from "./telegram/bot.js";
import { TelegramNotificationQueue } from "./telegram/outboundQueue.js";
import { logger } from "./utils/logger.js";
import { PumpPortalClient } from "./websocket/pumpPortal.js";

async function main(): Promise<void> {
  let config;

  try {
    config = loadConfig();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.appError(message);
    process.exit(1);
  }

  const tokenService = new TokenService();
  const notificationQueueRef: { instance: TelegramNotificationQueue | null } = {
    instance: null,
  };

  const pumpPortalClient = new PumpPortalClient({
    wsUrl: config.pumpPortalWsUrl,
    onToken: (event) => {
      if (tokenService.isDuplicate(event.mint)) {
        logger.token(`Duplicate mint=${event.mint} — skipping Telegram notification`);
        return;
      }

      const isNew = tokenService.recordToken(event);
      if (!isNew) {
        return;
      }

      logger.token(`NEW mint=${event.mint}`);

      const queue = notificationQueueRef.instance;
      if (
        queue &&
        pumpPortalClient.isMonitoringEnabled() &&
        queue.isEnabled()
      ) {
        queue.enqueue(event);
      }
    },
  });

  const bot = new Bot(config.telegramBotToken);
  const notificationQueue = new TelegramNotificationQueue(
    bot,
    config.telegramChatId,
  );
  notificationQueueRef.instance = notificationQueue;

  registerTelegramCommands(bot, {
    config,
    pumpPortalClient,
    tokenService,
    notificationQueue,
  });

  bot.catch((error) => {
    logger.telegramError(`Unhandled bot error: ${error.message}`);
  });

  logger.app("Starting Telegram bot (PumpPortal stream will start on /start)");
  logger.app("Trading: DISABLED");

  await bot.start({
    onStart: () => {
      logger.telegram("Bot is listening for commands");
    },
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.appError(`Fatal error: ${message}`);
  process.exit(1);
});
