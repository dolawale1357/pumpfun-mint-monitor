type LogLevel = "info" | "warn" | "error" | "debug";

function formatMessage(prefix: string, message: string): string {
  return `[${prefix}] ${message}`;
}

function log(level: LogLevel, prefix: string, message: string): void {
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
  ws: (message: string) => log("info", "WS", message),
  wsWarn: (message: string) => log("warn", "WS", message),
  wsError: (message: string) => log("error", "WS", message),
  token: (message: string) => log("info", "TOKEN", message),
  telegram: (message: string) => log("info", "TELEGRAM", message),
  telegramWarn: (message: string) => log("warn", "TELEGRAM", message),
  telegramError: (message: string) => log("error", "TELEGRAM", message),
  app: (message: string) => log("info", "APP", message),
  appWarn: (message: string) => log("warn", "APP", message),
  appError: (message: string) => log("error", "APP", message),
};
