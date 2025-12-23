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
import { ProjectTypeDetector } from "./modules/project-type-detector.js";
import { RelationshipIndexer } from "./modules/relationship-indexer.js";
import { ModernSimilarityEngine } from "./modules/similarity/similarity-engine.js";
import {
  filterToolsByProjectType,
  SMART_MEMORY_TOOLS,
} from "./modules/smart-memory-tools.js";
import { ProjectAnalysisOperations } from "./modules/sqlite/project-analysis-operations.js";
import { SQLiteConnection } from "./modules/sqlite/sqlite-connection.js";

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
// TensorFlow.js is the core ML feature of this Advanced Memory Server
const modernSimilarity = new ModernSimilarityEngine();

// Initialize modular system with TensorFlow.js integration
const memoryManager = new EnhancedMemoryManager(modernSimilarity);
const relationshipIndexer = new RelationshipIndexer(
  memoryManager,
  modernSimilarity
);

// Initialize SQLite connection for project analysis
const projectPath = process.env.MEMORY_PATH || process.cwd();
const sqliteConnection = new SQLiteConnection(projectPath);
const projectAnalysisOps = new ProjectAnalysisOperations(sqliteConnection);

// Initialize project type detector
const projectTypeDetector = new ProjectTypeDetector(projectPath);

// Initialize specialized handlers
const branchHandlers = new BranchHandlers(memoryManager);
const entityHandlers = new EntityHandlers(
  memoryManager,
  modernSimilarity,
  relationshipIndexer
);
const searchHandlers = new SearchHandlers(memoryManager, modernSimilarity);
const workflowHandlers = new WorkflowHandlers(memoryManager);

// Initialize background processor for AI enhancements
const backgroundProcessor = new BackgroundProcessor(
  memoryManager,
  modernSimilarity,
  projectAnalysisOps
);

const contextHandlers = new ContextHandlers(memoryManager, backgroundProcessor);

const workspaceHandlers = new WorkspaceHandlers(
  memoryManager,
  backgroundProcessor
);

// Initialize ML handlers
// Note: We access ML components from backgroundProcessor where they are initialized
const mlHandlers = new MLHandlers(
  backgroundProcessor.getAdaptiveModelTrainer()!,
  backgroundProcessor.getProjectEmbeddingEngine()!,
  modernSimilarity,
  projectAnalysisOps
);

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
    "Project analysis operations and vector store initialized successfully"
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
    "Background processor started for AI memory enhancements (30 min interval)"
  );

  // 5. Auto-start project monitoring if MEMORY_PATH is set
  if (process.env.MEMORY_PATH) {
    logger.info(
      `Auto-starting project monitoring for: ${process.env.MEMORY_PATH}`
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

// Dynamic tool list based on project type
let availableTools = SMART_MEMORY_TOOLS;
let projectTypeDetected = false;

server.setRequestHandler(ListToolsRequestSchema, async () => {
  // Detect project type on first ListTools request
  if (!projectTypeDetected) {
    try {
      // Check for override environment variable
      const forceEnableAll = process.env.MCP_ENABLE_ALL_TOOLS === "true";

      if (forceEnableAll) {
        logger.info(
          "MCP_ENABLE_ALL_TOOLS=true: Enabling all tools regardless of project type"
        );
        availableTools = SMART_MEMORY_TOOLS;
      } else {
        const projectType = await projectTypeDetector.detectProjectType();
        availableTools = filterToolsByProjectType(
          SMART_MEMORY_TOOLS,
          projectType
        );

        const qtEnabled = availableTools.some(
          (t) => t.name.includes("qml") || t.name.includes("qt")
        );

        logger.info(
          `Tools filtered for project type: ${projectType.primary} (${availableTools.length}/${SMART_MEMORY_TOOLS.length} tools available)`
        );
        logger.info(`  Qt/QML tools: ${qtEnabled ? "enabled" : "disabled"}`);
      }

      projectTypeDetected = true;
    } catch (error) {
      logger.warn("Project type detection failed, using all tools:", error);
      availableTools = SMART_MEMORY_TOOLS;
      projectTypeDetected = true;
    }
  }

  return { tools: availableTools };
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

      case "analyze_project_structure":
        return await workspaceHandlers.handleAnalyzeProjectStructure(args);

      // Advanced ML/AI Tools
      case "find_interface_usage":
        return await workspaceHandlers.handleFindInterfaceUsage(args);

      case "suggest_project_context":
        return await contextHandlers.handleSuggestProjectContext(args);

      case "navigate_codebase":
        return await workspaceHandlers.handleNavigateCodebase(args);

      case "train_project_model":
        return await mlHandlers.handleTrainProjectModel(args);

      case "generate_interface_embedding":
        return await mlHandlers.handleGenerateInterfaceEmbedding(args);

      case "find_similar_code":
        return await mlHandlers.handleFindSimilarCode(args);

      case "backfill_embeddings":
        return await mlHandlers.handleBackfillEmbeddings(args);

      // Qt/QML Analysis Tools
      case "analyze_qml_bindings":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await qtHandlers.analyzeQmlBindings(args as any, memoryManager),
                null,
                2
              ),
            },
          ],
        };

      case "find_qt_controllers":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await qtHandlers.findQtControllers(args, memoryManager),
                null,
                2
              ),
            },
          ],
        };

      case "analyze_layer_architecture":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await qtHandlers.analyzeLayerArchitecture(args, memoryManager),
                null,
                2
              ),
            },
          ],
        };

      case "find_qml_usage":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await qtHandlers.findQmlUsage(args as any, memoryManager),
                null,
                2
              ),
            },
          ],
        };

      case "list_q_properties":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await qtHandlers.listQProperties(args, memoryManager),
                null,
                2
              ),
            },
          ],
        };

      case "list_q_invokables":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await qtHandlers.listQInvokables(args, memoryManager),
                null,
                2
              ),
            },
          ],
        };

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
  // Initialize all components before starting the server
  await initializeComponents();

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
