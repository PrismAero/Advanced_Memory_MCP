// Type definitions for the memory server

export type EntityStatus = "active" | "deprecated" | "archived" | "draft";

export interface CrossReference {
  memoryBranch: string; // Branch name (e.g., "docs", "marketing", "frontend")
  entityNames: string[]; // Names of entities to include from the referenced branch
}

export const OPTIMIZATION_METADATA_SYMBOL = Symbol.for(
  "@adaptive-reasoning/optimization"
);

export interface OptimizationMetadata {
  optimizedObservations: string[];
  optimizedContent: string;
  keywords: string[];
  entities: string[];
  compressionRatio: number;
  tokenCount: number;
  originalTokenCount: number;
}

export interface Entity {
  name: string;
  entityType: string;
  content?: string; // Main content/description of the entity (LLM-optimized)
  observations: string[];
  crossRefs?: CrossReference[]; // Optional cross-references to other memory branches
  crossReferences?: any[]; // Additional cross-references for JSON storage
  status?: EntityStatus; // Status flag - defaults to "active" if not specified
  statusReason?: string; // Optional reason for status (e.g., "replaced by Entity_v2")
  created?: string; // ISO timestamp of creation
  lastUpdated?: string; // ISO timestamp of last update
  // Internal optimization metadata (not always returned)
  _keywordData?: {
    keywords: string[];
    entities: string[];
    compressionRatio: number;
  };
}

export interface Relation {
  from: string;
  to: string;
  relationType: string;
}

export interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
}

export interface MemoryBranchInfo {
  name: string;
  path: string;
  purpose: string;
  entityCount: number;
  relationCount: number;
  lastUpdated: string;
}
