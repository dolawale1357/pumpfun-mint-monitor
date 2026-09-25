import { Bot } from "grammy";
import { loadConfig } from "./config.js";
import { HealthServer } from "./health/healthServer.js";
import { TokenService } from "./services/tokenService.js";
import { registerTelegramCommands } from "./telegram/bot.js";
import { TelegramNotificationQueue } from "./telegram/outboundQueue.js";
import { logger } from "./utils/logger.js";
import { PumpPortalClient } from "./websocket/pumpPortal.js";
async function main() {
    let config;
    try {
        config = loadConfig();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.appError(message);
        process.exit(1);
    }
    const tokenService = new TokenService();
    const processStartedAt = Date.now();
    const notificationQueueRef = {
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
            if (queue &&
                pumpPortalClient.isMonitoringEnabled() &&
                queue.isEnabled()) {
                queue.enqueue(event);
            }
        },
    });
    const bot = new Bot(config.telegramBotToken);
    const notificationQueue = new TelegramNotificationQueue(bot, config.telegramChatId);
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
    logger.app("Trading: DISABLED");
    // With no PORT or HEALTH_PORT there is no listening socket at all, which is
    // the safest default for a VPS or a panel. Render injects PORT by itself.
    const healthServer = config.healthPort === null
        ? null
        : new HealthServer({
            port: config.healthPort,
            thresholds: {
                startupGraceMs: config.healthStartupGraceSeconds * 1_000,
                maxIdleMs: config.healthMaxIdleSeconds * 1_000,
            },
            readSnapshot: () => ({
                processStartedAt,
                monitoringEnabled: pumpPortalClient.isMonitoringEnabled(),
                connectionState: pumpPortalClient.getConnectionState(),
                lastActivityAt: pumpPortalClient.getLastActivityAt(),
                connectedAt: pumpPortalClient.getConnectedAt(),
                stats: tokenService.getStats(),
                notificationsEnabled: notificationQueue.isEnabled(),
                pendingNotifications: notificationQueue.getPendingCount(),
                sentNotifications: notificationQueue.getSentCount(),
                failedNotifications: notificationQueue.getFailedCount(),
            }),
        });
    if (config.autostartMonitoring) {
        // Hosts that restart the app on their own schedule mean nobody is around
        // to send /start, so resume monitoring immediately.
        notificationQueue.enable();
        pumpPortalClient.start();
        tokenService.startSession();
        logger.app("Autostart enabled — monitoring starts without waiting for /start");
    }
    else {
        logger.app("Starting Telegram bot (PumpPortal stream will start on /start)");
    }
    if (healthServer !== null) {
        await healthServer.start();
    }
    else {
        logger.app("No PORT or HEALTH_PORT set — running without an HTTP health endpoint (opening no listening port)");
    }
    // Render sends SIGTERM before replacing an instance. Releasing the Telegram
    // long-poll and the stream socket promptly keeps redeploys clean.
    let shuttingDown = false;
    const shutdown = async (signal) => {
        if (shuttingDown) {
            return;
        }
        shuttingDown = true;
        logger.app(`${signal} received — shutting down`);
        try {
            pumpPortalClient.stop();
            if (healthServer !== null) {
                await healthServer.stop();
            }
            await bot.stop();
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.appWarn(`Error while shutting down: ${message}`);
        }
        process.exit(0);
    };
    process.on("SIGTERM", () => {
        void shutdown("SIGTERM");
    });
    process.on("SIGINT", () => {
        void shutdown("SIGINT");
    });
    await bot.start({
        onStart: () => {
            logger.telegram("Bot is listening for commands");
        },
    }).catch((error) => {
        // bot.stop() rejects the in-flight long poll, so a shutdown makes this
        // promise reject with "Aborted delay". That is the expected path, not a
        // crash, and reporting it as fatal gave the host a non-zero exit code.
        if (!shuttingDown) {
            throw error;
        }
    });
}
main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    logger.appError(`Fatal error: ${message}`);
    process.exit(1);
});
//# sourceMappingURL=index.js.map