import { Tool } from "@modelcontextprotocol/sdk/types.js";

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
      "Intelligent search that automatically includes related entities, cross-references, and contextual relationships.",
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
];
