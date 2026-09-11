import { Bot } from "grammy";
import type { AppConfig } from "../config.js";
import type { PumpPortalClient } from "../websocket/pumpPortal.js";
import type { TokenService } from "../services/tokenService.js";
import type { TelegramNotificationQueue } from "./outboundQueue.js";
export interface TelegramBotContext {
    config: AppConfig;
    pumpPortalClient: PumpPortalClient;
    tokenService: TokenService;
    notificationQueue: TelegramNotificationQueue;
}
export declare function registerTelegramCommands(bot: Bot, context: TelegramBotContext): void;
//# sourceMappingURL=bot.d.ts.map