import { createRequire } from "module";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { EnhancedMemoryManager } from "../enhanced-memory-manager-modular.js";
import { BackgroundProcessor } from "./background-processor.js";
import {
  BranchHandlers,
  EntityHandlers,
  SearchHandlers,
} from "./handlers/index.js";
import { ContextHandlers } from "./handlers/context-handlers.js";
import { MLHandlers } from "./handlers/ml-handlers.js";
import * as qtHandlers from "./handlers/qt-handlers.js";
import { WorkflowHandlers } from "./handlers/workflow-handlers.js";
import { WorkspaceHandlers } from "./handlers/workspace-handlers.js";
import { logger } from "./logger.js";
import { RelationshipIndexer } from "./relationship-indexer.js";
import { ModernSimilarityEngine } from "./similarity/similarity-engine.js";
import {
  QT_TOOLS_REGISTERED,
  SMART_MEMORY_TOOLS,
} from "./smart-memory-tools.js";
import { ProjectAnalysisOperations } from "./sqlite/project-analysis-operations.js";
import { SQLiteConnection } from "./sqlite/sqlite-connection.js";

const require = createRequire(import.meta.url);

export interface McpServerAppOptions {
  projectPath?: string;
  serverVersion?: string;
  startBackgroundProcessor?: boolean;
  autoStartProjectMonitoring?: boolean;
}

export interface McpServerHandlers {
  branchHandlers: BranchHandlers;
  entityHandlers: EntityHandlers;
  searchHandlers: SearchHandlers;
  contextHandlers: ContextHandlers;
  workflowHandlers: WorkflowHandlers;
  workspaceHandlers: WorkspaceHandlers;
  mlHandlers: MLHandlers;
}

export interface McpServerDependencies {
  modernSimilarity: ModernSimilarityEngine;
  sqliteConnection: SQLiteConnection;
  memoryManager: EnhancedMemoryManager;
  relationshipIndexer: RelationshipIndexer;
  projectAnalysisOps: ProjectAnalysisOperations;
  backgroundProcessor: BackgroundProcessor;
}

export interface McpServerApp {
  server: Server;
  dependencies: McpServerDependencies;
  handlers: McpServerHandlers;
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  handleToolCall(name: string, args: any): Promise<any>;
}

export function installNetworkMonitor(): void {
  if (process.env.LOG_LEVEL !== "debug") return;

  const net = require("net");
  const socketPrototype = net.Socket.prototype as any;
  if (socketPrototype.__advancedMemoryNetworkMonitorInstalled) return;

  const originalConnect = socketPrototype.connect;
  socketPrototype.connect = function (...args: any[]) {
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
  socketPrototype.__advancedMemoryNetworkMonitorInstalled = true;
  socketPrototype.__advancedMemoryOriginalConnect = originalConnect;
}

export function getServerVersion(): string {
  try {
    return require("../package.json").version || "0.0.0";
  } catch {
    try {
      return require("../../package.json").version || "0.0.0";
    } catch {
      return "0.0.0";
    }
  }
}

export function createMcpServerApp(
  options: McpServerAppOptions = {},
): McpServerApp {
  const projectPath = options.projectPath || process.env.MEMORY_PATH || process.cwd();
  const startBackgroundProcessor = options.startBackgroundProcessor !== false;
  const autoStartProjectMonitoring =
    options.autoStartProjectMonitoring ?? Boolean(process.env.MEMORY_PATH);

  const modernSimilarity = new ModernSimilarityEngine();
  const sqliteConnection = new SQLiteConnection(projectPath);
  const memoryManager = new EnhancedMemoryManager(
    modernSimilarity,
    sqliteConnection,
  );
  const relationshipIndexer = new RelationshipIndexer(
    memoryManager,
    modernSimilarity,
  );
  const projectAnalysisOps = new ProjectAnalysisOperations(sqliteConnection);
  const backgroundProcessor = new BackgroundProcessor(
    memoryManager,
    modernSimilarity,
    projectAnalysisOps,
  );

  const handlers: McpServerHandlers = {
    branchHandlers: new BranchHandlers(memoryManager),
    entityHandlers: new EntityHandlers(
      memoryManager,
      modernSimilarity,
      relationshipIndexer,
    ),
    searchHandlers: new SearchHandlers(memoryManager, modernSimilarity),
    contextHandlers: new ContextHandlers(memoryManager, backgroundProcessor),
    workflowHandlers: new WorkflowHandlers(memoryManager),
    workspaceHandlers: new WorkspaceHandlers(memoryManager, backgroundProcessor),
    mlHandlers: new MLHandlers(
      backgroundProcessor.getAdaptiveModelTrainer()!,
      backgroundProcessor.getProjectEmbeddingEngine()!,
      modernSimilarity,
      projectAnalysisOps,
    ),
  };

  const dependencies: McpServerDependencies = {
    modernSimilarity,
    sqliteConnection,
    memoryManager,
    relationshipIndexer,
    projectAnalysisOps,
    backgroundProcessor,
  };

  const server = new Server(
    {
      name: "adaptive-reasoning-server",
      version: options.serverVersion || getServerVersion(),
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  const handleToolCall = async (name: string, args: any): Promise<any> => {
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
        case "list_memory_branches":
          return await handlers.branchHandlers.handleListMemoryBranches();
        case "create_memory_branch":
          return await handlers.branchHandlers.handleCreateMemoryBranch(args);
        case "delete_memory_branch":
          return await handlers.branchHandlers.handleDeleteMemoryBranch(args);
        case "read_memory_branch":
          return await handlers.branchHandlers.handleReadMemoryBranch(args);

        case "create_entities":
          return await handlers.entityHandlers.handleCreateEntities(args);
        case "add_observations":
          return await handlers.entityHandlers.handleAddObservations(args);
        case "update_entity_status":
          return await handlers.entityHandlers.handleUpdateEntityStatus(args);
        case "delete_entities":
          return await handlers.entityHandlers.handleDeleteEntities(args);

        case "smart_search":
          return await handlers.searchHandlers.handleSmartSearch(args);

        case "get_context":
          return await handlers.contextHandlers.handleGetContext(args);
        case "get_project_status":
          return await handlers.contextHandlers.handleGetProjectStatus(args);
        case "find_dependencies":
          return await handlers.contextHandlers.handleFindDependencies(args);
        case "trace_decision_chain":
          return await handlers.contextHandlers.handleTraceDecisionChain(args);

        case "capture_decision":
          return await handlers.workflowHandlers.handleCaptureDecision(args);
        case "mark_current_work":
          return await handlers.workflowHandlers.handleMarkCurrentWork(args);
        case "update_status":
          return await handlers.workflowHandlers.handleUpdateStatus(args);
        case "check_missing_dependencies":
          return await handlers.workflowHandlers.handleCheckMissingDependencies(args);

        case "analyze_workspace":
          return await handlers.workspaceHandlers.handleAnalyzeWorkspace(args);

        case "train_project_model":
          return await handlers.mlHandlers.handleTrainProjectModel(args);
        case "embeddings":
          return await handlers.mlHandlers.handleEmbeddings(args);

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
            result = await qtHandlers.analyzeQmlBindings(args as any, memoryManager);
          else if (name === "find_qt_controllers")
            result = await qtHandlers.findQtControllers(args, memoryManager);
          else if (name === "analyze_layer_architecture")
            result = await qtHandlers.analyzeLayerArchitecture(args, memoryManager);
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
  };

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: SMART_MEMORY_TOOLS };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return handleToolCall(name, args);
  });

  const initialize = async (): Promise<void> => {
    logger.info("Initializing memory manager...");
    await memoryManager.initialize();
    logger.info("Memory manager initialized successfully");

    logger.info("Initializing project analysis database...");
    await sqliteConnection.initialize();
    logger.info("Project analysis database initialized successfully");

    logger.info("Initializing project analysis operations and vector store...");
    await projectAnalysisOps.initialize();
    logger.info(
      "Project analysis operations and vector store initialized successfully",
    );

    logger.info("Initializing TensorFlow.js similarity engine...");
    await modernSimilarity.initialize();
    logger.info("TensorFlow.js similarity engine initialized successfully");

    logger.info("Initializing relationship indexer...");
    await relationshipIndexer.initialize();
    logger.info("Relationship indexer initialized successfully");

    if (startBackgroundProcessor) {
      backgroundProcessor.start(30);
      logger.info(
        "Background processor started for AI memory enhancements (30 min interval)",
      );
    }

    if (autoStartProjectMonitoring) {
      logger.info(`Auto-starting project monitoring for: ${projectPath}`);
      backgroundProcessor.setMonitoredProject(projectPath);
      logger.info("Project monitoring activated for project path");
    }

    logger.info("✓ All components initialized successfully");
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    logger.info("Adaptive Memory MCP Server Ready");
    logger.info("Features: TensorFlow.js ML | Vector DB | Project Analysis");
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  };

  const shutdown = async (): Promise<void> => {
    backgroundProcessor.stop();
    relationshipIndexer.shutdown();
    projectAnalysisOps.dispose();
    modernSimilarity.dispose();
    await memoryManager.close();
  };

  return {
    server,
    dependencies,
    handlers,
    initialize,
    shutdown,
    handleToolCall,
  };
}
