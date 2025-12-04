#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { EnhancedMemoryManager } from "./enhanced-memory-manager-modular.js";
import {
  BranchHandlers,
  EntityHandlers,
  SearchHandlers,
} from "./modules/handlers/index.js";
import { logger } from "./modules/logger.js";
import { RelationshipIndexer } from "./modules/relationship-indexer.js";
import { ModernSimilarityEngine } from "./modules/similarity/similarity-engine.js";
import { SMART_MEMORY_TOOLS } from "./modules/smart-memory-tools.js";

// Initialize modular system
const memoryManager = new EnhancedMemoryManager();

// Initialize modern similarity engine (sentence-similarity + natural)
const modernSimilarity = new ModernSimilarityEngine();
const relationshipIndexer = new RelationshipIndexer(
  memoryManager,
  modernSimilarity
);

// Initialize specialized handlers
const branchHandlers = new BranchHandlers(memoryManager);
const entityHandlers = new EntityHandlers(
  memoryManager,
  modernSimilarity,
  relationshipIndexer
);
const searchHandlers = new SearchHandlers(memoryManager, modernSimilarity);

// Initialize modern similarity engine
modernSimilarity.initialize().catch((error) => {
  logger.error("Failed to initialize modern similarity engine:", error);
});
relationshipIndexer.initialize().catch((error: any) => {
  logger.error("Failed to initialize relationship indexer:", error);
});

const server = new Server(
  {
    name: "adaptive-reasoning-server",
    version: "3.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Initialize the enhanced memory manager
memoryManager.initialize().catch((error) => {
  logger.error("Failed to initialize enhanced memory manager:", error);
  process.exit(1);
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: SMART_MEMORY_TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!args) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: "No arguments provided" }, null, 2),
        },
      ],
      isError: true,
    };
  }

  try {
    switch (name) {
      case "list_memory_branches":
        return await branchHandlers.handleListMemoryBranches();

      case "create_memory_branch":
        return await branchHandlers.handleCreateMemoryBranch(args);

      case "delete_memory_branch":
        return await branchHandlers.handleDeleteMemoryBranch(args);

      case "create_entities":
        return await entityHandlers.handleCreateEntities(args);

      case "smart_search":
        return await searchHandlers.handleSmartSearch(args);

      case "read_memory_branch":
        return await branchHandlers.handleReadMemoryBranch(args);

      case "add_observations":
        return await entityHandlers.handleAddObservations(args);

      case "update_entity_status":
        return await entityHandlers.handleUpdateEntityStatus(args);

      case "delete_entities":
        return await entityHandlers.handleDeleteEntities(args);

      default:
        logger.warn(`Unknown tool called: ${name}`);
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    logger.error(`Error handling tool call '${name}':`, error);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: error instanceof Error ? error.message : String(error),
              tool: name,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("Modular Enhanced Memory MCP Server running on stdio");
}

// Cleanup handlers
process.on("SIGINT", async () => {
  logger.info("Shutting down Enhanced Memory MCP Server...");
  relationshipIndexer.shutdown();
  await memoryManager.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Shutting down Enhanced Memory MCP Server...");
  relationshipIndexer.shutdown();
  await memoryManager.close();
  process.exit(0);
});

main().catch((error) => {
  logger.fatal("Fatal error in main():", error);
  process.exit(1);
});
