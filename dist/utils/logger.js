function formatMessage(prefix, message) {
    return `[${prefix}] ${message}`;
}
function log(level, prefix, message) {
    const formatted = formatMessage(prefix, message);
    switch (level) {
        case "error":
            console.error(formatted);
            break;
        case "warn":
            console.warn(formatted);
            break;
        case "debug":
            console.debug(formatted);
            break;
        default:
            console.log(formatted);
    }
}
export const logger = {
    ws: (message) => log("info", "WS", message),
    wsWarn: (message) => log("warn", "WS", message),
    wsError: (message) => log("error", "WS", message),
    token: (message) => log("info", "TOKEN", message),
    telegram: (message) => log("info", "TELEGRAM", message),
    telegramWarn: (message) => log("warn", "TELEGRAM", message),
    telegramError: (message) => log("error", "TELEGRAM", message),
    app: (message) => log("info", "APP", message),
    appWarn: (message) => log("warn", "APP", message),
    appError: (message) => log("error", "APP", message),
    health: (message) => log("info", "HEALTH", message),
    healthWarn: (message) => log("warn", "HEALTH", message),
    healthError: (message) => log("error", "HEALTH", message),
};
//# sourceMappingURL=logger.js.map