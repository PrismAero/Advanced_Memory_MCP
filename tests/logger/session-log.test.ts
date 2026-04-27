import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { logger } from "../../modules/logger.js";
import {
  cleanupTempRoot,
  createTempMemoryRoot,
} from "../utils/mcp-test-utils.js";

describe("session log initialization", () => {
  let root: string | undefined;
  let originalSessionLogSetting: string | undefined;

  beforeEach(() => {
    originalSessionLogSetting = process.env.ADVANCED_MEMORY_SESSION_LOG;
    delete process.env.ADVANCED_MEMORY_SESSION_LOG;
  });

  afterEach(async () => {
    if (root) await cleanupTempRoot(root);
    if (originalSessionLogSetting === undefined) {
      delete process.env.ADVANCED_MEMORY_SESSION_LOG;
    } else {
      process.env.ADVANCED_MEMORY_SESSION_LOG = originalSessionLogSetting;
    }
    root = undefined;
  });

  it("creates a per-session log and appends it to the project gitignore", () => {
    root = createTempMemoryRoot("advanced-memory-session-log-");

    logger.initializeSessionLog(root);

    expect(existsSync(path.join(root, ".memory", "session.log"))).toBe(true);
    const gitignore = readFileSync(path.join(root, ".gitignore"), "utf8");
    expect(gitignore).toContain(".memory/session.log");
  });

  it("does not duplicate an existing root-anchored gitignore entry", () => {
    root = createTempMemoryRoot("advanced-memory-session-log-existing-");
    writeFileSync(path.join(root, ".gitignore"), "/.memory/session.log\n");

    logger.initializeSessionLog(root);

    const gitignore = readFileSync(path.join(root, ".gitignore"), "utf8");
    expect(gitignore.match(/\.memory\/session\.log/g)).toHaveLength(1);
  });

  it("does not append the session log when settings disable it", () => {
    root = createTempMemoryRoot("advanced-memory-session-log-disabled-");
    mkdirSync(path.join(root, ".memory"), { recursive: true });
    writeFileSync(
      path.join(root, ".memory", "settings.json"),
      JSON.stringify({ sessionLog: false }),
    );

    logger.initializeSessionLog(root);

    expect(existsSync(path.join(root, ".memory", "session.log"))).toBe(false);
    expect(existsSync(path.join(root, ".gitignore"))).toBe(false);
  });
});
