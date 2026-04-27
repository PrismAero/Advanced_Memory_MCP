import fs from "fs";
import path from "path";

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
  private consoleLevel: number;
  private sessionLogPath: string | null = null;
  private sessionLogEnabled = false;

  constructor() {
    const logLevel = parseLogLevel(process.env.LOG_LEVEL, "info");
    this.level = LOG_LEVELS[logLevel] ?? LOG_LEVELS.info;
    const consoleLevel = parseLogLevel(
      process.env.ADVANCED_MEMORY_CONSOLE_LOG_LEVEL,
      process.env.LOG_LEVEL ? logLevel : "warn",
    );
    this.consoleLevel = LOG_LEVELS[consoleLevel] ?? LOG_LEVELS.warn;
  }

  initializeSessionLog(basePath: string): void {
    const memoryDir = path.join(path.resolve(basePath), ".memory");
    const settings = readSettings(memoryDir);
    const enabled = readSessionLogEnabled(settings);
    this.sessionLogEnabled = enabled;

    if (!enabled) {
      this.sessionLogPath = null;
      return;
    }

    try {
      fs.mkdirSync(memoryDir, { recursive: true });
      this.sessionLogPath = path.join(memoryDir, "session.log");
      fs.writeFileSync(
        this.sessionLogPath,
        `# Advanced Memory MCP session log\n# Started ${new Date().toISOString()}\n`,
        "utf8",
      );
      ensureGitignoreEntry(path.dirname(memoryDir), ".memory/session.log");
    } catch (error) {
      this.sessionLogPath = null;
      this.sessionLogEnabled = false;
      this.warn("Failed to initialize session log:", error);
    }
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
    if (LOG_LEVELS[level] >= this.level || LOG_LEVELS[level] >= this.consoleLevel) {
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

      if (LOG_LEVELS[level] >= this.level) {
        this.writeSessionLog(fullMessage);
      }

      if (LOG_LEVELS[level] >= this.consoleLevel) {
        process.stderr.write(fullMessage + "\n");
      }
    }
  }

  private writeSessionLog(line: string): void {
    if (!this.sessionLogEnabled || !this.sessionLogPath) return;
    try {
      fs.appendFileSync(this.sessionLogPath, `${line}\n`, "utf8");
    } catch {
      this.sessionLogEnabled = false;
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

function parseLogLevel(value: string | undefined, fallback: LogLevel): LogLevel {
  const normalized = value?.toLowerCase() as LogLevel | undefined;
  return normalized && normalized in LOG_LEVELS ? normalized : fallback;
}

function readSettings(memoryDir: string): any {
  const settingsPath = path.join(memoryDir, "settings.json");
  try {
    return JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch {
    return {};
  }
}

function readSessionLogEnabled(settings: any): boolean {
  if (process.env.ADVANCED_MEMORY_SESSION_LOG === "0") return false;
  if (process.env.ADVANCED_MEMORY_SESSION_LOG === "1") return true;
  const configured =
    settings?.sessionLog ??
    settings?.session_log ??
    settings?.advancedMemory?.sessionLog ??
    settings?.advanced_memory?.session_log;
  return configured !== false;
}

function ensureGitignoreEntry(rootPath: string, entry: string): void {
  const gitignorePath = path.join(rootPath, ".gitignore");
  let existing = "";
  try {
    existing = fs.readFileSync(gitignorePath, "utf8");
  } catch {
    existing = "";
  }

  const normalizedEntry = entry.replace(/\\/g, "/");
  const existingEntries = new Set(
    existing
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/\\/g, "/").replace(/^\/+/, ""))
      .filter((line) => line && !line.startsWith("#")),
  );
  if (
    existingEntries.has(normalizedEntry) ||
    existingEntries.has(".memory/") ||
    existingEntries.has(".memory") ||
    existingEntries.has(".memory/**")
  ) {
    return;
  }

  const separator =
    existing.length === 0 ? "" : existing.endsWith("\n") ? "\n" : "\n\n";
  try {
    fs.writeFileSync(
      gitignorePath,
      `${existing}${separator}# Advanced Memory MCP session log\n${normalizedEntry}\n`,
      "utf8",
    );
  } catch {
    // Session logging should remain available even if the project gitignore is read-only.
  }
}
