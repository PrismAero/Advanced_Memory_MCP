export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

class Logger {
  private level: number;

  constructor() {
    const logLevel =
      (process.env.LOG_LEVEL?.toLowerCase() as LogLevel) || "info";
    this.level = LOG_LEVELS[logLevel] ?? LOG_LEVELS.info;
  }

  private log(level: LogLevel, message: string, ...args: any[]) {
    if (LOG_LEVELS[level] >= this.level) {
      const timestamp = `[${new Date().toISOString().substr(11, 8)}]`;
      const formattedMessage = `${timestamp} [${level.toUpperCase()}] ${message}`;

      // For MCP compatibility: only send actual errors to stderr
      // Info/debug/warn go to stderr but with process.stderr.write to avoid MCP error flagging
      if (level === "error" || level === "fatal") {
        if (args.length > 0) {
          console.error(formattedMessage, ...args);
        } else {
          console.error(formattedMessage);
        }
      } else {
        // Use process.stderr.write directly for non-errors to avoid MCP treating them as errors
        const fullMessage =
          args.length > 0
            ? `${formattedMessage} ${args
                .map((arg) =>
                  typeof arg === "object" ? JSON.stringify(arg) : String(arg)
                )
                .join(" ")}`
            : formattedMessage;
        process.stderr.write(fullMessage + "\n");
      }
    }
  }

  debug(message: string, ...args: any[]) {
    this.log("debug", message, ...args);
  }

  info(message: string, ...args: any[]) {
    this.log("info", message, ...args);
  }

  warn(message: string, ...args: any[]) {
    this.log("warn", message, ...args);
  }

  error(message: string, ...args: any[]) {
    this.log("error", message, ...args);
  }

  fatal(message: string, ...args: any[]) {
    this.log("fatal", message, ...args);
  }
}

export const logger = new Logger();
