import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import {
  createMcpServerApp,
  type McpServerApp,
} from "../../modules/mcp-server-app.js";

export function createTempMemoryRoot(prefix = "advanced-memory-mcp-"): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(root, { recursive: true });
  return root;
}

export async function cleanupTempRoot(root: string): Promise<void> {
  if (!root || !fs.existsSync(root)) return;

  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      fs.rmSync(root, { recursive: true, force: true });
      return;
    } catch (error: any) {
      if (error.code !== "EBUSY" && error.code !== "EPERM") {
        throw error;
      }
      if (attempt === 19) return;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
}

export function parseTextResponse(result: any): any {
  const text = result?.content?.find((item: any) => item.type === "text")?.text;
  expect(text, "expected MCP text response").toEqual(expect.any(String));
  return JSON.parse(text);
}

export async function createInitializedApp(
  memoryRoot = createTempMemoryRoot(),
): Promise<{ app: McpServerApp; memoryRoot: string; cleanup: () => Promise<void> }> {
  const previousMemoryPath = process.env.MEMORY_PATH;
  process.env.MEMORY_PATH = memoryRoot;

  const app = createMcpServerApp({
    projectPath: memoryRoot,
    startBackgroundProcessor: false,
    autoStartProjectMonitoring: false,
    serverVersion: "test",
  });
  await app.initialize();

  const cleanup = async () => {
    try {
      await app.shutdown();
    } finally {
      if (previousMemoryPath === undefined) delete process.env.MEMORY_PATH;
      else process.env.MEMORY_PATH = previousMemoryPath;
      await cleanupTempRoot(memoryRoot);
    }
  };

  return { app, memoryRoot, cleanup };
}

export function registerAppCleanup(cleanup: () => Promise<void>): void {
  afterEach(async () => {
    await cleanup();
  });
}

export async function createStdioClient(
  memoryRoot = createTempMemoryRoot("advanced-memory-mcp-stdio-"),
): Promise<{
  client: Client;
  transport: StdioClientTransport;
  memoryRoot: string;
  close: () => Promise<void>;
}> {
  const env = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] =>
      typeof entry[1] === "string",
    ),
  );
  env.MEMORY_PATH = memoryRoot;
  env.LOG_LEVEL = "error";

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/index.js"],
    cwd: process.cwd(),
    env,
    stderr: "pipe",
  });
  const client = new Client({ name: "vitest-mcp-client", version: "1.0.0" });
  await client.connect(transport);

  const close = async () => {
    try {
      await client.close();
    } finally {
      await transport.close().catch(() => undefined);
      await cleanupTempRoot(memoryRoot);
    }
  };

  return { client, transport, memoryRoot, close };
}

export function expectJsonError(result: any, messagePattern: RegExp): void {
  expect(result.isError).toBe(true);
  const payload = parseTextResponse(result);
  expect(String(payload.error ?? payload)).toMatch(messagePattern);
}
