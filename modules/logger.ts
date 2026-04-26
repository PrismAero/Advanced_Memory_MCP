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

  private formatArg(arg: unknown): string {
    if (arg === null) return "null";
    if (arg instanceof Error) {
      return arg.stack ?? `${arg.name}: ${arg.message}`;
    }
    if (typeof arg === "object") {
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }

  private log(level: LogLevel, message: string, ...args: any[]) {
    if (LOG_LEVELS[level] >= this.level) {
      const timestamp = `[${new Date().toISOString().substr(11, 8)}]`;
      const formattedMessage = `${timestamp} [${level.toUpperCase()}] ${message}`;

      // Drop undefined entries so callers passing optional values
      // don't end up writing literal " undefined" to the log stream.
      const cleanArgs = args.filter((arg) => arg !== undefined);
      const suffix =
        cleanArgs.length > 0
          ? " " + cleanArgs.map((arg) => this.formatArg(arg)).join(" ")
          : "";
      const fullMessage = formattedMessage + suffix;

      // For MCP compatibility: only send actual errors to stderr via console.error.
      // Other levels go through process.stderr.write so the host doesn't flag them.
      if (level === "error" || level === "fatal") {
        console.error(fullMessage);
      } else {
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
