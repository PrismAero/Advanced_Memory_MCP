import { promises as fs } from "fs";
import type { Ignore } from "ignore";
import ignoreLib from "ignore";
import path from "node:path";
import { logger } from "../logger.js";
import {
  buildIndexerExcludePatterns,
  buildWatcherIgnoreGlobs,
  EXCLUDED_DIRECTORIES,
  normalizeRelativePath,
} from "./exclusion-patterns.js";

const MEMORY_DIR_NAME = ".memory";
const MEMORY_IGNORE_NAME = ".memoryignore";

export interface IgnorePolicyLoadOptions {
  additionalPatterns?: string[];
  persistAdditionalPatterns?: boolean;
  createMemoryIgnore?: boolean;
}

export class IgnorePolicy {
  private excludePatterns = buildIndexerExcludePatterns();
  private ignoreFilter: Ignore | null = null;
  private rootPath: string | null = null;

  async load(
    rootPath: string,
    options: IgnorePolicyLoadOptions = {},
  ): Promise<void> {
    this.rootPath = path.resolve(rootPath);
    const memoryIgnorePath = await ensureMemoryIgnoreFile(this.rootPath, {
      patterns: options.additionalPatterns,
      appendPatterns: options.persistAdditionalPatterns,
      createIfMissing: options.createMemoryIgnore !== false,
    });

    const ig = createIgnore();
    ig.add([
      ...EXCLUDED_DIRECTORIES,
      ...buildWatcherIgnoreGlobs(),
      ...(await readIgnoreFile(path.join(this.rootPath, ".gitignore"))),
      ...(await readIgnoreFile(memoryIgnorePath)),
      ...(options.additionalPatterns || []),
    ]);

    this.ignoreFilter = ig;
  }

  ignores(relativePath: string): boolean {
    const normalized = normalizeRelativePath(relativePath);

    if (this.excludePatterns.some((pattern) => pattern.test(normalized))) {
      return true;
    }

    if (!this.ignoreFilter) return false;
    return this.ignoreFilter.ignores(normalized);
  }

  getWatcherIgnoreGlobs(): string[] {
    return buildWatcherIgnoreGlobs();
  }

  getRootPath(): string | null {
    return this.rootPath;
  }
}

export async function ensureMemoryIgnoreFile(
  rootPath: string,
  options: {
    patterns?: string[];
    appendPatterns?: boolean;
    createIfMissing?: boolean;
  } = {},
): Promise<string> {
  const memoryDir = path.join(path.resolve(rootPath), MEMORY_DIR_NAME);
  const memoryIgnorePath = path.join(memoryDir, MEMORY_IGNORE_NAME);

  await fs.mkdir(memoryDir, { recursive: true });

  if (options.createIfMissing !== false) {
    try {
      await fs.access(memoryIgnorePath);
    } catch {
      await fs.writeFile(memoryIgnorePath, defaultMemoryIgnoreTemplate(), "utf-8");
      logger.info(`[MEMORYIGNORE] Created ${memoryIgnorePath}`);
    }
  }

  if (options.appendPatterns && options.patterns?.length) {
    await appendMemoryIgnorePatterns(memoryIgnorePath, options.patterns);
  }

  return memoryIgnorePath;
}

export async function appendMemoryIgnorePatterns(
  memoryIgnorePath: string,
  patterns: string[],
): Promise<void> {
  const normalized = patterns
    .map((pattern) => pattern.trim())
    .filter((pattern) => pattern.length > 0 && !pattern.startsWith("#"));

  if (normalized.length === 0) return;

  let existing = "";
  try {
    existing = await fs.readFile(memoryIgnorePath, "utf-8");
  } catch {
    existing = defaultMemoryIgnoreTemplate();
  }

  const existingPatterns = new Set(
    existing
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#")),
  );
  const additions = normalized.filter((pattern) => !existingPatterns.has(pattern));
  if (additions.length === 0) return;

  const prefix = existing.endsWith("\n") ? "" : "\n";
  await fs.writeFile(
    memoryIgnorePath,
    `${existing}${prefix}\n# Added by analyze_workspace memory_ignore_patterns\n${additions.join("\n")}\n`,
    "utf-8",
  );
}

export async function readMemoryIgnorePatterns(rootPath: string): Promise<string[]> {
  return readIgnoreFile(path.join(path.resolve(rootPath), MEMORY_DIR_NAME, MEMORY_IGNORE_NAME));
}

async function readIgnoreFile(filePath: string): Promise<string[]> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));
  } catch {
    return [];
  }
}

function createIgnore(): Ignore {
  // @ts-ignore - ignore has a default export shape that varies by module mode.
  const factory = ignoreLib.default || ignoreLib;
  return factory();
}

function defaultMemoryIgnoreTemplate(): string {
  return [
    "# Advanced Memory MCP private ignore file",
    "# Patterns are relative to the monitored project root and supplement .gitignore.",
    "# Add generated, vendor, or sensitive paths that should not be indexed into memory.",
    "",
    "# Examples:",
    "# secrets/**",
    "# fixtures/large/**",
    "",
  ].join("\n");
}
