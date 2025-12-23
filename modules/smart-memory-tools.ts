import { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ProjectType } from "./project-type-detector.js";

/**
 * Tool categories for dynamic filtering
 */
const QT_QML_TOOLS = [
  "analyze_qml_bindings",
  "find_qt_controllers",
  "analyze_layer_architecture",
  "find_qml_usage",
  "list_q_properties",
  "list_q_invokables",
];

const PYTHON_SPECIFIC_TOOLS: string[] = [
  // Add Python-specific tools here if any
];

const TYPESCRIPT_SPECIFIC_TOOLS: string[] = [
  // Add TypeScript-specific tools here if any
];

/**
 * Filter tools based on detected project type
 */
export function filterToolsByProjectType(
  tools: Tool[],
  projectType: ProjectType
): Tool[] {
  const enableQt =
    projectType.primary === "cpp" ||
    projectType.features.includes("qt") ||
    projectType.features.includes("qml") ||
    projectType.confidence === 0; // Enable all tools when project type cannot be determined

  const enablePython =
    projectType.primary === "python" ||
    projectType.secondary.includes("python") ||
    projectType.confidence === 0;

  const enableTypeScript =
    projectType.primary === "typescript" ||
    projectType.primary === "javascript" ||
    projectType.secondary.includes("typescript") ||
    projectType.confidence === 0;

  return tools.filter((tool) => {
    // Always include core memory tools (not in any specific category)
    if (
      !QT_QML_TOOLS.includes(tool.name) &&
      !PYTHON_SPECIFIC_TOOLS.includes(tool.name) &&
      !TYPESCRIPT_SPECIFIC_TOOLS.includes(tool.name)
    ) {
      return true;
    }

    // Filter Qt/QML tools
    if (QT_QML_TOOLS.includes(tool.name)) {
      return enableQt;
    }

    // Filter Python tools
    if (PYTHON_SPECIFIC_TOOLS.includes(tool.name)) {
      return enablePython;
    }

    // Filter TypeScript tools
    if (TYPESCRIPT_SPECIFIC_TOOLS.includes(tool.name)) {
      return enableTypeScript;
    }

    return true;
  });
}

/**
 * Smart Memory Tools - Consolidated and Intelligent
 * Keeps core CRUD operations explicit while automating relationships and context
 */
export const SMART_MEMORY_TOOLS: Tool[] = [
  // EXPLICIT CORE DATA MANAGEMENT
  {
    name: "list_memory_branches",
    description:
      "List all memory branches with statistics. Shows branch overview with entity counts, purposes, and last updated timestamps.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },

  {
    name: "create_memory_branch",
    description:
      "Create a new memory branch for organizing knowledge by topic or domain.",
    inputSchema: {
      type: "object",
      properties: {
        branch_name: { type: "string", description: "Name for the new branch" },
        purpose: {
          type: "string",
          description: "Description of what this branch will contain",
        },
      },
      required: ["branch_name"],
    },
  },

  {
    name: "delete_memory_branch",
    description:
      "Permanently delete a memory branch and all its data. Cannot delete the main branch.",
    inputSchema: {
      type: "object",
      properties: {
        branch_name: {
          type: "string",
          description: "Name of the branch to delete",
        },
      },
      required: ["branch_name"],
    },
  },

  {
    name: "create_entities",
    description:
      "Create new entities. Automatically discovers relationships and suggests optimal branch placement.",
    inputSchema: {
      type: "object",
      properties: {
        entities: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Unique name for the entity",
              },
              entityType: {
                type: "string",
                description: "Type/category of the entity",
              },
              observations: {
                type: "array",
                items: { type: "string" },
                description:
                  "Array of facts, notes, or observations about this entity",
              },
              status: {
                type: "string",
                enum: ["active", "deprecated", "archived", "draft"],
                description: "Status of the entity (defaults to 'active')",
              },
            },
            required: ["name", "entityType", "observations"],
          },
        },
        branch_name: {
          type: "string",
          description:
            "Memory branch to store entities in. Leave empty for auto-suggestion based on content analysis.",
        },
        auto_create_relations: {
          type: "boolean",
          description:
            "Whether to automatically create relationships with similar entities (default: true)",
        },
      },
      required: ["entities"],
    },
  },

  {
    name: "add_observations",
    description:
      "Add new observations to existing entities. Automatically updates related entity relationships if needed.",
    inputSchema: {
      type: "object",
      properties: {
        observations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              entityName: {
                type: "string",
                description: "Name of the entity to add observations to",
              },
              contents: {
                type: "array",
                items: { type: "string" },
                description: "Array of new observations to add",
              },
            },
            required: ["entityName", "contents"],
          },
        },
        branch_name: {
          type: "string",
          description:
            "Memory branch containing the entities. Defaults to 'main'.",
        },
      },
      required: ["observations"],
    },
  },

  {
    name: "update_entity_status",
    description: "Update the status of an entity with optional reason.",
    inputSchema: {
      type: "object",
      properties: {
        entity_name: {
          type: "string",
          description: "Name of the entity to update",
        },
        status: {
          type: "string",
          enum: ["active", "deprecated", "archived", "draft"],
          description: "New status for the entity",
        },
        status_reason: {
          type: "string",
          description: "Optional reason for the status change",
        },
        branch_name: {
          type: "string",
          description: "Branch containing the entity. Defaults to 'main'.",
        },
      },
      required: ["entity_name", "status"],
    },
  },

  {
    name: "delete_entities",
    description:
      "Delete entities and automatically clean up related relationships.",
    inputSchema: {
      type: "object",
      properties: {
        entity_names: {
          type: "array",
          items: { type: "string" },
          description: "Array of entity names to delete",
        },
        branch_name: {
          type: "string",
          description: "Branch containing the entities. Defaults to 'main'.",
        },
      },
      required: ["entity_names"],
    },
  },

  // INTELLIGENT READ/SEARCH OPERATIONS
  {
    name: "smart_search",
    description:
      "AI-optimized intelligent search with relevance scoring, working context awareness, and automatic relationship expansion. Designed for AI agent workflows.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Search query to match against entity names, types, and observations",
        },
        branch_name: {
          type: "string",
          description:
            "Specific branch to search in. To search across all branches, use '*' as the branch name. Branch isolation is enforced by default.",
        },
        include_statuses: {
          type: "array",
          items: {
            type: "string",
            enum: ["active", "deprecated", "archived", "draft"],
          },
          description:
            "Entity statuses to include in results. Defaults to ['active'] only.",
        },
        include_context: {
          type: "boolean",
          description:
            "Automatically expand results with related entities and context (default: true). Helps AI agents get complete context.",
        },
        working_context_only: {
          type: "boolean",
          description:
            "Only return entities marked as part of current working context (default: false). Useful for focusing on active work.",
        },
        include_confidence_scores: {
          type: "boolean",
          description:
            "Include relevance scores and confidence metrics in response (default: true). Helps AI agents prioritize results.",
        },
        context_depth: {
          type: "integer",
          description:
            "How deep to automatically expand context (1-3, default: 2). Higher values include more related entities.",
          minimum: 1,
          maximum: 3,
        },
      },
      required: ["query", "branch_name"],
    },
  },

  {
    name: "read_memory_branch",
    description:
      "Read all entities and relationships from a memory branch with automatic context enhancement and cross-references.",
    inputSchema: {
      type: "object",
      properties: {
        branch_name: {
          type: "string",
          description: "Name of the branch to read. Defaults to 'main'.",
        },
        include_statuses: {
          type: "array",
          items: {
            type: "string",
            enum: ["active", "deprecated", "archived", "draft"],
          },
          description:
            "Entity statuses to include. Defaults to ['active'] only.",
        },
        include_auto_context: {
          type: "boolean",
          description:
            "Whether to automatically include related entities from other branches (default: true)",
        },
      },
    },
  },

  // AI CONTEXT RETRIEVAL TOOLS
  {
    name: "recall_working_context",
    description:
      "Get all entities currently marked as working context plus automatically related entities. Perfect for AI agents resuming work or getting current project state.",
    inputSchema: {
      type: "object",
      properties: {
        branch_name: {
          type: "string",
          description:
            "Memory branch to get working context from. Defaults to 'main'.",
        },
        include_related: {
          type: "boolean",
          description:
            "Automatically include entities related to working context (default: true). Provides comprehensive context for AI reasoning.",
        },
        max_related: {
          type: "integer",
          description:
            "Maximum number of related entities to include (default: 10). Controls context size for AI processing.",
          minimum: 1,
          maximum: 50,
        },
      },
    },
  },

  {
    name: "get_project_status",
    description:
      "Get structured summary of current project state across all branches. Shows active work areas, recent decisions, and project phase information optimized for AI understanding.",
    inputSchema: {
      type: "object",
      properties: {
        include_inactive: {
          type: "boolean",
          description:
            "Include branches not currently in focus (default: false). Useful for comprehensive project overview.",
        },
        detail_level: {
          type: "string",
          enum: ["summary", "detailed", "comprehensive"],
          description:
            "Amount of detail to include (default: 'summary'). Controls information density for AI processing.",
        },
      },
    },
  },

  {
    name: "find_dependencies",
    description:
      "Find entities that current work or specific entities depend on. Helps AI agents understand prerequisites and related context before making changes.",
    inputSchema: {
      type: "object",
      properties: {
        entity_names: {
          type: "array",
          items: { type: "string" },
          description:
            "Entity names to find dependencies for. If not provided, finds dependencies for all working context entities.",
        },
        branch_name: {
          type: "string",
          description: "Branch to search in. Defaults to 'main'.",
        },
        dependency_depth: {
          type: "integer",
          description:
            "How many levels deep to trace dependencies (1-3, default: 2). Higher values show indirect dependencies.",
          minimum: 1,
          maximum: 3,
        },
      },
    },
  },

  {
    name: "trace_decision_chain",
    description:
      "Follow the chain of decisions leading to current state. Shows decision history and rationale for AI agents to understand project evolution and avoid repeating mistakes.",
    inputSchema: {
      type: "object",
      properties: {
        entity_name: {
          type: "string",
          description:
            "Entity to trace decision history for. If not provided, shows recent decisions across working context.",
        },
        branch_name: {
          type: "string",
          description: "Branch to search in. Defaults to 'main'.",
        },
        max_decisions: {
          type: "integer",
          description:
            "Maximum number of decisions to include (default: 10). Controls response size for AI processing.",
          minimum: 1,
          maximum: 25,
        },
        time_window_days: {
          type: "integer",
          description:
            "Only include decisions from the last N days (default: 30). Focuses on recent project history.",
          minimum: 1,
          maximum: 365,
        },
      },
    },
  },

  // AI WORKFLOW MANAGEMENT TOOLS
  {
    name: "capture_decision",
    description:
      "Specialized tool for capturing decisions with full context, rationale, and impact analysis. Automatically creates structured decision entities optimized for AI reasoning.",
    inputSchema: {
      type: "object",
      properties: {
        decision_title: {
          type: "string",
          description: "Clear, descriptive title for the decision",
        },
        decision_rationale: {
          type: "string",
          description:
            "Detailed rationale explaining why this decision was made",
        },
        alternatives_considered: {
          type: "array",
          items: { type: "string" },
          description: "Alternative options that were considered but rejected",
        },
        impact_areas: {
          type: "array",
          items: { type: "string" },
          description:
            "Areas of the project that will be affected by this decision",
        },
        decision_maker: {
          type: "string",
          description: "Who made this decision (defaults to 'AI Agent')",
        },
        branch_name: {
          type: "string",
          description: "Branch to store the decision in. Defaults to 'main'.",
        },
        related_entities: {
          type: "array",
          items: { type: "string" },
          description: "Names of entities this decision relates to or affects",
        },
      },
      required: ["decision_title", "decision_rationale"],
    },
  },

  {
    name: "mark_current_work",
    description:
      "Set what the AI agent is actively focusing on. Updates working context flags and relevance scores to help with context management.",
    inputSchema: {
      type: "object",
      properties: {
        focus_entities: {
          type: "array",
          items: { type: "string" },
          description: "Entity names to mark as current working focus",
        },
        branch_name: {
          type: "string",
          description: "Branch containing the entities. Defaults to 'main'.",
        },
        focus_description: {
          type: "string",
          description:
            "Optional description of what you're working on for context",
        },
        clear_previous: {
          type: "boolean",
          description:
            "Whether to clear previous working context flags (default: true)",
        },
      },
      required: ["focus_entities"],
    },
  },

  {
    name: "update_project_status",
    description:
      "Update project phase and status across branches. Helps AI agents understand project lifecycle and adjust behavior accordingly.",
    inputSchema: {
      type: "object",
      properties: {
        branch_name: {
          type: "string",
          description: "Branch to update. Use '*' for all branches.",
        },
        project_phase: {
          type: "string",
          enum: ["planning", "active-development", "maintenance", "reference"],
          description: "New project phase for the branch",
        },
        status_updates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              entity_pattern: { type: "string" },
              new_status: {
                type: "string",
                enum: ["active", "deprecated", "archived", "draft"],
              },
              reason: { type: "string" },
            },
            required: ["entity_pattern", "new_status"],
          },
          description: "Batch status updates for entities matching patterns",
        },
      },
      required: ["branch_name", "project_phase"],
    },
  },

  {
    name: "archive_completed_work",
    description:
      "Archive completed work while preserving relationships and decision history. Moves entities to archived status but maintains links for future reference.",
    inputSchema: {
      type: "object",
      properties: {
        entity_names: {
          type: "array",
          items: { type: "string" },
          description: "Entities to archive as completed work",
        },
        branch_name: {
          type: "string",
          description: "Branch containing the entities. Defaults to 'main'.",
        },
        completion_summary: {
          type: "string",
          description: "Summary of what was completed for future reference",
        },
        preserve_relationships: {
          type: "boolean",
          description:
            "Keep relationships intact for historical context (default: true)",
        },
      },
      required: ["entity_names"],
    },
  },

  {
    name: "suggest_related_context",
    description:
      "Analyze current query or work area and recommend related entities that might be helpful. Provides AI agents with proactive context suggestions.",
    inputSchema: {
      type: "object",
      properties: {
        current_focus: {
          type: "string",
          description:
            "Description of what you're currently working on or thinking about",
        },
        entity_names: {
          type: "array",
          items: { type: "string" },
          description:
            "Specific entities to find related context for. If not provided, uses working context.",
        },
        branch_name: {
          type: "string",
          description: "Branch to search in. Defaults to 'main'.",
        },
        suggestion_types: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "similar",
              "dependencies",
              "decisions",
              "blockers",
              "related_work",
            ],
          },
          description: "Types of suggestions to provide (default: all types)",
        },
        max_suggestions: {
          type: "integer",
          description: "Maximum number of suggestions to return (default: 10)",
          minimum: 1,
          maximum: 25,
        },
      },
      required: ["current_focus"],
    },
  },

  {
    name: "check_missing_dependencies",
    description:
      "Analyze current work and warn about missing context or dependencies. Helps AI agents avoid working on incomplete information.",
    inputSchema: {
      type: "object",
      properties: {
        work_description: {
          type: "string",
          description: "Description of the work you're planning to do",
        },
        entity_names: {
          type: "array",
          items: { type: "string" },
          description:
            "Entities involved in the work. If not provided, uses working context.",
        },
        branch_name: {
          type: "string",
          description: "Branch to analyze. Defaults to 'main'.",
        },
        check_depth: {
          type: "integer",
          description: "How deep to check for dependencies (1-3, default: 2)",
          minimum: 1,
          maximum: 3,
        },
      },
      required: ["work_description"],
    },
  },

  {
    name: "get_continuation_context",
    description:
      "Perfect for resuming interrupted work. Gets all context needed to continue where you left off, including recent decisions, current status, and next steps.",
    inputSchema: {
      type: "object",
      properties: {
        work_session_id: {
          type: "string",
          description:
            "Optional identifier for the work session to resume. If not provided, gets general continuation context.",
        },
        branch_name: {
          type: "string",
          description:
            "Branch to get continuation context from. Defaults to 'main'.",
        },
        time_window_hours: {
          type: "integer",
          description: "Hours to look back for recent activity (default: 24)",
          minimum: 1,
          maximum: 168,
        },
        include_blockers: {
          type: "boolean",
          description: "Include current blockers and issues (default: true)",
        },
      },
    },
  },

  // WORKSPACE INTEGRATION TOOLS
  {
    name: "sync_with_workspace",
    description:
      "Relate memory entities to current workspace files and folders. Helps AI agents understand project structure and connect memory to actual codebase.",
    inputSchema: {
      type: "object",
      properties: {
        workspace_path: {
          type: "string",
          description:
            "Path to workspace root. If not provided, uses MEMORY_PATH environment variable.",
        },
        file_patterns: {
          type: "array",
          items: { type: "string" },
          description:
            "File patterns to analyze (e.g., '*.ts', '*.md'). Defaults to common development files.",
        },
        branch_name: {
          type: "string",
          description:
            "Branch to store workspace-related entities. Defaults to 'main'.",
        },
        create_structure_entities: {
          type: "boolean",
          description:
            "Create entities for major folders and important files (default: true).",
        },
        link_existing_entities: {
          type: "boolean",
          description:
            "Try to link existing entities to workspace files (default: true).",
        },
      },
    },
  },

  {
    name: "workspace_context_bridge",
    description:
      "Connect memory entities with current IDE context. Helps AI agents understand which entities relate to files you're currently working on.",
    inputSchema: {
      type: "object",
      properties: {
        current_files: {
          type: "array",
          items: { type: "string" },
          description:
            "List of files currently open or being worked on in the IDE.",
        },
        branch_name: {
          type: "string",
          description:
            "Branch to search for related entities. Defaults to 'main'.",
        },
        context_radius: {
          type: "integer",
          description:
            "How broadly to search for related context (1-3, default: 2)",
          minimum: 1,
          maximum: 3,
        },
      },
      required: ["current_files"],
    },
  },

  {
    name: "detect_project_patterns",
    description:
      "Analyze workspace structure to suggest how to organize memory entities. Identifies project patterns and recommends memory branch structure.",
    inputSchema: {
      type: "object",
      properties: {
        workspace_path: {
          type: "string",
          description:
            "Path to workspace root. If not provided, uses MEMORY_PATH environment variable.",
        },
        analysis_depth: {
          type: "integer",
          description: "How deep to analyze folder structure (1-3, default: 2)",
          minimum: 1,
          maximum: 3,
        },
        suggest_branches: {
          type: "boolean",
          description:
            "Suggest memory branch organization based on project structure (default: true).",
        },
        create_suggested_branches: {
          type: "boolean",
          description:
            "Automatically create suggested branches (default: false).",
        },
      },
    },
  },

  // ML-BASED PROJECT ANALYSIS TOOLS FOR IDE AGENTS

  {
    name: "analyze_project_structure",
    description:
      "Perform comprehensive analysis of project structure, interfaces, and dependencies using ML-based semantic understanding. Optimized for IDE agent context comprehension.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: {
          type: "string",
          description: "Path to the project root directory to analyze",
        },
        branch_name: {
          type: "string",
          description: "Memory branch to store analysis results",
        },
        include_interfaces: {
          type: "boolean",
          description:
            "Whether to include detailed TypeScript/JavaScript interface analysis",
          default: true,
        },
        include_dependencies: {
          type: "boolean",
          description:
            "Whether to analyze project dependencies and import/export relationships",
          default: true,
        },
        analysis_depth: {
          type: "string",
          enum: ["basic", "detailed", "comprehensive"],
          description: "Depth of semantic analysis to perform",
          default: "detailed",
        },
      },
      required: ["project_path"],
    },
  },

  {
    name: "find_interface_usage",
    description:
      "Locate all usages of specific interfaces or types across the project using semantic code analysis. Finds implementations, extensions, and references. Optimized for IDE agent code comprehension.",
    inputSchema: {
      type: "object",
      properties: {
        interface_name: {
          type: "string",
          description: "Name of the interface or type to search for",
        },
        search_scope: {
          type: "string",
          enum: ["current_file", "current_module", "entire_project"],
          description: "Scope of the semantic search",
          default: "entire_project",
        },
        include_implementations: {
          type: "boolean",
          description:
            "Include classes/components that implement the interface",
          default: true,
        },
        include_related_interfaces: {
          type: "boolean",
          description: "Include interfaces that extend or use this interface",
          default: true,
        },
        branch_name: {
          type: "string",
          description: "Memory branch to search within",
        },
      },
      required: ["interface_name"],
    },
  },

  {
    name: "suggest_project_context",
    description:
      "Get intelligent context suggestions for current development work using ML semantic analysis. Proactively suggests related interfaces, imports, and code patterns. Designed for optimal IDE agent integration.",
    inputSchema: {
      type: "object",
      properties: {
        current_file: {
          type: "string",
          description: "Path to the file currently being worked on",
        },
        search_query: {
          type: "string",
          description: "Current search query or task description",
        },
        active_interfaces: {
          type: "array",
          items: { type: "string" },
          description: "List of interfaces currently being worked with",
        },
        working_entities: {
          type: "array",
          items: { type: "string" },
          description: "List of entity names from current working context",
        },
        suggestion_types: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "interface_context",
              "import_suggestion",
              "dependency_prediction",
              "related_component",
              "monorepo_module",
              "api_integration",
            ],
          },
          description: "Types of semantic suggestions to generate",
        },
        session_id: {
          type: "string",
          description: "Session ID for context tracking",
        },
      },
    },
  },

  {
    name: "navigate_codebase",
    description:
      "Intelligent codebase navigation based on feature requirements and context. Uses TensorFlow.js embeddings and semantic similarity to understand code relationships and suggest relevant files for IDE agents.",
    inputSchema: {
      type: "object",
      properties: {
        feature_description: {
          type: "string",
          description: "Description of the feature or requirement to work on",
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
          description: "Goal of the semantic navigation",
        },
        starting_point: {
          type: "string",
          description: "File path or entity name to start navigation from",
        },
        max_results: {
          type: "number",
          description: "Maximum number of navigation results to return",
          default: 20,
        },
        include_confidence_scores: {
          type: "boolean",
          description:
            "Include ML confidence scores for navigation suggestions",
          default: true,
        },
        branch_name: {
          type: "string",
          description: "Memory branch to search within",
        },
      },
      required: ["feature_description", "navigation_goal"],
    },
  },

  {
    name: "train_project_model",
    description:
      "Trigger incremental training of the project-specific TensorFlow.js model. Improves semantic understanding of your specific codebase patterns for better IDE agent context retrieval.",
    inputSchema: {
      type: "object",
      properties: {
        training_trigger: {
          type: "string",
          enum: [
            "manual",
            "scheduled",
            "threshold_reached",
            "new_data_available",
          ],
          description: "Reason for triggering training",
          default: "manual",
        },
        training_config: {
          type: "object",
          properties: {
            epochs: {
              type: "number",
              description: "Number of training epochs",
              default: 10,
            },
            learning_rate: {
              type: "number",
              description: "Learning rate for training",
              default: 0.001,
            },
            batch_size: {
              type: "number",
              description: "Training batch size",
              default: 16,
            },
          },
        },
        include_recent_data: {
          type: "boolean",
          description: "Include recently collected training data",
          default: true,
        },
        validation_split: {
          type: "number",
          description: "Fraction of data to use for validation",
          default: 0.2,
        },
      },
    },
  },

  {
    name: "generate_interface_embedding",
    description:
      "Generate enhanced embeddings for interfaces using project-specific TensorFlow.js models. Creates vector representations optimized for IDE agent semantic understanding and code relationship detection.",
    inputSchema: {
      type: "object",
      properties: {
        interface_names: {
          type: "array",
          items: { type: "string" },
          description: "Names of interfaces to generate embeddings for",
        },
        include_context: {
          type: "boolean",
          description:
            "Include surrounding code context in embedding generation",
          default: true,
        },
        semantic_type: {
          type: "string",
          enum: [
            "interface_definition",
            "api_endpoint",
            "component_props",
            "state_interface",
            "data_model",
          ],
          description: "Semantic type of the interface for optimized embedding",
        },
        update_database: {
          type: "boolean",
          description: "Store generated embeddings in the database",
          default: true,
        },
        branch_name: {
          type: "string",
          description: "Memory branch to work within",
        },
      },
      required: ["interface_names"],
    },
  },

  {
    name: "find_similar_code",
    description:
      "Find similar code patterns using TensorFlow.js semantic analysis. Uses ML embeddings to understand code similarity beyond text matching, optimized for IDE agent code comprehension and pattern recognition.",
    inputSchema: {
      type: "object",
      properties: {
        code_snippet: {
          type: "string",
          description: "Code snippet to find similar patterns for",
        },
        search_type: {
          type: "string",
          enum: [
            "interface",
            "function",
            "component",
            "pattern",
            "implementation",
          ],
          description: "Type of code element to search for",
        },
        similarity_threshold: {
          type: "number",
          description: "Minimum ML similarity score (0-1)",
          default: 0.7,
        },
        max_results: {
          type: "number",
          description: "Maximum number of similar code patterns to return",
          default: 10,
        },
        include_reasoning: {
          type: "boolean",
          description:
            "Include ML reasoning for why code is considered similar",
          default: true,
        },
        search_scope: {
          type: "string",
          enum: ["current_project", "similar_projects", "code_examples"],
          description: "Scope of semantic similarity search",
          default: "current_project",
        },
        branch_name: {
          type: "string",
          description: "Memory branch to search within",
        },
      },
      required: ["code_snippet", "search_type"],
    },
  },

  {
    name: "backfill_embeddings",
    description:
      "Generate embeddings for existing files and interfaces that don't have them yet. Handles database migration/upgrade scenarios. Useful when upgrading to a version with vector database support or when data was added without embeddings.",
    inputSchema: {
      type: "object",
      properties: {
        file_limit: {
          type: "number",
          description: "Maximum number of files to process in this batch",
          default: 100,
        },
        interface_limit: {
          type: "number",
          description: "Maximum number of interfaces to process in this batch",
          default: 100,
        },
      },
    },
  },

  // Qt/QML-specific tools for analyzing C++ bindings and architecture layers
  {
    name: "analyze_qml_bindings",
    description:
      "Analyze QML bindings for a specific C++ class. Finds all Q_PROPERTY declarations, Q_INVOKABLE methods, signals, and QML_ELEMENT registrations. Shows what properties and methods are exposed to QML and where they're used in QML files.",
    inputSchema: {
      type: "object",
      properties: {
        class_name: {
          type: "string",
          description:
            "Name of the C++ class to analyze (e.g., 'UserController', 'MyNamespace::DataService')",
        },
        include_usage: {
          type: "boolean",
          description:
            "Include QML files that use this class's properties and methods",
          default: true,
        },
        branch_name: {
          type: "string",
          description: "Memory branch to search within. Defaults to 'main'.",
        },
      },
      required: ["class_name"],
    },
  },

  {
    name: "find_qt_controllers",
    description:
      "Find all C++ classes registered with QML (QML_ELEMENT, qmlRegisterType, etc.). Identifies the Controller layer in Qt/QML architecture that exposes business logic to the UI layer.",
    inputSchema: {
      type: "object",
      properties: {
        include_properties: {
          type: "boolean",
          description: "Include Q_PROPERTY count for each controller",
          default: true,
        },
        include_invokables: {
          type: "boolean",
          description: "Include Q_INVOKABLE method count for each controller",
          default: true,
        },
        namespace_filter: {
          type: "string",
          description:
            "Filter controllers by namespace (e.g., 'App::Controllers')",
        },
        branch_name: {
          type: "string",
          description: "Memory branch to search within. Defaults to 'main'.",
        },
      },
    },
  },

  {
    name: "analyze_layer_architecture",
    description:
      "Analyze the three-layer Qt/QML architecture (Service → Controller → UI). Maps relationships between business logic services (C++), controllers that expose data to QML, and UI components (QML files). Helps ensure proper separation of concerns.",
    inputSchema: {
      type: "object",
      properties: {
        layer_focus: {
          type: "string",
          enum: ["service", "controller", "ui", "all"],
          description: "Which layer to focus the analysis on",
          default: "all",
        },
        show_violations: {
          type: "boolean",
          description:
            "Show architectural violations (e.g., QML with business logic, Services directly accessed from QML)",
          default: true,
        },
        branch_name: {
          type: "string",
          description: "Memory branch to search within. Defaults to 'main'.",
        },
      },
    },
  },

  {
    name: "find_qml_usage",
    description:
      "Find all QML files that use a specific C++ controller or component. Shows property bindings, method calls, and signal connections in QML.",
    inputSchema: {
      type: "object",
      properties: {
        controller_name: {
          type: "string",
          description: "Name of the C++ controller/component to find usage for",
        },
        usage_type: {
          type: "string",
          enum: ["property", "method", "signal", "all"],
          description: "Type of usage to find",
          default: "all",
        },
        branch_name: {
          type: "string",
          description: "Memory branch to search within. Defaults to 'main'.",
        },
      },
      required: ["controller_name"],
    },
  },

  {
    name: "list_q_properties",
    description:
      "List all Q_PROPERTY declarations across the codebase or for a specific class. Shows property type, READ/WRITE/NOTIFY functions, and where each property is used in QML files.",
    inputSchema: {
      type: "object",
      properties: {
        class_name: {
          type: "string",
          description: "Optional: Filter by specific class name",
        },
        property_type: {
          type: "string",
          description:
            "Optional: Filter by property type (e.g., 'QString', 'int', 'QObject*')",
        },
        include_qml_usage: {
          type: "boolean",
          description: "Include QML files that access each property",
          default: true,
        },
        branch_name: {
          type: "string",
          description: "Memory branch to search within. Defaults to 'main'.",
        },
      },
    },
  },

  {
    name: "list_q_invokables",
    description:
      "List all Q_INVOKABLE methods across the codebase or for a specific class. Shows method signatures, parameters, return types, and where each method is called from QML.",
    inputSchema: {
      type: "object",
      properties: {
        class_name: {
          type: "string",
          description: "Optional: Filter by specific class name",
        },
        include_qml_calls: {
          type: "boolean",
          description: "Include QML files that call each method",
          default: true,
        },
        branch_name: {
          type: "string",
          description: "Memory branch to search within. Defaults to 'main'.",
        },
      },
    },
  },
];
