import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const MEMORY_TOOLS: Tool[] = [
  {
    name: "list_memory_branches",
    description: "List all available memory branches with their statistics and purposes. Use this first to understand what branches exist.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  
  {
    name: "create_memory_branch", 
    description: "Create a new memory branch for organizing specific types of knowledge (e.g., 'docs', 'marketing', 'frontend', etc.)",
    inputSchema: {
      type: "object",
      properties: {
        branch_name: { type: "string", description: "Name for the new branch (e.g., 'docs', 'marketing', 'frontend')" },
        purpose: { type: "string", description: "Description of what this branch will contain" }
      },
      required: ["branch_name"],
    },
  },

  {
    name: "delete_memory_branch",
    description: "Permanently delete a memory branch and all its data. Cannot delete the main branch.",
    inputSchema: {
      type: "object", 
      properties: {
        branch_name: { type: "string", description: "Name of the branch to delete" }
      },
      required: ["branch_name"],
    },
  },

  {
    name: "suggest_memory_branch",
    description: "Get a suggested memory branch based on the type of content you want to store. Helps AI choose the right branch.",
    inputSchema: {
      type: "object",
      properties: {
        entity_type: { type: "string", description: "The type of entity (e.g., 'API', 'Component', 'UserStory')" },
        content_sample: { type: "string", description: "Sample of the content to help determine the best branch" }
      },
    },
  },

  {
    name: "create_entities",
    description: "Create new entities in the knowledge graph. If no branch is specified, the system will suggest the best branch based on content.",
    inputSchema: {
      type: "object",
      properties: {
        entities: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Unique name for the entity" },
              entityType: { type: "string", description: "Type/category of the entity (e.g., 'API', 'Component', 'UserStory')" },
              observations: { 
                type: "array", 
                items: { type: "string" },
                description: "Array of facts, notes, or observations about this entity"
              },
              status: { 
                type: "string", 
                enum: ["active", "deprecated", "archived", "draft"],
                description: "Status of the entity (defaults to 'active')"
              },
              statusReason: {
                type: "string",
                description: "Optional reason for the status"
              },
            },
            required: ["name", "entityType", "observations"],
          },
        },
        branch_name: {
          type: "string",
          description: "Memory branch to store entities in. Options: 'main' (default), 'docs', 'marketing', or any custom branch. Leave empty to auto-suggest."
        },
      },
      required: ["entities"],
    },
  },

  {
    name: "create_relations",
    description: "Create relationships between entities. Use active voice (e.g., 'implements', 'contains', 'depends_on').",
    inputSchema: {
      type: "object",
      properties: {
        relations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              from: { type: "string", description: "Name of the source entity" },
              to: { type: "string", description: "Name of the target entity" },
              relationType: { type: "string", description: "Type of relationship in active voice (e.g., 'implements', 'uses', 'contains')" },
            },
            required: ["from", "to", "relationType"],
          },
        },
        branch_name: {
          type: "string",
          description: "Memory branch where the entities exist. Defaults to 'main'."
        },
      },
      required: ["relations"],
    },
  },

  {
    name: "add_observations",
    description: "Add new observations/facts to existing entities.",
    inputSchema: {
      type: "object",
      properties: {
        observations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              entityName: { type: "string", description: "Name of the entity to add observations to" },
              contents: { 
                type: "array", 
                items: { type: "string" },
                description: "Array of new observations to add"
              },
            },
            required: ["entityName", "contents"],
          },
        },
        branch_name: {
          type: "string",
          description: "Memory branch containing the entities. Defaults to 'main'."
        },
      },
      required: ["observations"],
    },
  },

  {
    name: "search_memory",
    description: "Search for entities across all branches or within a specific branch. Returns entities and their relationships.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query to match against entity names, types, and observations" },
        branch_name: {
          type: "string",
          description: "Specific branch to search in. Leave empty to search all branches."
        },
        include_statuses: {
          type: "array",
          items: {
            type: "string",
            enum: ["active", "deprecated", "archived", "draft"]
          },
          description: "Entity statuses to include in results. Defaults to ['active'] only."
        },
        auto_cross_context: {
          type: "boolean",
          description: "Automatically include cross-referenced entities from other branches when entities have cross-references. Defaults to true."
        },
      },
      required: ["query"],
    },
  },

  {
    name: "read_memory_branch",
    description: "Read all entities and relationships from a specific memory branch.",
    inputSchema: {
      type: "object",
      properties: {
        branch_name: {
          type: "string",
          description: "Name of the branch to read. Defaults to 'main'."
        },
        include_statuses: {
          type: "array",
          items: {
            type: "string",
            enum: ["active", "deprecated", "archived", "draft"]
          },
          description: "Entity statuses to include. Defaults to ['active'] only."
        },
        auto_cross_context: {
          type: "boolean",
          description: "Automatically include cross-referenced entities from other branches when entities have cross-references. Defaults to true."
        },
      },
    },
  },

  {
    name: "open_entities",
    description: "Retrieve specific entities by name, along with their relationships.",
    inputSchema: {
      type: "object",
      properties: {
        entity_names: {
          type: "array",
          items: { type: "string" },
          description: "Array of entity names to retrieve",
        },
        branch_name: {
          type: "string",
          description: "Branch containing the entities. Defaults to 'main'."
        },
        include_statuses: {
          type: "array",
          items: {
            type: "string",
            enum: ["active", "deprecated", "archived", "draft"]
          },
          description: "Entity statuses to include. If not specified, shows requested entities regardless of status."
        },
        auto_cross_context: {
          type: "boolean",
          description: "Automatically include cross-referenced entities from other branches when entities have cross-references. Defaults to true."
        },
      },
      required: ["entity_names"],
    },
  },

  {
    name: "create_cross_reference",
    description: "Create a cross-reference link from an entity in one branch to entities in another branch. Useful for connecting related knowledge across different domains.",
    inputSchema: {
      type: "object",
      properties: {
        entity_name: {
          type: "string",
          description: "Name of the entity to add the cross-reference to"
        },
        target_branch: {
          type: "string", 
          description: "Target branch containing the entities to reference"
        },
        target_entity_names: {
          type: "array",
          items: { type: "string" },
          description: "Names of entities in the target branch to cross-reference"
        },
        source_branch: {
          type: "string",
          description: "Source branch containing the entity. Defaults to 'main'."
        },
      },
      required: ["entity_name", "target_branch", "target_entity_names"],
    },
  },

  {
    name: "update_entity_status",
    description: "Update the status of an entity (active, deprecated, archived, draft) with optional reason.",
    inputSchema: {
      type: "object",
      properties: {
        entity_name: {
          type: "string",
          description: "Name of the entity to update"
        },
        status: {
          type: "string",
          enum: ["active", "deprecated", "archived", "draft"],
          description: "New status for the entity"
        },
        status_reason: {
          type: "string",
          description: "Optional reason for the status change"
        },
        branch_name: {
          type: "string",
          description: "Branch containing the entity. Defaults to 'main'."
        },
      },
      required: ["entity_name", "status"],
    },
  },

  {
    name: "delete_entities",
    description: "Delete entities and their associated relationships from a memory branch.",
    inputSchema: {
      type: "object",
      properties: {
        entity_names: { 
          type: "array", 
          items: { type: "string" },
          description: "Array of entity names to delete" 
        },
        branch_name: {
          type: "string",
          description: "Branch containing the entities. Defaults to 'main'."
        },
      },
      required: ["entity_names"],
    },
  },

  {
    name: "delete_observations",
    description: "Delete specific observations from entities.",
    inputSchema: {
      type: "object",
      properties: {
        deletions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              entityName: { type: "string", description: "Name of the entity" },
              observations: { 
                type: "array", 
                items: { type: "string" },
                description: "Array of observations to delete"
              },
            },
            required: ["entityName", "observations"],
          },
        },
        branch_name: {
          type: "string",
          description: "Branch containing the entities. Defaults to 'main'."
        },
      },
      required: ["deletions"],
    },
  },

  {
    name: "delete_relations",
    description: "Delete specific relationships between entities.",
    inputSchema: {
      type: "object",
      properties: {
        relations: { 
          type: "array", 
          items: {
            type: "object",
            properties: {
              from: { type: "string", description: "Name of the source entity" },
              to: { type: "string", description: "Name of the target entity" },
              relationType: { type: "string", description: "Type of the relationship to delete" },
            },
            required: ["from", "to", "relationType"],
          },
          description: "Array of relationships to delete" 
        },
        branch_name: {
          type: "string",
          description: "Branch containing the relationships. Defaults to 'main'."
        },
      },
      required: ["relations"],
    },
  },

  {
    name: "get_cross_context",
    description: "Get the full contextual picture by retrieving entities and all their cross-referenced related entities from other branches. Perfect for getting comprehensive information when working on interconnected topics.",
    inputSchema: {
      type: "object",
      properties: {
        entity_names: {
          type: "array",
          items: { type: "string" },
          description: "Names of entities to get cross-context for. Leave empty to get cross-context for all entities in the branch."
        },
        source_branch: {
          type: "string",
          description: "Branch containing the source entities. Defaults to 'main'."
        },
        include_statuses: {
          type: "array",
          items: {
            type: "string",
            enum: ["active", "deprecated", "archived", "draft"]
          },
          description: "Entity statuses to include from cross-referenced branches. Defaults to ['active'] only."
        },
      },
    },
  },

  {
    name: "memory_usage_guide",
    description: "Get comprehensive usage guide and examples for the memory server tools. Call this first to understand how to effectively use the memory system.",
    inputSchema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          enum: ["overview", "branching", "cross-references", "search", "examples", "best-practices"],
          description: "Specific topic to focus on. Leave empty for complete guide."
        }
      }
    },
  },
];
