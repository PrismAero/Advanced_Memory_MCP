import { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * Smart Memory Tools - lean, consolidated surface area.
 *
 * Previously this server exposed 38 tools. Many were either non-functional
 * stubs (find_interface_usage, navigate_codebase, the six Qt/QML tools
 * which depended on an Entity.metadata field that is never populated) or
 * heavily overlapping (four context tools, four workspace tools, three
 * embeddings tools, two status tools).
 *
 * Tools have been consolidated into mode/action-dispatched groups:
 *   - get_context        (working | continuation | related | project)
 *   - analyze_workspace  (sync | bridge | patterns | structure)
 *   - embeddings         (generate | find_similar | backfill)
 *   - update_status      (phase | archive)
 *
 * Qt/QML tools remain available behind ENABLE_QT_TOOLS=1 for projects
 * that actually populate file metadata, but are hidden by default.
 */
const QT_TOOLS_ENABLED =
  process.env.ENABLE_QT_TOOLS === "1" || process.env.ENABLE_QT_TOOLS === "true";

const CORE_TOOLS: Tool[] = [
  // ---------- branch management ----------
  {
    name: "list_memory_branches",
    description:
      "List all memory branches with statistics: name, purpose, entity count, last updated.",
    inputSchema: { type: "object", properties: {} },
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
          description: "What this branch will contain",
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
        branch_name: { type: "string", description: "Branch to delete" },
      },
      required: ["branch_name"],
    },
  },

  // ---------- entity CRUD ----------
  {
    name: "create_entities",
    description:
      "Create new entities. Auto-suggests a branch when none is provided. By default similarity-based relation detection is queued in the background; pass `sync_relations: true` to run it inline.",
    inputSchema: {
      type: "object",
      properties: {
        entities: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              entityType: { type: "string" },
              observations: { type: "array", items: { type: "string" } },
              status: {
                type: "string",
                enum: ["active", "deprecated", "archived", "draft"],
              },
            },
            required: ["name", "entityType", "observations"],
          },
        },
        branch_name: {
          type: "string",
          description:
            "Branch to store entities in. Leave empty for auto-suggestion based on entity type.",
        },
        auto_create_relations: {
          type: "boolean",
          description: "Whether to detect related entities (default: true).",
        },
        sync_relations: {
          type: "boolean",
          description:
            "Run similarity detection synchronously and create relations inline. Default false (deferred to background indexer).",
        },
      },
      required: ["entities"],
    },
  },
  {
    name: "add_observations",
    description: "Add new observations to existing entities.",
    inputSchema: {
      type: "object",
      properties: {
        observations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              entityName: { type: "string" },
              contents: { type: "array", items: { type: "string" } },
            },
            required: ["entityName", "contents"],
          },
        },
        branch_name: { type: "string", description: "Defaults to 'main'." },
      },
      required: ["observations"],
    },
  },
  {
    name: "update_entity_status",
    description: "Update the status of a single entity with optional reason.",
    inputSchema: {
      type: "object",
      properties: {
        entity_name: { type: "string" },
        status: {
          type: "string",
          enum: ["active", "deprecated", "archived", "draft"],
        },
        status_reason: { type: "string" },
        branch_name: { type: "string" },
      },
      required: ["entity_name", "status"],
    },
  },
  {
    name: "delete_entities",
    description: "Delete entities and clean up related relationships.",
    inputSchema: {
      type: "object",
      properties: {
        entity_names: { type: "array", items: { type: "string" } },
        branch_name: { type: "string" },
      },
      required: ["entity_names"],
    },
  },

  // ---------- search / read ----------
  {
    name: "smart_search",
    description:
      "Search entities by name, type, content, and observations with relevance-aware ranking. Returns sanitized entities (no embedding vectors). Use branch_name='*' to search across all branches.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        branch_name: {
          type: "string",
          description: "Specific branch, or '*' for all branches.",
        },
        include_statuses: {
          type: "array",
          items: {
            type: "string",
            enum: ["active", "deprecated", "archived", "draft"],
          },
          description: "Defaults to ['active'].",
        },
        include_context: {
          type: "boolean",
          description: "Auto-expand with related entities (default: true).",
        },
        working_context_only: {
          type: "boolean",
          description: "Only return entities flagged as working context.",
        },
        include_confidence_scores: {
          type: "boolean",
          description: "Include similarity / confidence metadata.",
        },
        max_observations: {
          type: "integer",
          description: "Cap observations per entity (default: 5, 0 = no cap).",
        },
      },
      required: ["query", "branch_name"],
    },
  },
  {
    name: "read_memory_branch",
    description: "Read all entities and relations from a branch.",
    inputSchema: {
      type: "object",
      properties: {
        branch_name: { type: "string", description: "Defaults to 'main'." },
        include_statuses: {
          type: "array",
          items: {
            type: "string",
            enum: ["active", "deprecated", "archived", "draft"],
          },
        },
        include_auto_context: {
          type: "boolean",
          description:
            "Include related entities from other branches (default: true).",
        },
        max_observations: {
          type: "integer",
          description: "Cap observations per entity (default: 5).",
        },
      },
    },
  },

  // ---------- consolidated context retrieval ----------
  {
    name: "get_context",
    description:
      "Unified context retrieval. Modes: 'working' (entities flagged as working context + related), 'continuation' (resume work: working set + recent activity + decisions + blockers + next steps), 'related' (entities related to a focus description), 'project' (ML-driven suggestions for current file/query).",
    inputSchema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["working", "continuation", "related", "project"],
          description: "Which context view to return (default: 'working').",
        },
        branch_name: { type: "string", description: "Defaults to 'main'." },
        include_related: {
          type: "boolean",
          description: "[working] include related entities (default: true).",
        },
        max_related: {
          type: "integer",
          description: "[working] max related entities (default: 10).",
        },
        time_window_hours: {
          type: "integer",
          description: "[continuation] hours to look back (default: 24).",
        },
        include_blockers: {
          type: "boolean",
          description:
            "[continuation] include current blockers (default: true).",
        },
        current_focus: {
          type: "string",
          description: "[related] description of what you're working on.",
        },
        entity_names: {
          type: "array",
          items: { type: "string" },
          description: "[related] target entities.",
        },
        max_suggestions: {
          type: "integer",
          description: "[related] max suggestions (default: 10).",
        },
        current_file: {
          type: "string",
          description: "[project] file currently being worked on.",
        },
        search_query: {
          type: "string",
          description: "[project] task description.",
        },
        active_interfaces: {
          type: "array",
          items: { type: "string" },
          description: "[project] interfaces in use.",
        },
        session_id: {
          type: "string",
          description: "[project] session id for tracking.",
        },
        max_observations: {
          type: "integer",
          description: "Cap observations per entity (default: 5).",
        },
      },
    },
  },

  // ---------- project status overview ----------
  {
    name: "get_project_status",
    description:
      "Structured summary of project state across branches: entity counts, working entities, recent decisions per branch.",
    inputSchema: {
      type: "object",
      properties: {
        include_inactive: {
          type: "boolean",
          description: "Include inactive branches (default: false).",
        },
        detail_level: {
          type: "string",
          enum: ["summary", "detailed", "comprehensive"],
          description: "Detail level (default: 'summary').",
        },
      },
    },
  },

  // ---------- decision tracing & dependencies ----------
  {
    name: "find_dependencies",
    description:
      "Walk the relations graph (depends_on / requires / uses / needs / imports / extends / implements) to find entities the targets depend on.",
    inputSchema: {
      type: "object",
      properties: {
        entity_names: {
          type: "array",
          items: { type: "string" },
          description: "Targets. Empty = use working context.",
        },
        branch_name: { type: "string" },
        dependency_depth: { type: "integer", minimum: 1, maximum: 3 },
      },
    },
  },
  {
    name: "trace_decision_chain",
    description:
      "Decisions related to an entity (via affects/decides/depends_on relations) or recent decisions across the branch.",
    inputSchema: {
      type: "object",
      properties: {
        entity_name: {
          type: "string",
          description: "If omitted, returns recent decisions branch-wide.",
        },
        branch_name: { type: "string" },
        max_decisions: { type: "integer", minimum: 1, maximum: 25 },
        time_window_days: { type: "integer", minimum: 1, maximum: 365 },
      },
    },
  },

  // ---------- workflow ----------
  {
    name: "capture_decision",
    description:
      "Create a structured decision entity with rationale, alternatives, impact areas, and 'affects' relations to related entities.",
    inputSchema: {
      type: "object",
      properties: {
        decision_title: { type: "string" },
        decision_rationale: { type: "string" },
        alternatives_considered: { type: "array", items: { type: "string" } },
        impact_areas: { type: "array", items: { type: "string" } },
        decision_maker: { type: "string" },
        branch_name: { type: "string" },
        related_entities: { type: "array", items: { type: "string" } },
      },
      required: ["decision_title", "decision_rationale"],
    },
  },
  {
    name: "mark_current_work",
    description:
      "Set entities as current working context. Boosts relevance score and updates last_accessed; optionally clears previous working context.",
    inputSchema: {
      type: "object",
      properties: {
        focus_entities: { type: "array", items: { type: "string" } },
        branch_name: { type: "string" },
        focus_description: { type: "string" },
        clear_previous: { type: "boolean", description: "Default: true." },
      },
      required: ["focus_entities"],
    },
  },
  {
    name: "update_status",
    description:
      "Unified status mutation. mode='phase': update branch project_phase and bulk-apply entity status updates by pattern. mode='archive': archive the given entities, optionally with a completion summary entity, while preserving relations.",
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["phase", "archive"] },
        // archive mode
        entity_names: {
          type: "array",
          items: { type: "string" },
          description: "[archive] entities to archive.",
        },
        completion_summary: {
          type: "string",
          description: "[archive] summary text.",
        },
        preserve_relationships: {
          type: "boolean",
          description: "[archive] default: true.",
        },
        // phase mode
        branch_name: {
          type: "string",
          description:
            "[phase] branch name, or '*' for all branches. Also accepted in archive mode.",
        },
        project_phase: {
          type: "string",
          enum: ["planning", "active-development", "maintenance", "reference"],
          description: "[phase] new phase.",
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
          description: "[phase] bulk status updates.",
        },
      },
    },
  },
  {
    name: "check_missing_dependencies",
    description:
      "Scan observations of working/specified entities for explicit dependency keywords (depends/requires/needs). Returns identified mentions, no fabricated entries.",
    inputSchema: {
      type: "object",
      properties: {
        work_description: { type: "string" },
        entity_names: { type: "array", items: { type: "string" } },
        branch_name: { type: "string" },
      },
      required: ["work_description"],
    },
  },

  // ---------- workspace ----------
  {
    name: "analyze_workspace",
    description:
      "Workspace integration. Modes: 'sync' (create folder/file structure entities and link existing entities), 'bridge' (connect open files to related entities), 'patterns' (detect project type / architecture and suggest branches), 'structure' (start background project monitoring + create structure entities).",
    inputSchema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["sync", "bridge", "patterns", "structure"],
          description: "Default: 'sync'.",
        },
        workspace_path: {
          type: "string",
          description: "Defaults to MEMORY_PATH or cwd.",
        },
        project_path: {
          type: "string",
          description: "[structure] alias of workspace_path.",
        },
        branch_name: { type: "string" },
        file_patterns: { type: "array", items: { type: "string" } },
        create_structure_entities: { type: "boolean" },
        link_existing_entities: { type: "boolean" },
        current_files: {
          type: "array",
          items: { type: "string" },
          description: "[bridge].",
        },
        context_radius: {
          type: "integer",
          minimum: 1,
          maximum: 3,
          description: "[bridge].",
        },
        analysis_depth: {
          type: "integer",
          minimum: 1,
          maximum: 3,
          description: "[patterns].",
        },
        suggest_branches: { type: "boolean", description: "[patterns]." },
        create_suggested_branches: {
          type: "boolean",
          description: "[patterns].",
        },
      },
    },
  },

  // ---------- ML ----------
  {
    name: "train_project_model",
    description: "Trigger incremental training of the project-specific model.",
    inputSchema: {
      type: "object",
      properties: {
        epochs: { type: "number", description: "Default: 10." },
        learning_rate: { type: "number", description: "Default: 0.001." },
        batch_size: { type: "number", description: "Default: 16." },
        training_config: {
          type: "object",
          description:
            "Alternative nested form (epochs/learning_rate/batch_size).",
        },
      },
    },
  },
  {
    name: "embeddings",
    description:
      "Embedding operations. action='generate': generate embeddings for named interfaces. action='find_similar': semantic code-similarity search for a snippet. action='backfill': fill in embeddings for files/interfaces that don't have them yet.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["generate", "find_similar", "backfill"],
          description: "Default: 'find_similar'.",
        },
        interface_names: {
          type: "array",
          items: { type: "string" },
          description: "[generate].",
        },
        code_snippet: { type: "string", description: "[find_similar]." },
        limit: {
          type: "number",
          description: "[find_similar] max results (default: 5).",
        },
        file_limit: {
          type: "number",
          description: "[backfill] max files (default: 100).",
        },
        interface_limit: {
          type: "number",
          description: "[backfill] max interfaces (default: 100).",
        },
      },
    },
  },
];

const QT_TOOLS: Tool[] = [
  {
    name: "analyze_qml_bindings",
    description:
      "[Qt/QML] Analyze QML bindings for a specific C++ class: Q_PROPERTY, Q_INVOKABLE, signals, QML_ELEMENT registrations and their QML usage. Requires entities populated with file metadata (ENABLE_QT_TOOLS=1).",
    inputSchema: {
      type: "object",
      properties: {
        class_name: { type: "string" },
        include_usage: { type: "boolean" },
        branch_name: { type: "string" },
      },
      required: ["class_name"],
    },
  },
  {
    name: "find_qt_controllers",
    description: "[Qt/QML] Find C++ classes registered with QML.",
    inputSchema: {
      type: "object",
      properties: {
        include_properties: { type: "boolean" },
        include_invokables: { type: "boolean" },
        namespace_filter: { type: "string" },
        branch_name: { type: "string" },
      },
    },
  },
  {
    name: "analyze_layer_architecture",
    description:
      "[Qt/QML] Analyze the Service → Controller → UI layer relationships.",
    inputSchema: {
      type: "object",
      properties: {
        layer_focus: {
          type: "string",
          enum: ["service", "controller", "ui", "all"],
        },
        show_violations: { type: "boolean" },
        branch_name: { type: "string" },
      },
    },
  },
  {
    name: "find_qml_usage",
    description: "[Qt/QML] Find QML files using a specific C++ controller.",
    inputSchema: {
      type: "object",
      properties: {
        controller_name: { type: "string" },
        usage_type: {
          type: "string",
          enum: ["property", "method", "signal", "all"],
        },
        branch_name: { type: "string" },
      },
      required: ["controller_name"],
    },
  },
  {
    name: "list_q_properties",
    description: "[Qt/QML] List Q_PROPERTY declarations.",
    inputSchema: {
      type: "object",
      properties: {
        class_name: { type: "string" },
        property_type: { type: "string" },
        include_qml_usage: { type: "boolean" },
        branch_name: { type: "string" },
      },
    },
  },
  {
    name: "list_q_invokables",
    description: "[Qt/QML] List Q_INVOKABLE methods.",
    inputSchema: {
      type: "object",
      properties: {
        class_name: { type: "string" },
        include_qml_calls: { type: "boolean" },
        branch_name: { type: "string" },
      },
    },
  },
];

export const SMART_MEMORY_TOOLS: Tool[] = QT_TOOLS_ENABLED
  ? [...CORE_TOOLS, ...QT_TOOLS]
  : CORE_TOOLS;

export const QT_TOOLS_REGISTERED = QT_TOOLS_ENABLED;
