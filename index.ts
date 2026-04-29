#!/usr/bin/env node

/**
 * Adaptive Reasoning Server - 100% Local Operation
 *
 * Model artifacts are prepared into a local cache before inference. Runtime
 * operation stays local after the embedding model is cached.
 */

// CRITICAL: Apply Node.js v24 compatibility polyfills BEFORE any TensorFlow.js imports
import "./modules/node-compat.js";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { logger } from "./modules/logger.js";
import {
  createMcpServerApp,
  installNetworkMonitor,
} from "./modules/mcp-server-app.js";

installNetworkMonitor();
const app = createMcpServerApp();

async function main() {
  await app.initialize();

  const transport = new StdioServerTransport();
  await app.server.connect(transport);
  logger.info("Modular Enhanced Memory MCP Server running on stdio");
}

async function shutdown(): Promise<void> {
  await app.shutdown();
}

process.on("SIGINT", async () => {
  logger.info("Shutting down Enhanced Memory MCP Server...");
  await shutdown();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Shutting down Enhanced Memory MCP Server...");
  await shutdown();
  process.exit(0);
});

main().catch((error) => {
  logger.fatal("Fatal error in main():", error);
  process.exit(1);
});
