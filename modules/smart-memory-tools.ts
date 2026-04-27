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
 *
 * Tool descriptions follow a consistent pattern so an LLM agent can
 * route correctly on first try:
 *   <verb-led one-line action>. Use when <decision boundary>.
 *   Returns <shape>. <Important defaults or caveats>.
 */
const QT_TOOLS_ENABLED =
  process.env.ENABLE_QT_TOOLS === "1" || process.env.ENABLE_QT_TOOLS === "true";

const CORE_TOOLS: Tool[] = [
  // ---------- branch management ----------
  {
    name: "list_memory_branches",
    description:
      "List all memory branches with name, purpose, entity count, and last-updated time. Use to discover what knowledge already exists before creating a new branch or to pick a target branch for a write. Returns an array of branch summaries.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "create_memory_branch",
    description:
      "Create a new memory branch to scope knowledge by topic, project, or domain. Use when an existing branch (see list_memory_branches) does not fit the new subject area; otherwise add to an existing branch. Branch names should be short and lowercase-hyphenated.",
    inputSchema: {
      type: "object",
      properties: {
        branch_name: {
          type: "string",
          description: "Short slug, e.g. 'auth' or 'billing-service'.",
        },
        purpose: {
          type: "string",
          description:
            "One-sentence description of what this branch will contain.",
        },
      },
      required: ["branch_name"],
    },
  },
  {
    name: "delete_memory_branch",
    description:
      "Permanently delete a memory branch and every entity in it. Use only when retiring an obsolete topic; prefer update_status with mode='archive' to preserve history. The 'main' branch cannot be deleted.",
    inputSchema: {
      type: "object",
      properties: {
        branch_name: {
          type: "string",
          description: "Branch to delete (cannot be 'main').",
        },
      },
      required: ["branch_name"],
    },
  },

  // ---------- entity CRUD ----------
  {
    name: "create_entities",
    description:
      "Create one or more knowledge entities (facts, decisions, components, patterns, etc.). Use whenever you have new information worth remembering across sessions. If branch_name is omitted, a branch is auto-suggested from entity types. Similarity-based relation detection runs in the background by default; set sync_relations=true only when you need related-entity links in the response.",
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
                description: "Unique within the branch.",
              },
              entityType: {
                type: "string",
                description:
                  "Free-form category, e.g. 'component', 'decision', 'pattern', 'fact'.",
              },
              observations: {
                type: "array",
                items: { type: "string" },
                description: "Atomic facts/notes about the entity.",
              },
              status: {
                type: "string",
                enum: ["active", "deprecated", "archived", "draft"],
                description: "Defaults to 'active'.",
              },
            },
            required: ["name", "entityType", "observations"],
          },
        },
        branch_name: {
          type: "string",
          description:
            "Target branch. Leave empty to auto-suggest based on entity type.",
        },
        auto_create_relations: {
          type: "boolean",
          description:
            "Detect and create related-entity links (default: true).",
        },
        sync_relations: {
          type: "boolean",
          description:
            "Run similarity detection inline instead of deferring to the background indexer. Default false. Slower but returns related-entity links in the same response.",
        },
      },
      required: ["entities"],
    },
  },
  {
    name: "add_observations",
    description:
      "Append new observation strings to existing entities. Use when learning incremental facts about something you have already captured (do not re-create the entity). Observations are stored in insertion order.",
    inputSchema: {
      type: "object",
      properties: {
        observations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              entityName: { type: "string" },
              contents: {
                type: "array",
                items: { type: "string" },
                description: "New observation strings to append.",
              },
            },
            required: ["entityName", "contents"],
          },
        },
        branch_name: {
          type: "string",
          description: "Branch the entities live in. Defaults to 'main'.",
        },
      },
      required: ["observations"],
    },
  },
  {
    name: "update_entity_status",
    description:
      "Change the status of a single entity (active / deprecated / archived / draft) with an optional reason. Use for one-off transitions; for bulk pattern-based changes use update_status with mode='phase'.",
    inputSchema: {
      type: "object",
      properties: {
        entity_name: { type: "string" },
        status: {
          type: "string",
          enum: ["active", "deprecated", "archived", "draft"],
        },
        status_reason: {
          type: "string",
          description: "Short human-readable reason for the change.",
        },
        branch_name: { type: "string", description: "Defaults to 'main'." },
      },
      required: ["entity_name", "status"],
    },
  },
  {
    name: "delete_entities",
    description:
      "Permanently delete the named entities and any relations that touch them. Use only when the data is genuinely wrong or duplicated; for completed work prefer update_status with mode='archive' so the history remains queryable.",
    inputSchema: {
      type: "object",
      properties: {
        entity_names: { type: "array", items: { type: "string" } },
        branch_name: { type: "string", description: "Defaults to 'main'." },
      },
      required: ["entity_names"],
    },
  },

  // ---------- search / read ----------
  {
    name: "smart_search",
    description:
      "Search entities by name, type, content, and observations with relevance-aware ranking. Use as the default targeted lookup tool when you have a query string or topic. Pass branch_name='*' to search every branch. Returns compact AI-optimized hits: name/type/status, score, why, obs, meta. Opt into include_context, include_confidence_scores, or expand_similar only when needed.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Free-text query. Empty string returns recent/working entities.",
        },
        branch_name: {
          type: "string",
          description:
            "Specific branch name, or '*' to search across all branches.",
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
          description:
            "Auto-expand the result set with directly related context entities (default: false).",
        },
        expand_similar: {
          type: "boolean",
          description:
            "Add semantically similar entities beyond direct search hits. Broad and expensive; default false.",
        },
        working_context_only: {
          type: "boolean",
          description:
            "Only return entities currently flagged as working context.",
        },
        include_confidence_scores: {
          type: "boolean",
          description:
            "Include extra per-entity score/source evidence in compact result objects (default: false).",
        },
        max_results: {
          type: "integer",
          description: "Maximum entities to return. Default: 10, max: 50.",
        },
        max_relations: {
          type: "integer",
          description:
            "Maximum relations among returned entities. Default: 20, max: 100.",
        },
        max_observations: {
          type: "integer",
          description:
            "Cap observations per entity. Default: 5. Use 0 for no cap.",
        },
      },
      required: ["query", "branch_name"],
    },
  },
  {
    name: "read_memory_branch",
    description:
      "Dump every entity and relation in a branch. Use for full-context reviews, exports, or when smart_search is too narrow. Heavy - prefer smart_search for targeted lookups.",
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
          description: "Defaults to ['active'].",
        },
        include_auto_context: {
          type: "boolean",
          description:
            "Pull in entities from other branches that are related to this one (default: true).",
        },
        max_observations: {
          type: "integer",
          description: "Cap observations per entity (default: 5, 0 = no cap).",
        },
      },
    },
  },

  // ---------- consolidated context retrieval ----------
  {
    name: "get_context",
    description:
      "Unified context retrieval. Pick a mode based on intent: 'working' for the current focus set + related entities, 'continuation' to resume work (working set + recent activity + decisions + blockers + next steps), 'related' to find entities tied to a free-text focus or named entities, 'project' for ML-driven suggestions based on the current file, query, and active interfaces. Default mode: 'working'.",
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
          description: "[working] Include related entities (default: true).",
        },
        max_related: {
          type: "integer",
          description: "[working] Maximum related entities (default: 10).",
        },
        time_window_hours: {
          type: "integer",
          description:
            "[continuation] Hours of recent activity to include (default: 24).",
        },
        include_blockers: {
          type: "boolean",
          description:
            "[continuation] Include current blockers in the response (default: true).",
        },
        current_focus: {
          type: "string",
          description:
            "[related] Free-text description of what you are working on.",
        },
        entity_names: {
          type: "array",
          items: { type: "string" },
          description: "[related] Target entities to find neighbors for.",
        },
        max_suggestions: {
          type: "integer",
          description: "[related] Maximum suggested entities (default: 10).",
        },
        current_file: {
          type: "string",
          description: "[project] Path of the file currently being edited.",
        },
        search_query: {
          type: "string",
          description: "[project] Short description of the current task.",
        },
        active_interfaces: {
          type: "array",
          items: { type: "string" },
          description: "[project] Names of interfaces currently in scope.",
        },
        session_id: {
          type: "string",
          description: "[project] Optional session id for tracking continuity.",
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
      "Return a structured cross-branch overview: entity counts, working entities, recent decisions, and (at higher detail levels) per-branch breakdowns. Use at session start, after long pauses, or before planning a new feature.",
    inputSchema: {
      type: "object",
      properties: {
        include_inactive: {
          type: "boolean",
          description:
            "Include inactive branches in the report (default: false).",
        },
        detail_level: {
          type: "string",
          enum: ["summary", "detailed", "comprehensive"],
          description: "Default: 'summary'.",
        },
      },
    },
  },

  // ---------- decision tracing & dependencies ----------
  {
    name: "find_dependencies",
    description:
      "Walk the relations graph (depends_on / requires / uses / needs / imports / extends / implements) outward from the target entities to expose what they rely on. Use before changing a component, planning a refactor, or assessing impact. Empty entity_names = use the current working context.",
    inputSchema: {
      type: "object",
      properties: {
        entity_names: {
          type: "array",
          items: { type: "string" },
          description: "Targets. Empty = use the current working context.",
        },
        branch_name: { type: "string", description: "Defaults to 'main'." },
        dependency_depth: {
          type: "integer",
          minimum: 1,
          maximum: 3,
          description: "Hops to traverse (default: 1).",
        },
      },
    },
  },
  {
    name: "trace_decision_chain",
    description:
      "Surface the decisions that shaped an entity (via affects / decides / depends_on relations) or, if entity_name is omitted, recent decisions across the whole branch. Use when reasoning about WHY the codebase looks the way it does or when justifying a change.",
    inputSchema: {
      type: "object",
      properties: {
        entity_name: {
          type: "string",
          description:
            "If omitted, returns recent decisions across the branch instead of one entity's chain.",
        },
        branch_name: { type: "string", description: "Defaults to 'main'." },
        max_decisions: { type: "integer", minimum: 1, maximum: 25 },
        time_window_days: {
          type: "integer",
          minimum: 1,
          maximum: 365,
          description: "How far back to scan when entity_name is omitted.",
        },
      },
    },
  },

  // ---------- workflow ----------
  {
    name: "capture_decision",
    description:
      "Record a structured decision entity with rationale, alternatives considered, impact areas, and 'affects' relations to related entities. Use whenever a non-trivial choice is made (architecture, libraries, schema, naming conventions) so it can be retrieved later via trace_decision_chain.",
    inputSchema: {
      type: "object",
      properties: {
        decision_title: {
          type: "string",
          description: "Short imperative title.",
        },
        decision_rationale: {
          type: "string",
          description: "Why this option was chosen.",
        },
        alternatives_considered: {
          type: "array",
          items: { type: "string" },
          description: "Options that were evaluated and rejected.",
        },
        impact_areas: {
          type: "array",
          items: { type: "string" },
          description: "Subsystems / domains this decision touches.",
        },
        decision_maker: {
          type: "string",
          description: "Person or role responsible.",
        },
        branch_name: { type: "string", description: "Defaults to 'main'." },
        related_entities: {
          type: "array",
          items: { type: "string" },
          description: "Entities to link with 'affects' relations.",
        },
      },
      required: ["decision_title", "decision_rationale"],
    },
  },
  {
    name: "mark_current_work",
    description:
      "Flag entities as the active working context. Boosts their relevance score, updates last_accessed, and (by default) clears the previous working set. Use at the start of a focused work session so subsequent get_context / smart_search calls bias toward the right area.",
    inputSchema: {
      type: "object",
      properties: {
        focus_entities: {
          type: "array",
          items: { type: "string" },
          description: "Entities to promote to the working set.",
        },
        branch_name: { type: "string", description: "Defaults to 'main'." },
        focus_description: {
          type: "string",
          description: "Optional free-text description of the current focus.",
        },
        clear_previous: {
          type: "boolean",
          description: "Clear the prior working set (default: true).",
        },
      },
      required: ["focus_entities"],
    },
  },
  {
    name: "update_status",
    description:
      "Unified status mutation. mode='phase' updates a branch's project_phase and bulk-applies entity status changes by name pattern. mode='archive' archives the named entities (optionally writing a completion-summary entity) while preserving their relations. Use mode='phase' for milestone transitions and mode='archive' when work is done.",
    inputSchema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["phase", "archive"],
          description:
            "Required. 'phase' for bulk transitions, 'archive' for completed work.",
        },
        entity_names: {
          type: "array",
          items: { type: "string" },
          description: "[archive] Entities to archive.",
        },
        completion_summary: {
          type: "string",
          description:
            "[archive] If provided, a summary entity is created and linked to the archived items.",
        },
        preserve_relationships: {
          type: "boolean",
          description: "[archive] Keep existing relations (default: true).",
        },
        branch_name: {
          type: "string",
          description:
            "[phase] Branch name, or '*' for all branches. Also accepted in archive mode.",
        },
        project_phase: {
          type: "string",
          enum: ["planning", "active-development", "maintenance", "reference"],
          description: "[phase] New phase to set on the branch.",
        },
        status_updates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              entity_pattern: {
                type: "string",
                description: "Substring or glob match against entity name.",
              },
              new_status: {
                type: "string",
                enum: ["active", "deprecated", "archived", "draft"],
              },
              reason: { type: "string" },
            },
            required: ["entity_pattern", "new_status"],
          },
          description: "[phase] Bulk pattern-based status updates.",
        },
      },
      required: ["mode"],
    },
  },
  {
    name: "check_missing_dependencies",
    description:
      "Scan observations of working/specified entities for explicit dependency keywords ('depends', 'requires', 'needs', etc.) and report what is mentioned but not yet captured as an entity. Returns only mentions found in text - no fabricated suggestions.",
    inputSchema: {
      type: "object",
      properties: {
        work_description: {
          type: "string",
          description: "Free-text description of the upcoming work.",
        },
        entity_names: {
          type: "array",
          items: { type: "string" },
          description: "Specific entities to scan; empty = working context.",
        },
        branch_name: { type: "string", description: "Defaults to 'main'." },
      },
      required: ["work_description"],
    },
  },

  // ---------- workspace ----------
  {
    name: "analyze_workspace",
    description:
      "Workspace integration dispatcher. mode='sync' creates folder/file structure entities and links existing entities to them. mode='bridge' connects currently-open files to related memory entities. mode='patterns' detects project type (framework/architecture) and optionally suggests or creates branches. mode='structure' kicks off background project monitoring + structure entity creation. Default mode: 'sync'.",
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
          description:
            "Defaults to MEMORY_PATH or the current working directory.",
        },
        project_path: {
          type: "string",
          description: "[structure] Alias of workspace_path.",
        },
        branch_name: {
          type: "string",
          description: "Target branch (defaults to 'main').",
        },
        file_patterns: {
          type: "array",
          items: { type: "string" },
          description: "Glob patterns for files to consider (e.g. '**/*.ts').",
        },
        create_structure_entities: {
          type: "boolean",
          description: "[sync/structure] Materialize folder/file entities.",
        },
        link_existing_entities: {
          type: "boolean",
          description:
            "[sync] Create relations from new structure entities to existing ones.",
        },
        current_files: {
          type: "array",
          items: { type: "string" },
          description: "[bridge] Currently-open file paths.",
        },
        context_radius: {
          type: "integer",
          minimum: 1,
          maximum: 3,
          description: "[bridge] Relation hops to expand (default: 1).",
        },
        analysis_depth: {
          type: "integer",
          minimum: 1,
          maximum: 3,
          description: "[patterns] Detection thoroughness (default: 1).",
        },
        suggest_branches: {
          type: "boolean",
          description:
            "[patterns] Return suggested branch names without creating them.",
        },
        create_suggested_branches: {
          type: "boolean",
          description: "[patterns] Materialize the suggested branches.",
        },
        memory_ignore_patterns: {
          type: "array",
          items: { type: "string" },
          description:
            "Additional gitignore-style patterns to append to .memory/.memoryignore before scanning.",
        },
      },
    },
  },

  // ---------- ML ----------
  {
    name: "train_project_model",
    description:
      "Trigger an incremental fine-tuning run of the project-specific embedding model on collected interactions plus the baseline seed corpus. Use sparingly - training is expensive. Returns a session id and status, or an error if there is not enough training data.",
    inputSchema: {
      type: "object",
      properties: {
        epochs: { type: "number", description: "Default: 10." },
        learning_rate: { type: "number", description: "Default: 0.001." },
        batch_size: { type: "number", description: "Default: 16." },
        training_config: {
          type: "object",
          description:
            "Alternative nested form. Keys: epochs, learning_rate, batch_size.",
        },
      },
    },
  },
  {
    name: "embeddings",
    description:
      "Embedding operations dispatcher. action='generate' produces embeddings for named interfaces. action='find_similar' runs semantic similarity search for a code snippet against stored interfaces. action='backfill' fills in missing embeddings for files/interfaces. Default action: 'find_similar'.",
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
          description: "[generate] Interfaces to embed.",
        },
        code_snippet: {
          type: "string",
          description:
            "[find_similar] Snippet to match against stored interfaces.",
        },
        limit: {
          type: "number",
          description: "[find_similar] Max results (default: 5).",
        },
        offset: {
          type: "number",
          description: "[find_similar] Pagination offset (default: 0).",
        },
        language: {
          type: "string",
          description:
            "[find_similar] Restrict results to a language such as cpp, c, python, typescript, or javascript.",
        },
        kind: {
          type: "string",
          description:
            "[find_similar] Restrict results to a symbol kind such as class, struct, function, method, macro, interface, or type.",
        },
        file_path: {
          type: "string",
          description:
            "[find_similar] Restrict results to matching file paths.",
        },
        qualified_name: {
          type: "string",
          description:
            "[find_similar] Restrict or boost results matching a qualified symbol name.",
        },
        min_similarity: {
          type: "number",
          description: "[find_similar] Minimum cosine similarity threshold.",
        },
        dedupe: {
          type: "boolean",
          description:
            "[find_similar] Dedupe repeated symbols by stable id/qualified name (default: true).",
        },
        include_docs: {
          type: "boolean",
          description:
            "[find_similar] Include full bounded documentation text.",
        },
        include_members: {
          type: "boolean",
          description:
            "[find_similar] Include bounded member/property details.",
        },
        include_snippet: {
          type: "boolean",
          description: "[find_similar] Include bounded definition snippets.",
        },
        max_members: {
          type: "number",
          description: "[find_similar] Max members when include_members=true.",
        },
        max_definition_chars: {
          type: "number",
          description:
            "[find_similar] Max characters for documentation/definition fields.",
        },
        file_limit: {
          type: "number",
          description:
            "[backfill] Max files to process this run (default: 100).",
        },
        interface_limit: {
          type: "number",
          description:
            "[backfill] Max interfaces to process this run (default: 100).",
        },
      },
    },
  },
];

const QT_TOOLS: Tool[] = [
  {
    name: "analyze_qml_bindings",
    description:
      "[Qt/QML, opt-in via ENABLE_QT_TOOLS=1] Analyze QML bindings exposed by a C++ class: Q_PROPERTY, Q_INVOKABLE, signals, QML_ELEMENT registrations and their QML usage. Requires entities populated with file metadata.",
    inputSchema: {
      type: "object",
      properties: {
        class_name: { type: "string" },
        include_usage: {
          type: "boolean",
          description: "Include QML files that consume the bindings.",
        },
        branch_name: { type: "string" },
      },
      required: ["class_name"],
    },
  },
  {
    name: "find_qt_controllers",
    description:
      "[Qt/QML, opt-in via ENABLE_QT_TOOLS=1] List C++ classes registered with QML (qmlRegisterType, QML_ELEMENT, etc.).",
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
      "[Qt/QML, opt-in via ENABLE_QT_TOOLS=1] Analyze Service -> Controller -> UI layer relationships and report violations of the layering rules.",
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
    description:
      "[Qt/QML, opt-in via ENABLE_QT_TOOLS=1] Find QML files that consume a specific C++ controller, optionally filtered by usage type (property/method/signal).",
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
    description:
      "[Qt/QML, opt-in via ENABLE_QT_TOOLS=1] List Q_PROPERTY declarations across the indexed C++ classes, optionally scoped to one class or property type.",
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
    description:
      "[Qt/QML, opt-in via ENABLE_QT_TOOLS=1] List Q_INVOKABLE methods across the indexed C++ classes.",
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
