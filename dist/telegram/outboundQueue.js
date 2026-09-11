import { GrammyError } from "grammy";
import { logger } from "../utils/logger.js";
import { buildTokenMessage } from "./messages.js";
const MIN_SEND_INTERVAL_MS = 2_000;
const MAX_SEND_ATTEMPTS = 15;
const SLEEP_CHECK_INTERVAL_MS = 200;
function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
function getRetryAfterSeconds(error) {
    if (!(error instanceof GrammyError)) {
        return null;
    }
    if (error.error_code !== 429) {
        return null;
    }
    const retryAfter = error.parameters["retry_after"];
    if (typeof retryAfter === "number" && Number.isFinite(retryAfter)) {
        return retryAfter;
    }
    return 30;
}
export class TelegramNotificationQueue {
    bot;
    chatId;
    queue = [];
    workerRunning = false;
    lastSendFinishedAt = 0;
    sentCount = 0;
    failedCount = 0;
    notificationsEnabled = false;
    stopGeneration = 0;
    constructor(bot, chatId) {
        this.bot = bot;
        this.chatId = chatId;
    }
    isEnabled() {
        return this.notificationsEnabled;
    }
    enable() {
        this.notificationsEnabled = true;
        logger.telegram("Notification queue enabled");
    }
    /** Immediately stop sending and discard all pending mint alerts. */
    stopAndClear() {
        this.notificationsEnabled = false;
        this.stopGeneration += 1;
        const discarded = this.queue.length;
        this.queue.length = 0;
        if (discarded > 0) {
            logger.telegram(`Stopped queue — discarded ${discarded} pending notification(s)`);
        }
        else {
            logger.telegram("Stopped queue — no pending notifications");
        }
        return discarded;
    }
    enqueue(event) {
        if (!this.notificationsEnabled) {
            logger.telegram(`Ignored mint=${event.mint} — notifications stopped`);
            return;
        }
        this.queue.push(event);
        logger.telegram(`Queued mint=${event.mint} (pending=${this.queue.length})`);
        void this.processQueue();
    }
    getPendingCount() {
        return this.queue.length;
    }
    getSentCount() {
        return this.sentCount;
    }
    getFailedCount() {
        return this.failedCount;
    }
    isActive() {
        return this.notificationsEnabled;
    }
    isCancelled(generation) {
        return !this.notificationsEnabled || generation !== this.stopGeneration;
    }
    async sleepInterruptible(ms, generation) {
        let remaining = ms;
        while (remaining > 0) {
            if (this.isCancelled(generation)) {
                return;
            }
            const chunk = Math.min(SLEEP_CHECK_INTERVAL_MS, remaining);
            await sleep(chunk);
            remaining -= chunk;
        }
    }
    async processQueue() {
        if (this.workerRunning) {
            return;
        }
        this.workerRunning = true;
        const generation = this.stopGeneration;
        try {
            while (this.queue.length > 0) {
                if (this.isCancelled(generation)) {
                    this.queue.length = 0;
                    break;
                }
                const event = this.queue[0];
                if (!event) {
                    break;
                }
                const result = await this.sendWithRateLimit(event, generation);
                if (result === "sent") {
                    this.queue.shift();
                    this.sentCount += 1;
                    logger.telegram(`Sent mint=${event.mint} (pending=${this.queue.length})`);
                }
                else if (result === "failed") {
                    this.failedCount += 1;
                    this.queue.shift();
                    logger.telegramError(`Dropped mint=${event.mint} after max send attempts`);
                }
                else {
                    // cancelled — drop current item without sending
                    this.queue.shift();
                    logger.telegram(`Cancelled pending mint=${event.mint}`);
                    if (this.isCancelled(generation)) {
                        const remaining = this.queue.length;
                        this.queue.length = 0;
                        if (remaining > 0) {
                            logger.telegram(`Cancelled ${remaining} additional queued notification(s)`);
                        }
                        break;
                    }
                }
            }
        }
        finally {
            this.workerRunning = false;
            if (this.notificationsEnabled && this.queue.length > 0) {
                void this.processQueue();
            }
        }
    }
    async waitForSendSlot(generation) {
        const elapsed = Date.now() - this.lastSendFinishedAt;
        if (elapsed < MIN_SEND_INTERVAL_MS) {
            await this.sleepInterruptible(MIN_SEND_INTERVAL_MS - elapsed, generation);
        }
        return !this.isCancelled(generation);
    }
    async sendWithRateLimit(event, generation) {
        for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt += 1) {
            if (this.isCancelled(generation)) {
                return "cancelled";
            }
            const canSend = await this.waitForSendSlot(generation);
            if (!canSend) {
                return "cancelled";
            }
            try {
                await this.bot.api.sendMessage(this.chatId, buildTokenMessage(event), {
                    parse_mode: "HTML",
                    link_preview_options: { is_disabled: true },
                });
                this.lastSendFinishedAt = Date.now();
                return "sent";
            }
            catch (error) {
                if (this.isCancelled(generation)) {
                    return "cancelled";
                }
                const retryAfter = getRetryAfterSeconds(error);
                if (retryAfter !== null) {
                    logger.telegramWarn(`Rate limited mint=${event.mint}, retry after ${retryAfter}s (attempt ${attempt}/${MAX_SEND_ATTEMPTS})`);
                    await this.sleepInterruptible(retryAfter * 1_000, generation);
                    if (this.isCancelled(generation)) {
                        return "cancelled";
                    }
                    continue;
                }
                const message = error instanceof Error ? error.message : String(error);
                logger.telegramWarn(`Send failed mint=${event.mint} (attempt ${attempt}/${MAX_SEND_ATTEMPTS}): ${message}`);
                await this.sleepInterruptible(Math.min(1_000 * attempt, 10_000), generation);
                if (this.isCancelled(generation)) {
                    return "cancelled";
                }
            }
        }
        return "failed";
    }
}
//# sourceMappingURL=outboundQueue.js.map