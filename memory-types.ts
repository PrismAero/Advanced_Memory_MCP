// Type definitions for the memory server

export type EntityStatus = "active" | "deprecated" | "archived" | "draft";
export type ObservationType =
  | "current-status"
  | "decision"
  | "blocker"
  | "dependency"
  | "reference"
  | "next-steps";
export type ObservationPriority = "critical" | "high" | "normal" | "low";
export type ProjectPhase =
  | "planning"
  | "active-development"
  | "maintenance"
  | "reference";
export type BranchRelationType = "depends_on" | "blocks" | "related_to";

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
  keywordSignals?: Array<{
    keyword: string;
    normalizedKeyword: string;
    keywordType: string;
    sourceType: string;
    sourceId?: string | number;
    observationId?: number;
    branchId?: number;
    weight: number;
    confidence: number;
    position?: number;
    phraseLength: number;
    context?: string;
    metadata?: Record<string, any>;
  }>;
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
  lastAccessed?: string; // ISO timestamp of last access
  workingContext?: boolean; // True if this entity is part of current working context
  relevanceScore?: number; // 0-1 score indicating relevance based on access patterns
  embedding?: number[]; // TensorFlow.js embedding vector for semantic similarity
  // Search result metadata (populated during search operations)
  semanticSimilarity?: number; // Semantic similarity score from search
  semanticConfidence?: "high" | "medium" | "low"; // Confidence of semantic match
  semanticReasoning?: string; // Reasoning for semantic match
  searchType?: "semantic" | "text" | "hybrid"; // How this entity was found
  textMatch?: string; // The specific text that matched in a text search
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

export interface EnhancedObservation {
  content: string;
  observationType?: ObservationType;
  priority?: ObservationPriority;
}

export interface BranchRelationship {
  fromBranch: string;
  toBranch: string;
  relationType: BranchRelationType;
}

export interface MemoryBranchInfo {
  name: string;
  path: string;
  purpose: string;
  entityCount: number;
  relationCount: number;
  lastUpdated: string;
  currentFocus?: boolean; // True if this branch is currently being worked on
  projectPhase?: ProjectPhase; // Current phase of this branch
  relationships?: BranchRelationship[]; // Relationships to other branches
}
