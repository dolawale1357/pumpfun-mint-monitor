import { Bot } from "grammy";
import type { NewTokenEvent } from "../types/token.js";
export declare class TelegramNotificationQueue {
    private readonly bot;
    private readonly chatId;
    private readonly queue;
    private workerRunning;
    private lastSendFinishedAt;
    private sentCount;
    private failedCount;
    private notificationsEnabled;
    private stopGeneration;
    constructor(bot: Bot, chatId: string);
    isEnabled(): boolean;
    enable(): void;
    /** Immediately stop sending and discard all pending mint alerts. */
    stopAndClear(): number;
    enqueue(event: NewTokenEvent): void;
    getPendingCount(): number;
    getSentCount(): number;
    getFailedCount(): number;
    isActive(): boolean;
    private isCancelled;
    private sleepInterruptible;
    private processQueue;
    private waitForSendSlot;
    private sendWithRateLimit;
}
//# sourceMappingURL=outboundQueue.d.ts.map