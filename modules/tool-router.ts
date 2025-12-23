/**
 * Tool Router - Maps consolidated tool calls to original handler implementations
 *
 * This module provides routing logic to map the new consolidated tools (which use
 * action/operation/analysis_type parameters) to the original handler functions.
 */

import type { EnhancedMemoryManager } from "../enhanced-memory-manager-modular.js";
import type { BranchHandlers } from "./handlers/branch-handlers.js";
import type { ContextHandlers } from "./handlers/context-handlers.js";
import type { EntityHandlers } from "./handlers/entity-handlers.js";
import type { MLHandlers } from "./handlers/ml-handlers.js";
import type * as qtHandlers from "./handlers/qt-handlers.js";
import type { SearchHandlers } from "./handlers/search-handlers.js";
import type { WorkflowHandlers } from "./handlers/workflow-handlers.js";
import type { WorkspaceHandlers } from "./handlers/workspace-handlers.js";

interface ToolCallContext {
  name: string;
  arguments: Record<string, unknown>;
}

interface HandlerDependencies {
  branchHandlers: BranchHandlers;
  entityHandlers: EntityHandlers;
  searchHandlers: SearchHandlers;
  contextHandlers: ContextHandlers;
  workflowHandlers: WorkflowHandlers;
  workspaceHandlers: WorkspaceHandlers;
  mlHandlers: MLHandlers;
  qtHandlers: typeof qtHandlers;
  memoryManager: EnhancedMemoryManager;
}

/**
 * Routes a consolidated tool call to the appropriate handler
 */
export async function routeToolCall(
  context: ToolCallContext,
  deps: HandlerDependencies
): Promise<unknown> {
  const { name, arguments: args } = context;
  const {
    branchHandlers,
    entityHandlers,
    searchHandlers,
    contextHandlers,
    workflowHandlers,
    workspaceHandlers,
    mlHandlers,
    qtHandlers,
    memoryManager,
  } = deps;

  switch (name) {
    case "manage_branches": {
      const action = args.action as string;
      switch (action) {
        case "list":
          return branchHandlers.handleListMemoryBranches();
        case "create":
          return branchHandlers.handleCreateMemoryBranch(args);
        case "delete":
          return branchHandlers.handleDeleteMemoryBranch(args);
        default:
          throw new Error(`Unknown action for manage_branches: ${action}`);
      }
    }

    case "manage_entities": {
      const action = args.action as string;
      switch (action) {
        case "create":
          return entityHandlers.handleCreateEntities(args);
        case "add_observations":
          return entityHandlers.handleAddObservations(args);
        case "update_status":
          return entityHandlers.handleUpdateEntityStatus(args);
        case "delete":
          return entityHandlers.handleDeleteEntities(args);
        default:
          throw new Error(`Unknown action for manage_entities: ${action}`);
      }
    }

    case "search": {
      // If query is empty string, treat as read_memory_branch
      if (args.query === "" || args.query === undefined) {
        return branchHandlers.handleReadMemoryBranch(args);
      }
      return searchHandlers.handleSmartSearch(args);
    }

    case "manage_context": {
      const action = args.action as string;
      switch (action) {
        case "recall":
          return contextHandlers.handleRecallWorkingContext(args);
        case "continuation":
          return workflowHandlers.handleGetContinuationContext(args);
        case "mark_work":
          return workflowHandlers.handleMarkCurrentWork(args);
        case "archive":
          return workflowHandlers.handleArchiveCompletedWork(args);
        default:
          throw new Error(`Unknown action for manage_context: ${action}`);
      }
    }

    case "project_status": {
      const action = args.action as string;
      switch (action) {
        case "get":
          return contextHandlers.handleGetProjectStatus(args);
        case "update":
          return workflowHandlers.handleUpdateProjectStatus(args);
        default:
          throw new Error(`Unknown action for project_status: ${action}`);
      }
    }

    case "analyze_dependencies": {
      const operation = args.operation as string;
      switch (operation) {
        case "find":
          return contextHandlers.handleFindDependencies(args);
        case "trace_decisions":
          return contextHandlers.handleTraceDecisionChain(args);
        case "check_missing":
          return workflowHandlers.handleCheckMissingDependencies(args);
        default:
          throw new Error(
            `Unknown operation for analyze_dependencies: ${operation}`
          );
      }
    }

    case "capture_decision":
      return workflowHandlers.handleCaptureDecision(args);

    case "analyze_project": {
      const operation = args.analysis_type as string;
      switch (operation) {
        case "sync_workspace":
          return workspaceHandlers.handleSyncWithWorkspace(args);
        case "workspace_bridge":
          return workspaceHandlers.handleWorkspaceContextBridge(args);
        case "detect_patterns":
          return workspaceHandlers.handleDetectProjectPatterns(args);
        case "analyze_structure":
          return workspaceHandlers.handleAnalyzeProjectStructure(args);
        case "find_interface_usage":
          return workspaceHandlers.handleFindInterfaceUsage(args);
        default:
          throw new Error(
            `Unknown analysis_type for analyze_project: ${operation}`
          );
      }
    }

    case "suggest_context": {
      const operation = args.suggestion_type as string;
      switch (operation) {
        case "project_context":
          return contextHandlers.handleSuggestProjectContext(args);
        case "related_context":
          return workflowHandlers.handleSuggestRelatedContext(args);
        default:
          throw new Error(
            `Unknown suggestion_type for suggest_context: ${operation}`
          );
      }
    }

    case "navigate_codebase":
      return workspaceHandlers.handleNavigateCodebase(args);

    case "ml_operations": {
      const operation = args.operation as string;
      switch (operation) {
        case "train_model":
          return mlHandlers.handleTrainProjectModel(args);
        case "generate_embedding":
          return mlHandlers.handleGenerateInterfaceEmbedding(args);
        case "find_similar_code":
          return mlHandlers.handleFindSimilarCode(args);
        case "backfill_embeddings":
          return mlHandlers.handleBackfillEmbeddings(args);
        default:
          throw new Error(`Unknown operation for ml_operations: ${operation}`);
      }
    }

    case "analyze_qt": {
      const operation = args.analysis_type as string;
      switch (operation) {
        case "qml_bindings":
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  await qtHandlers.analyzeQmlBindings(
                    args as any,
                    memoryManager
                  ),
                  null,
                  2
                ),
              },
            ],
          };
        case "find_controllers":
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
        case "layer_architecture":
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  await qtHandlers.analyzeLayerArchitecture(
                    args,
                    memoryManager
                  ),
                  null,
                  2
                ),
              },
            ],
          };
        case "qml_usage":
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
        default:
          throw new Error(`Unknown analysis_type for analyze_qt: ${operation}`);
      }
    }

    case "list_qt_elements": {
      const operation = args.element_type as string;
      switch (operation) {
        case "properties":
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
        case "invokables":
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
          throw new Error(
            `Unknown element_type for list_qt_elements: ${operation}`
          );
      }
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
