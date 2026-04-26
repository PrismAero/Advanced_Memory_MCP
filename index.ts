#!/usr/bin/env node

/**
 * Adaptive Reasoning Server - 100% Local Operation
 *
 * SECURITY GUARANTEE: This server makes ZERO external network connections.
 * All operations are local-only for maximum privacy and security.
 */

// CRITICAL: Apply Node.js v24 compatibility polyfills BEFORE any TensorFlow.js imports
import "./modules/node-compat.js";

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
import { MLHandlers } from "./modules/handlers/ml-handlers.js";
import * as qtHandlers from "./modules/handlers/qt-handlers.js";
import { WorkflowHandlers } from "./modules/handlers/workflow-handlers.js";
import { WorkspaceHandlers } from "./modules/handlers/workspace-handlers.js";
import { logger } from "./modules/logger.js";
import { RelationshipIndexer } from "./modules/relationship-indexer.js";
import { ModernSimilarityEngine } from "./modules/similarity/similarity-engine.js";
import {
  QT_TOOLS_REGISTERED,
  SMART_MEMORY_TOOLS,
} from "./modules/smart-memory-tools.js";
import { ProjectAnalysisOperations } from "./modules/sqlite/project-analysis-operations.js";
import { SQLiteConnection } from "./modules/sqlite/sqlite-connection.js";

// CommonJS-style require shim for ESM. Used both for the security
// network monitor below and for sourcing the package version.
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// SECURITY: Network activity monitor (development safeguard)
if (process.env.LOG_LEVEL === "debug") {
  const originalConnect = require("net").Socket.prototype.connect;
  require("net").Socket.prototype.connect = function (...args: any[]) {
    logger.warn(
      "[ALERT] SECURITY WARNING: Unexpected network connection attempt detected!",
      args,
    );
    logger.warn(
      "[SECURE] This MCP server should operate 100% locally. Blocking connection.",
    );
    throw new Error(
      "Network connections are not allowed in local-only MCP server",
    );
  };
}

// Initialize modern similarity engine (TensorFlow.js embeddings)
// TensorFlow.js is the core ML feature of this Advanced Memory Server
const modernSimilarity = new ModernSimilarityEngine();

// One SQLite connection is shared across the memory manager and the
// project-analysis operations. WAL allows many readers but only a
// single writer, so opening two handles against the same file leads
// to SQLITE_BUSY whenever both sides try to write at once.
const projectPath = process.env.MEMORY_PATH || process.cwd();
const sqliteConnection = new SQLiteConnection(projectPath);

// Initialize modular system with TensorFlow.js integration
const memoryManager = new EnhancedMemoryManager(
  modernSimilarity,
  sqliteConnection,
);
const relationshipIndexer = new RelationshipIndexer(
  memoryManager,
  modernSimilarity,
);

const projectAnalysisOps = new ProjectAnalysisOperations(sqliteConnection);

// Initialize specialized handlers
const branchHandlers = new BranchHandlers(memoryManager);
const entityHandlers = new EntityHandlers(
  memoryManager,
  modernSimilarity,
  relationshipIndexer,
);
const searchHandlers = new SearchHandlers(memoryManager, modernSimilarity);
const workflowHandlers = new WorkflowHandlers(memoryManager);

// Initialize background processor for AI enhancements
const backgroundProcessor = new BackgroundProcessor(
  memoryManager,
  modernSimilarity,
  projectAnalysisOps,
);

const contextHandlers = new ContextHandlers(memoryManager, backgroundProcessor);

const workspaceHandlers = new WorkspaceHandlers(
  memoryManager,
  backgroundProcessor,
);

// Initialize ML handlers
// Note: We access ML components from backgroundProcessor where they are initialized
const mlHandlers = new MLHandlers(
  backgroundProcessor.getAdaptiveModelTrainer()!,
  backgroundProcessor.getProjectEmbeddingEngine()!,
  modernSimilarity,
  projectAnalysisOps,
);

// Version is sourced from package.json so it stays in lockstep with releases.
// Reads via createRequire (declared above) so we don't need
// --experimental-json-modules on older Node versions.
const SERVER_VERSION: string = (() => {
  try {
    return require("./package.json").version || "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

const server = new Server(
  {
    name: "adaptive-reasoning-server",
    version: SERVER_VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

/**
 * Initialize all components in the correct order.
 * TensorFlow.js is required - server will fail to start if it cannot initialize.
 */
async function initializeComponents(): Promise<void> {
  // 1. Initialize memory manager first (required for other components)
  logger.info("Initializing memory manager...");
  await memoryManager.initialize();
  logger.info("Memory manager initialized successfully");

  // Initialize SQLite connection for project analysis
  logger.info("Initializing project analysis database...");
  await sqliteConnection.initialize();
  logger.info("Project analysis database initialized successfully");

  // Initialize project analysis operations (includes vector store)
  logger.info("Initializing project analysis operations and vector store...");
  await projectAnalysisOps.initialize();
  logger.info(
    "Project analysis operations and vector store initialized successfully",
  );

  // 2. Initialize TensorFlow.js similarity engine (required - no fallback)
  logger.info("Initializing TensorFlow.js similarity engine...");
  await modernSimilarity.initialize();
  logger.info("TensorFlow.js similarity engine initialized successfully");

  // 3. Initialize relationship indexer
  logger.info("Initializing relationship indexer...");
  await relationshipIndexer.initialize();
  logger.info("Relationship indexer initialized successfully");

  // 4. Start background processor after all components are ready
  backgroundProcessor.start(30);
  logger.info(
    "Background processor started for AI memory enhancements (30 min interval)",
  );

  // 5. Auto-start project monitoring if MEMORY_PATH is set
  if (process.env.MEMORY_PATH) {
    logger.info(
      `Auto-starting project monitoring for: ${process.env.MEMORY_PATH}`,
    );
    backgroundProcessor.setMonitoredProject(process.env.MEMORY_PATH);
    logger.info("Project monitoring activated for MEMORY_PATH");
  }

  logger.info("✓ All components initialized successfully");
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  logger.info("Adaptive Memory MCP Server Ready");
  logger.info("Features: TensorFlow.js ML | Vector DB | Project Analysis");
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

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
          text: JSON.stringify({ error: "No arguments provided" }),
        },
      ],
      isError: true,
    };
  }

  try {
    switch (name) {
      // ----- branches -----
      case "list_memory_branches":
        return await branchHandlers.handleListMemoryBranches();
      case "create_memory_branch":
        return await branchHandlers.handleCreateMemoryBranch(args);
      case "delete_memory_branch":
        return await branchHandlers.handleDeleteMemoryBranch(args);
      case "read_memory_branch":
        return await branchHandlers.handleReadMemoryBranch(args);

      // ----- entity CRUD -----
      case "create_entities":
        return await entityHandlers.handleCreateEntities(args);
      case "add_observations":
        return await entityHandlers.handleAddObservations(args);
      case "update_entity_status":
        return await entityHandlers.handleUpdateEntityStatus(args);
      case "delete_entities":
        return await entityHandlers.handleDeleteEntities(args);

      // ----- search -----
      case "smart_search":
        return await searchHandlers.handleSmartSearch(args);

      // ----- consolidated context -----
      case "get_context":
        return await contextHandlers.handleGetContext(args);
      case "get_project_status":
        return await contextHandlers.handleGetProjectStatus(args);
      case "find_dependencies":
        return await contextHandlers.handleFindDependencies(args);
      case "trace_decision_chain":
        return await contextHandlers.handleTraceDecisionChain(args);

      // ----- workflow -----
      case "capture_decision":
        return await workflowHandlers.handleCaptureDecision(args);
      case "mark_current_work":
        return await workflowHandlers.handleMarkCurrentWork(args);
      case "update_status":
        return await workflowHandlers.handleUpdateStatus(args);
      case "check_missing_dependencies":
        return await workflowHandlers.handleCheckMissingDependencies(args);

      // ----- workspace -----
      case "analyze_workspace":
        return await workspaceHandlers.handleAnalyzeWorkspace(args);

      // ----- ML -----
      case "train_project_model":
        return await mlHandlers.handleTrainProjectModel(args);
      case "embeddings":
        return await mlHandlers.handleEmbeddings(args);

      // ----- Qt/QML (only registered when ENABLE_QT_TOOLS=1) -----
      case "analyze_qml_bindings":
      case "find_qt_controllers":
      case "analyze_layer_architecture":
      case "find_qml_usage":
      case "list_q_properties":
      case "list_q_invokables": {
        if (!QT_TOOLS_REGISTERED) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error:
                    "Qt/QML tools are disabled. Set ENABLE_QT_TOOLS=1 to enable.",
                  tool: name,
                }),
              },
            ],
            isError: true,
          };
        }
        let result: any;
        if (name === "analyze_qml_bindings")
          result = await qtHandlers.analyzeQmlBindings(
            args as any,
            memoryManager,
          );
        else if (name === "find_qt_controllers")
          result = await qtHandlers.findQtControllers(args, memoryManager);
        else if (name === "analyze_layer_architecture")
          result = await qtHandlers.analyzeLayerArchitecture(
            args,
            memoryManager,
          );
        else if (name === "find_qml_usage")
          result = await qtHandlers.findQmlUsage(args as any, memoryManager);
        else if (name === "list_q_properties")
          result = await qtHandlers.listQProperties(args, memoryManager);
        else result = await qtHandlers.listQInvokables(args, memoryManager);
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      }

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
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            tool: name,
          }),
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  // Initialize all components before starting the server
  await initializeComponents();

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("Modular Enhanced Memory MCP Server running on stdio");
}

// Cleanup handlers
async function shutdown(): Promise<void> {
  backgroundProcessor.stop();
  relationshipIndexer.shutdown();
  projectAnalysisOps.dispose();
  await memoryManager.close();
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
