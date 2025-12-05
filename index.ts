#!/usr/bin/env node

/**
 * Adaptive Reasoning Server - 100% Local Operation
 *
 * SECURITY GUARANTEE: This server makes ZERO external network connections.
 * All operations are local-only for maximum privacy and security.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { EnhancedMemoryManager } from "./enhanced-memory-manager-modular.js";
import { BackgroundProcessor } from "./modules/background-processor.js";
import { ContextHandlers } from "./modules/handlers/context-handlers.js";
import {
  BranchHandlers,
  EntityHandlers,
  SearchHandlers,
} from "./modules/handlers/index.js";
import { WorkflowHandlers } from "./modules/handlers/workflow-handlers.js";
import { WorkspaceHandlers } from "./modules/handlers/workspace-handlers.js";
import { logger } from "./modules/logger.js";
import { RelationshipIndexer } from "./modules/relationship-indexer.js";
import { ModernSimilarityEngine } from "./modules/similarity/similarity-engine.js";
import { SMART_MEMORY_TOOLS } from "./modules/smart-memory-tools.js";

// SECURITY: Network activity monitor (development safeguard)
if (process.env.LOG_LEVEL === "debug") {
  const originalConnect = require("net").Socket.prototype.connect;
  require("net").Socket.prototype.connect = function (...args: any[]) {
    logger.warn(
      "[ALERT] SECURITY WARNING: Unexpected network connection attempt detected!",
      args
    );
    logger.warn(
      "[SECURE] This MCP server should operate 100% locally. Blocking connection."
    );
    throw new Error(
      "Network connections are not allowed in local-only MCP server"
    );
  };
}

// Initialize modern similarity engine (TensorFlow.js embeddings)
const modernSimilarity = new ModernSimilarityEngine();

// Initialize modular system with TensorFlow.js integration
const memoryManager = new EnhancedMemoryManager(modernSimilarity);
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
const contextHandlers = new ContextHandlers(memoryManager);
const workflowHandlers = new WorkflowHandlers(memoryManager);
const workspaceHandlers = new WorkspaceHandlers(memoryManager);

// Initialize background processor for AI enhancements
const backgroundProcessor = new BackgroundProcessor(
  memoryManager,
  modernSimilarity
);

// Initialize modern similarity engine
modernSimilarity.initialize().catch((error) => {
  logger.error("Failed to initialize modern similarity engine:", error);
});
relationshipIndexer.initialize().catch((error: any) => {
  logger.error("Failed to initialize relationship indexer:", error);
});

// Start background processing for AI enhancements (every 30 minutes)
setTimeout(() => {
  backgroundProcessor.start(30);
  logger.info("Background processor started for AI memory enhancements");
}, 60000); // Start after 1 minute to allow full initialization

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

      // AI Context Retrieval Tools
      case "recall_working_context":
        return await contextHandlers.handleRecallWorkingContext(args);

      case "get_project_status":
        return await contextHandlers.handleGetProjectStatus(args);

      case "find_dependencies":
        return await contextHandlers.handleFindDependencies(args);

      case "trace_decision_chain":
        return await contextHandlers.handleTraceDecisionChain(args);

      // AI Workflow Management Tools
      case "capture_decision":
        return await workflowHandlers.handleCaptureDecision(args);

      case "mark_current_work":
        return await workflowHandlers.handleMarkCurrentWork(args);

      case "update_project_status":
        return await workflowHandlers.handleUpdateProjectStatus(args);

      case "archive_completed_work":
        return await workflowHandlers.handleArchiveCompletedWork(args);

      case "suggest_related_context":
        return await workflowHandlers.handleSuggestRelatedContext(args);

      case "check_missing_dependencies":
        return await workflowHandlers.handleCheckMissingDependencies(args);

      case "get_continuation_context":
        return await workflowHandlers.handleGetContinuationContext(args);

      // Workspace Integration Tools
      case "sync_with_workspace":
        return await workspaceHandlers.handleSyncWithWorkspace(args);

      case "workspace_context_bridge":
        return await workspaceHandlers.handleWorkspaceContextBridge(args);

      case "detect_project_patterns":
        return await workspaceHandlers.handleDetectProjectPatterns(args);

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
  backgroundProcessor.stop();
  relationshipIndexer.shutdown();
  await memoryManager.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Shutting down Enhanced Memory MCP Server...");
  backgroundProcessor.stop();
  relationshipIndexer.shutdown();
  await memoryManager.close();
  process.exit(0);
});

main().catch((error) => {
  logger.fatal("Fatal error in main():", error);
  process.exit(1);
});
