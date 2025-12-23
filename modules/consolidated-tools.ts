import { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ProjectType } from "./project-type-detector.js";

/**
 * Tool categories for dynamic filtering
 */
const QT_QML_TOOLS = ["analyze_qt", "list_qt_elements"];

const PYTHON_SPECIFIC_TOOLS: string[] = [];
const TYPESCRIPT_SPECIFIC_TOOLS: string[] = [];

/**
 * Filter tools based on detected project type
 */
export function filterToolsByProjectType(
  tools: Tool[],
  projectType: ProjectType
): Tool[] {
  // When project type is unknown (confidence = 0), enable all tools to be safe
  const isProjectTypeUnknown = projectType.confidence === 0;

  const enableQt =
    isProjectTypeUnknown ||
    projectType.primary === "cpp" ||
    projectType.features.includes("qt") ||
    projectType.features.includes("qml");

  const enablePython =
    isProjectTypeUnknown ||
    projectType.primary === "python" ||
    projectType.secondary.includes("python");

  const enableTypeScript =
    isProjectTypeUnknown ||
    projectType.primary === "typescript" ||
    projectType.primary === "javascript" ||
    projectType.secondary.includes("typescript");

  return tools.filter((tool) => {
    if (
      !QT_QML_TOOLS.includes(tool.name) &&
      !PYTHON_SPECIFIC_TOOLS.includes(tool.name) &&
      !TYPESCRIPT_SPECIFIC_TOOLS.includes(tool.name)
    ) {
      return true;
    }

    if (QT_QML_TOOLS.includes(tool.name)) return enableQt;
    if (PYTHON_SPECIFIC_TOOLS.includes(tool.name)) return enablePython;
    if (TYPESCRIPT_SPECIFIC_TOOLS.includes(tool.name)) return enableTypeScript;

    return true;
  });
}

/**
 * Consolidated Smart Memory Tools
 * Reduced from 38 to 23 tools by combining related operations
 */
export const CONSOLIDATED_TOOLS: Tool[] = [
  // ============================================================================
  // BRANCH MANAGEMENT (was 3 tools: list/create/delete_memory_branches)
  // ============================================================================
  {
    name: "manage_branches",
    description:
      "Manage memory branches for organizing knowledge by topic. Actions: list (show all branches), create (new branch), delete (remove branch).",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "create", "delete"],
          description: "Action to perform on branches",
        },
        branch_name: {
          type: "string",
          description: "Branch name (required for create/delete)",
        },
        purpose: {
          type: "string",
          description: "Branch purpose description (optional for create)",
        },
      },
      required: ["action"],
    },
  },

  // ============================================================================
  // ENTITY MANAGEMENT (was 4 tools: create/add_observations/update_status/delete)
  // ============================================================================
  {
    name: "manage_entities",
    description:
      "Manage entities (create, update, delete, add observations). Automatically discovers relationships and suggests optimal branch placement.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["create", "add_observations", "update_status", "delete"],
          description: "Action to perform on entities",
        },
        entities: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              entityType: { type: "string" },
              observations: {
                type: "array",
                items: { type: "string" },
              },
              status: {
                type: "string",
                enum: ["active", "deprecated", "archived", "draft"],
              },
            },
          },
          description: "Entity data (required for create)",
        },
        entity_names: {
          type: "array",
          items: { type: "string" },
          description:
            "Entity names (required for add_observations/update_status/delete)",
        },
        observations: {
          type: "array",
          items: { type: "string" },
          description: "New observations (for add_observations action)",
        },
        status: {
          type: "string",
          enum: ["active", "deprecated", "archived", "draft"],
          description: "New status (for update_status action)",
        },
        status_reason: {
          type: "string",
          description: "Reason for status change (optional)",
        },
        branch_name: {
          type: "string",
          description: "Memory branch (defaults to 'main')",
        },
        auto_create_relations: {
          type: "boolean",
          description:
            "Auto-create relationships with similar entities (default: true for create)",
        },
      },
      required: ["action"],
    },
  },

  // ============================================================================
  // SEARCH & QUERY (consolidated smart_search + read_memory_branch)
  // ============================================================================
  {
    name: "search",
    description:
      "Intelligent search with ML-enhanced similarity detection. Searches entities, automatically expands context, and includes confidence scores. Use query='' to read entire branch.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Search query (use empty string '' to read entire branch)",
        },
        branch_name: {
          type: "string",
          description: "Branch to search ('*' for all branches, default: main)",
        },
        include_statuses: {
          type: "array",
          items: {
            type: "string",
            enum: ["active", "deprecated", "archived", "draft"],
          },
          description: "Entity statuses to include",
        },
        include_context: {
          type: "boolean",
          description: "Include related entities (default: true)",
          default: true,
        },
        working_context_only: {
          type: "boolean",
          description: "Only return working context entities (default: false)",
          default: false,
        },
      },
      required: ["query", "branch_name"],
    },
  },

  // ============================================================================
  // CONTEXT MANAGEMENT (was 4 tools: recall_working/get_continuation/mark_current/archive)
  // ============================================================================
  {
    name: "manage_context",
    description:
      "Manage working context and continuation. Actions: recall (get working context), continuation (resume work), mark_work (flag current work), archive (complete work).",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["recall", "continuation", "mark_work", "archive"],
          description: "Context action to perform",
        },
        branch_name: {
          type: "string",
          description: "Memory branch (defaults to 'main')",
        },
        detail_level: {
          type: "string",
          enum: ["summary", "detailed", "full"],
          description:
            "Detail level for recall/continuation (default: summary for large projects)",
          default: "summary",
        },
        entity_names: {
          type: "array",
          items: { type: "string" },
          description: "Entities to mark or archive",
        },
        work_session_id: {
          type: "string",
          description: "Work session ID (for continuation)",
        },
        time_window_hours: {
          type: "number",
          description: "Time window for recent activity (default: 24)",
          default: 24,
        },
        completion_summary: {
          type: "string",
          description: "Completion summary (for archive action)",
        },
      },
      required: ["action"],
    },
  },

  // ============================================================================
  // PROJECT STATUS & ANALYSIS
  // ============================================================================
  {
    name: "project_status",
    description:
      "Get or update project status across branches. Shows active work, recent decisions, and project phase.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["get", "update"],
          description: "Get current status or update project phase",
          default: "get",
        },
        detail_level: {
          type: "string",
          enum: ["summary", "detailed", "comprehensive"],
          description: "Amount of detail to include (default: summary)",
          default: "summary",
        },
        project_phase: {
          type: "string",
          enum: [
            "planning",
            "active-development",
            "testing",
            "maintenance",
            "archived",
          ],
          description: "New project phase (for update action)",
        },
        status_summary: {
          type: "string",
          description: "Status summary (for update action)",
        },
        branch_name: {
          type: "string",
          description: "Branch to update (for update action)",
        },
      },
      required: ["action"],
    },
  },

  // ============================================================================
  // DEPENDENCIES & DECISIONS
  // ============================================================================
  {
    name: "analyze_dependencies",
    description:
      "Analyze dependencies, trace decision chains, and check for missing dependencies. Helps ensure complete context before making changes.",
    inputSchema: {
      type: "object",
      properties: {
        analysis_type: {
          type: "string",
          enum: ["find", "trace_decisions", "check_missing"],
          description:
            "Type of analysis: find (dependencies), trace_decisions (decision history), check_missing (gaps)",
        },
        entity_names: {
          type: "array",
          items: { type: "string" },
          description:
            "Entities to analyze (optional, uses working context if empty)",
        },
        branch_name: {
          type: "string",
          description: "Memory branch (defaults to 'main')",
        },
        dependency_depth: {
          type: "number",
          description: "How deep to trace dependencies (1-3, default: 2)",
          default: 2,
        },
        max_decisions: {
          type: "number",
          description: "Max decisions to include (default: 10)",
          default: 10,
        },
        time_window_days: {
          type: "number",
          description: "Time window for decisions (default: 30)",
          default: 30,
        },
        work_description: {
          type: "string",
          description: "Description of planned work (for check_missing)",
        },
      },
      required: ["analysis_type"],
    },
  },

  // ============================================================================
  // DECISION CAPTURE
  // ============================================================================
  {
    name: "capture_decision",
    description:
      "Capture important decisions with context and rationale. Creates structured decision entities optimized for AI reasoning.",
    inputSchema: {
      type: "object",
      properties: {
        decision_title: {
          type: "string",
          description: "Clear, searchable title for the decision",
        },
        decision_rationale: {
          type: "string",
          description: "Why this decision was made",
        },
        alternatives_considered: {
          type: "array",
          items: { type: "string" },
          description: "What alternatives were considered",
        },
        related_entities: {
          type: "array",
          items: { type: "string" },
          description: "Entities affected by this decision",
        },
        branch_name: {
          type: "string",
          description: "Memory branch (defaults to 'main')",
        },
      },
      required: ["decision_title", "decision_rationale"],
    },
  },

  // ============================================================================
  // PROJECT ANALYSIS (was 5 tools: sync/workspace_bridge/detect_patterns/analyze_structure/find_interface_usage)
  // ============================================================================
  {
    name: "analyze_project",
    description:
      "Comprehensive project analysis: sync workspace, detect patterns, analyze structure, bridge context, or find interface usage. ML-powered code understanding.",
    inputSchema: {
      type: "object",
      properties: {
        analysis_type: {
          type: "string",
          enum: [
            "sync_workspace",
            "detect_patterns",
            "analyze_structure",
            "workspace_bridge",
            "find_interface_usage",
          ],
          description: "Type of analysis to perform on the project",
        },
        workspace_path: {
          type: "string",
          description: "Path to workspace (defaults to MEMORY_PATH or cwd)",
        },
        branch_name: {
          type: "string",
          description: "Memory branch (defaults to 'main')",
        },
        file_patterns: {
          type: "array",
          items: { type: "string" },
          description: "File patterns to analyze (e.g., ['*.ts', '*.py'])",
        },
        current_files: {
          type: "array",
          items: { type: "string" },
          description: "Current files for workspace_bridge",
        },
        interface_name: {
          type: "string",
          description: "Interface name for find_interface_usage",
        },
        search_scope: {
          type: "string",
          enum: ["current_file", "current_module", "entire_project"],
          description: "Search scope for interface usage",
          default: "entire_project",
        },
      },
      required: ["analysis_type"],
    },
  },

  // ============================================================================
  // CONTEXT SUGGESTIONS
  // ============================================================================
  {
    name: "suggest_context",
    description:
      "Get intelligent context suggestions for current development work or check related context. ML-powered suggestions based on semantic analysis.",
    inputSchema: {
      type: "object",
      properties: {
        suggestion_type: {
          type: "string",
          enum: ["project_context", "related_context"],
          description:
            "Type of suggestions: project_context (proactive suggestions) or related_context (find related entities)",
          default: "project_context",
        },
        current_file: {
          type: "string",
          description: "Current file path",
        },
        search_query: {
          type: "string",
          description: "Search query or task description",
        },
        active_interfaces: {
          type: "array",
          items: { type: "string" },
          description: "Currently active interfaces",
        },
        session_id: {
          type: "string",
          description: "Session ID for tracking",
        },
        focus_entities: {
          type: "array",
          items: { type: "string" },
          description: "Focus entities for related_context",
        },
        focus_description: {
          type: "string",
          description: "Focus description for related_context",
        },
        branch_name: {
          type: "string",
          description: "Memory branch (defaults to 'main')",
        },
      },
      required: ["suggestion_type"],
    },
  },

  // ============================================================================
  // CODEBASE NAVIGATION
  // ============================================================================
  {
    name: "navigate_codebase",
    description:
      "Intelligent codebase navigation using ML semantic understanding. Find related files, locate interfaces, find implementations, trace dependencies, or find examples.",
    inputSchema: {
      type: "object",
      properties: {
        feature_description: {
          type: "string",
          description: "Description of feature or requirement to work on",
        },
        navigation_goal: {
          type: "string",
          enum: [
            "find_related_files",
            "locate_interfaces",
            "find_implementations",
            "trace_dependencies",
            "find_examples",
          ],
          description: "Goal of the navigation",
        },
        starting_point: {
          type: "string",
          description: "File path or entity name to start from (optional)",
        },
        max_results: {
          type: "number",
          description: "Maximum results to return (default: 20)",
          default: 20,
        },
        branch_name: {
          type: "string",
          description: "Memory branch to search (defaults to 'main')",
        },
        include_confidence_scores: {
          type: "boolean",
          description: "Include ML confidence scores (default: true)",
          default: true,
        },
      },
      required: ["feature_description", "navigation_goal"],
    },
  },

  // ============================================================================
  // ML OPERATIONS (was 4 tools: train/generate_embedding/find_similar/backfill)
  // ============================================================================
  {
    name: "ml_operations",
    description:
      "Machine learning operations: train models, generate embeddings, find similar code, or backfill embeddings. TensorFlow.js-powered semantic understanding.",
    inputSchema: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: [
            "train_model",
            "generate_embedding",
            "find_similar_code",
            "backfill_embeddings",
          ],
          description: "ML operation to perform",
        },
        // Train model params
        epochs: {
          type: "number",
          description: "Training epochs (default: 10)",
          default: 10,
        },
        batch_size: {
          type: "number",
          description: "Training batch size (default: 16)",
          default: 16,
        },
        learning_rate: {
          type: "number",
          description: "Learning rate (default: 0.001)",
          default: 0.001,
        },
        // Generate embedding params
        interface_names: {
          type: "array",
          items: { type: "string" },
          description: "Interface names for embedding generation",
        },
        update_database: {
          type: "boolean",
          description: "Update database with embeddings (default: true)",
          default: true,
        },
        // Find similar code params
        code_snippet: {
          type: "string",
          description: "Code snippet to find similar code for",
        },
        language: {
          type: "string",
          description: "Programming language (default: typescript)",
          default: "typescript",
        },
        limit: {
          type: "number",
          description: "Max results to return (default: 5)",
          default: 5,
        },
        branch_name: {
          type: "string",
          description: "Memory branch (defaults to 'main')",
        },
      },
      required: ["operation"],
    },
  },

  // ============================================================================
  // QT/QML ANALYSIS (was 6 tools consolidated to 2)
  // ============================================================================
  {
    name: "analyze_qt",
    description:
      "Analyze Qt/QML C++ bindings and architecture. Analyze QML bindings for a class, find Qt controllers, analyze layer architecture, or find QML usage.",
    inputSchema: {
      type: "object",
      properties: {
        analysis_type: {
          type: "string",
          enum: [
            "qml_bindings",
            "find_controllers",
            "layer_architecture",
            "qml_usage",
          ],
          description:
            "Type of Qt analysis: qml_bindings (Q_PROPERTY/Q_INVOKABLE), find_controllers (QML_ELEMENT classes), layer_architecture (Service→Controller→UI), qml_usage (find QML files using controller)",
        },
        class_name: {
          type: "string",
          description:
            "C++ class name (required for qml_bindings and qml_usage)",
        },
        controller_name: {
          type: "string",
          description: "Controller name (for qml_usage)",
        },
        include_usage: {
          type: "boolean",
          description: "Include QML usage information (default: true)",
          default: true,
        },
        include_properties: {
          type: "boolean",
          description: "Include Q_PROPERTY counts (default: true)",
          default: true,
        },
        include_invokables: {
          type: "boolean",
          description: "Include Q_INVOKABLE counts (default: true)",
          default: true,
        },
        namespace_filter: {
          type: "string",
          description: "Filter by namespace",
        },
        layer_focus: {
          type: "string",
          enum: ["service", "controller", "ui", "all"],
          description: "Layer to focus on (for layer_architecture)",
          default: "all",
        },
        show_violations: {
          type: "boolean",
          description: "Show architectural violations (default: true)",
          default: true,
        },
        usage_type: {
          type: "string",
          enum: ["property", "method", "signal", "all"],
          description: "Type of usage to find (default: all)",
          default: "all",
        },
        branch_name: {
          type: "string",
          description: "Memory branch (defaults to 'main')",
        },
      },
      required: ["analysis_type"],
    },
  },

  {
    name: "list_qt_elements",
    description:
      "List Qt elements across the codebase: Q_PROPERTY declarations or Q_INVOKABLE methods. Shows type, functions, and QML usage.",
    inputSchema: {
      type: "object",
      properties: {
        element_type: {
          type: "string",
          enum: ["properties", "invokables"],
          description:
            "Type of Qt elements to list: properties (Q_PROPERTY) or invokables (Q_INVOKABLE)",
        },
        class_name: {
          type: "string",
          description: "Filter by specific class name (optional)",
        },
        property_type: {
          type: "string",
          description: "Filter properties by type (e.g., 'QString', 'int')",
        },
        include_qml_usage: {
          type: "boolean",
          description:
            "Include QML files that use each element (default: true)",
          default: true,
        },
        include_qml_calls: {
          type: "boolean",
          description: "Include QML files that call methods (default: true)",
          default: true,
        },
        branch_name: {
          type: "string",
          description: "Memory branch (defaults to 'main')",
        },
      },
      required: ["element_type"],
    },
  },
];

// Export consolidated tools as the main tool list
export const SMART_MEMORY_TOOLS = CONSOLIDATED_TOOLS;

// Legacy tool names for backward compatibility mapping
export const LEGACY_TOOL_MAP: {
  [key: string]: { tool: string; action?: string; operation?: string };
} = {
  // Branch operations
  list_memory_branches: { tool: "manage_branches", action: "list" },
  create_memory_branch: { tool: "manage_branches", action: "create" },
  delete_memory_branch: { tool: "manage_branches", action: "delete" },

  // Entity operations
  create_entities: { tool: "manage_entities", action: "create" },
  add_observations: { tool: "manage_entities", action: "add_observations" },
  update_entity_status: { tool: "manage_entities", action: "update_status" },
  delete_entities: { tool: "manage_entities", action: "delete" },

  // Search
  smart_search: { tool: "search" },
  read_memory_branch: { tool: "search" }, // with query=""

  // Context
  recall_working_context: { tool: "manage_context", action: "recall" },
  get_continuation_context: { tool: "manage_context", action: "continuation" },
  mark_current_work: { tool: "manage_context", action: "mark_work" },
  archive_completed_work: { tool: "manage_context", action: "archive" },

  // Project status
  get_project_status: { tool: "project_status", action: "get" },
  update_project_status: { tool: "project_status", action: "update" },

  // Dependencies
  find_dependencies: { tool: "analyze_dependencies", operation: "find" },
  trace_decision_chain: {
    tool: "analyze_dependencies",
    operation: "trace_decisions",
  },
  check_missing_dependencies: {
    tool: "analyze_dependencies",
    operation: "check_missing",
  },

  // Project analysis
  sync_with_workspace: { tool: "analyze_project", operation: "sync_workspace" },
  workspace_context_bridge: {
    tool: "analyze_project",
    operation: "workspace_bridge",
  },
  detect_project_patterns: {
    tool: "analyze_project",
    operation: "detect_patterns",
  },
  analyze_project_structure: {
    tool: "analyze_project",
    operation: "analyze_structure",
  },
  find_interface_usage: {
    tool: "analyze_project",
    operation: "find_interface_usage",
  },

  // Context suggestions
  suggest_project_context: {
    tool: "suggest_context",
    operation: "project_context",
  },
  suggest_related_context: {
    tool: "suggest_context",
    operation: "related_context",
  },

  // ML operations
  train_project_model: { tool: "ml_operations", operation: "train_model" },
  generate_interface_embedding: {
    tool: "ml_operations",
    operation: "generate_embedding",
  },
  find_similar_code: { tool: "ml_operations", operation: "find_similar_code" },
  backfill_embeddings: {
    tool: "ml_operations",
    operation: "backfill_embeddings",
  },

  // Qt/QML
  analyze_qml_bindings: { tool: "analyze_qt", operation: "qml_bindings" },
  find_qt_controllers: { tool: "analyze_qt", operation: "find_controllers" },
  analyze_layer_architecture: {
    tool: "analyze_qt",
    operation: "layer_architecture",
  },
  find_qml_usage: { tool: "analyze_qt", operation: "qml_usage" },
  list_q_properties: { tool: "list_qt_elements", operation: "properties" },
  list_q_invokables: { tool: "list_qt_elements", operation: "invokables" },
};
