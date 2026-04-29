import { EnhancedMemoryManager } from "../enhanced-memory-manager-modular.js";
import { Entity } from "../memory-types.js";
import { logger } from "./logger.js";
import { BATCH_CONFIG, THRESHOLDS } from "./similarity/similarity-config.js";
import { ModernSimilarityEngine } from "./similarity/similarity-engine.js";

interface RelationshipIndex {
  entityId: string;
  entityType: string;
  embedding: number[] | null; // TensorFlow.js embedding vector
  lastIndexed: Date;
  similarityScores: Map<string, number>;
  suggestedRelations: Map<string, { type: string; confidence: number }>;
}

interface BackgroundTask {
  id: string;
  type: "index_entity" | "detect_relationships" | "cleanup_stale";
  entityId?: string;
  branchName?: string;
  priority: "high" | "normal" | "low";
  createdAt: Date;
}

/**
 * TensorFlow.js Relationship Indexer - Embedding-based Relationship Detection
 * Maintains an index of entity embeddings for fast semantic similarity computation
 */
export class RelationshipIndexer {
  private similarityEngine: ModernSimilarityEngine;
  private memoryManager: EnhancedMemoryManager;

  // Embedding-based index storage
  private entityIndex: Map<string, RelationshipIndex> = new Map();
  private branchIndices: Map<string, Set<string>> = new Map();
  private typeIndices: Map<string, Set<string>> = new Map();

  // Background processing
  private taskQueue: BackgroundTask[] = [];
  private isProcessing = false;
  private processingInterval?: NodeJS.Timeout;

  // Configuration - Use central config for thresholds
  private readonly AUTO_RELATION_THRESHOLD = THRESHOLDS.autoCreate;
  private readonly SUGGESTION_THRESHOLD = THRESHOLDS.high;
  private readonly PROCESS_INTERVAL_MS = 3000; // Slower processing due to embedding computation
  private readonly MAX_CANDIDATES = BATCH_CONFIG.maxCandidates;
  private readonly MAX_INITIAL_INDEX = BATCH_CONFIG.maxInitialIndex;

  constructor(memoryManager: EnhancedMemoryManager, similarityEngine: ModernSimilarityEngine) {
    this.memoryManager = memoryManager;
    this.similarityEngine = similarityEngine;
  }

  async initialize(): Promise<void> {
    logger.info("[INIT] Initializing Relationship Indexer...");

    // Start background processing
    this.startBackgroundProcessing();

    if (process.env.ADVANCED_MEMORY_BUILD_RELATIONSHIP_INDEX_ON_STARTUP === "1") {
      this.queueTask({
        id: `init_${Date.now()}`,
        type: "cleanup_stale",
        priority: "high",
        createdAt: new Date(),
      });
    } else {
      logger.info("[INIT] Skipping startup relationship index rebuild");
    }

    logger.info("[SUCCESS] Relationship Indexer ready");
  }

  private startBackgroundProcessing(): void {
    this.processingInterval = setInterval(() => {
      this.processTaskQueue();
    }, this.PROCESS_INTERVAL_MS);
  }

  private async processTaskQueue(): Promise<void> {
    if (this.isProcessing || this.taskQueue.length === 0) return;

    this.isProcessing = true;

    try {
      // Process one task at a time to avoid overwhelming the system
      const task = this.taskQueue.shift();
      if (task) {
        await this.processTask(task);
      }
    } catch (error) {
      logger.error("[ERROR] Background task failed:", error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processTask(task: BackgroundTask): Promise<void> {
    switch (task.type) {
      case "index_entity":
        if (task.entityId) {
          await this.indexEntity(task.entityId, task.branchName);
        }
        break;
      case "detect_relationships":
        if (task.entityId) {
          await this.detectRelationshipsForEntity(task.entityId, task.branchName);
        }
        break;
      case "cleanup_stale":
        await this.buildInitialIndex();
        break;
    }
  }

  private queueTask(task: BackgroundTask): void {
    // Prevent duplicate tasks
    const exists = this.taskQueue.some(
      (existing) =>
        existing.type === task.type &&
        existing.entityId === task.entityId &&
        existing.branchName === task.branchName,
    );

    if (!exists) {
      this.taskQueue.push(task);
    }
  }

  private async indexEntity(entityId: string, branchName?: string): Promise<void> {
    try {
      const entities = await this.memoryManager.openNodes([entityId], branchName);
      if (entities.entities.length === 0) return;

      const entity = entities.entities[0];

      // Generate embedding using TensorFlow.js similarity engine
      let embedding: number[] | null = null;
      try {
        // Get embedding through the similarity engine's internal method
        // We'll use a workaround since we need access to the embedding directly
        await this.similarityEngine.initialize();

        // Create a dummy entity to calculate similarity and extract embedding logic
        const dummyEntity: Entity = {
          name: "dummy",
          entityType: "test",
          observations: ["dummy"],
        };

        // For now, we'll skip direct embedding extraction and rely on similarity calculations
        // TODO: Add a public method to get embeddings directly from the similarity engine
        embedding = null; // Will be computed on demand
      } catch (error) {
        logger.error(`Failed to generate embedding for entity ${entity.name}:`, error);
        embedding = null;
      }

      const indexEntry: RelationshipIndex = {
        entityId: entity.name,
        entityType: entity.entityType,
        embedding,
        lastIndexed: new Date(),
        similarityScores: new Map(),
        suggestedRelations: new Map(),
      };

      this.entityIndex.set(entity.name, indexEntry);

      // Update type and branch indices (still useful for filtering)
      const branchKey = branchName || "main";
      if (!this.branchIndices.has(branchKey)) {
        this.branchIndices.set(branchKey, new Set());
      }
      this.branchIndices.get(branchKey)!.add(entity.name);

      if (!this.typeIndices.has(entity.entityType)) {
        this.typeIndices.set(entity.entityType, new Set());
      }
      this.typeIndices.get(entity.entityType)!.add(entity.name);

      logger.debug(`Indexed entity: ${entity.name} (${entity.entityType}) in branch ${branchKey}`);

      // Queue relationship detection
      this.queueTask({
        id: `detect_${entityId}_${Date.now()}`,
        type: "detect_relationships",
        entityId,
        branchName,
        priority: "normal",
        createdAt: new Date(),
      });
    } catch (error) {
      logger.error(`[ERROR] Failed to index entity ${entityId}:`, error);
    }
  }

  private async detectRelationshipsForEntity(entityId: string, branchName?: string): Promise<void> {
    try {
      const indexEntry = this.entityIndex.get(entityId);
      if (!indexEntry) return;

      const entities = await this.memoryManager.openNodes([entityId], branchName);
      if (entities.entities.length === 0) return;

      const targetEntity = entities.entities[0];

      // Get potential candidates from same branch/type
      const branchKey = branchName || "main";
      const entityIds = this.branchIndices.get(branchKey);

      if (!entityIds || entityIds.size <= 1) return;

      const candidateIds = Array.from(entityIds)
        .filter((id) => id !== entityId)
        .slice(0, this.MAX_CANDIDATES); // Limit for performance
      const candidateEntities = await this.memoryManager.openNodes(candidateIds, branchName);

      // Use TensorFlow.js embedding similarity
      const similarEntities = await this.similarityEngine.detectSimilarEntities(
        targetEntity,
        candidateEntities.entities,
      );

      // Update index
      indexEntry.similarityScores.clear();
      indexEntry.suggestedRelations.clear();

      for (const match of similarEntities) {
        indexEntry.similarityScores.set(match.entity.name, match.similarity);

        if (match.confidence === "high" || match.confidence === "medium") {
          indexEntry.suggestedRelations.set(match.entity.name, {
            type: match.suggestedRelationType,
            confidence: match.similarity,
          });
        }
      }

      if (similarEntities.length > 0) {
        logger.debug(
          `[SEARCH] Background indexed ${similarEntities.length} relationship candidates for ${entityId}`,
        );
        // Log top matches for debugging
        for (const match of similarEntities.slice(0, 3)) {
          logger.debug(
            `   Background match: "${
              match.entity.name
            }" similarity=${match.similarity.toFixed(3)} confidence=${match.confidence}`,
          );
        }
      }
    } catch (error) {
      logger.error(`[ERROR] Failed to detect relationships for ${entityId}:`, error);
    }
  }

  private async buildInitialIndex(): Promise<void> {
    try {
      // Get all branches and index their entities
      const branches = await this.memoryManager.listBranches();

      for (const branch of branches) {
        const graph = await this.memoryManager.readGraph(
          branch.name === "main" ? undefined : branch.name,
          ["active", "draft"],
          false,
        );

        // Queue indexing for each entity
        for (const entity of graph.entities.slice(0, this.MAX_INITIAL_INDEX)) {
          // Limit initial index size
          this.queueTask({
            id: `index_${entity.name}_${Date.now()}`,
            type: "index_entity",
            entityId: entity.name,
            branchName: branch.name === "main" ? undefined : branch.name,
            priority: "low",
            createdAt: new Date(),
          });
        }
      }

      logger.info(`[LOADING] Queued initial indexing for relationship detection`);
    } catch (error) {
      logger.error("[ERROR] Failed to build initial index:", error);
    }
  }

  // ===== PUBLIC API =====

  /**
   * Called when a new entity is created
   */
  onEntityCreated(entityId: string, branchName?: string): void {
    this.queueTask({
      id: `created_${entityId}_${Date.now()}`,
      type: "index_entity",
      entityId,
      branchName,
      priority: "high",
      createdAt: new Date(),
    });
  }

  /**
   * Get relationship suggestions for an entity
   */
  getRelationshipSuggestions(entityId: string): Array<{
    targetEntity: string;
    relationType: string;
    confidence: number;
    isAutoCreatable: boolean;
  }> {
    const indexEntry = this.entityIndex.get(entityId);
    if (!indexEntry) return [];

    const suggestions = [];

    for (const [targetId, suggestion] of indexEntry.suggestedRelations) {
      suggestions.push({
        targetEntity: targetId,
        relationType: suggestion.type,
        confidence: suggestion.confidence,
        isAutoCreatable: suggestion.confidence > this.AUTO_RELATION_THRESHOLD,
      });
    }

    return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 10);
  }

  /**
   * Get statistics about the index
   */
  getStatistics(): {
    totalEntities: number;
    totalBranches: number;
    queueSize: number;
    isProcessing: boolean;
  } {
    return {
      totalEntities: this.entityIndex.size,
      totalBranches: this.branchIndices.size,
      queueSize: this.taskQueue.length,
      isProcessing: this.isProcessing,
    };
  }

  /**
   * Shutdown background processing
   */
  shutdown(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }
  }

  // ===== UTILITY METHODS =====

  /**
   * Get embedding-based statistics for monitoring
   */
  getIndexStats(): {
    totalEntities: number;
    branchesIndexed: number;
    typesIndexed: number;
    queuedTasks: number;
    isProcessing: boolean;
    lastUpdate: Date | null;
  } {
    const lastUpdate =
      Array.from(this.entityIndex.values())
        .map((entry) => entry.lastIndexed)
        .sort((a, b) => b.getTime() - a.getTime())[0] || null;

    return {
      totalEntities: this.entityIndex.size,
      branchesIndexed: this.branchIndices.size,
      typesIndexed: this.typeIndices.size,
      queuedTasks: this.taskQueue.length,
      isProcessing: this.isProcessing,
      lastUpdate,
    };
  }

  /**
   * Clear embedding cache and reindex (for model updates)
   */
  async clearAndReindex(): Promise<void> {
    logger.info("Clearing embedding-based relationship index...");

    this.entityIndex.clear();
    this.branchIndices.clear();
    this.typeIndices.clear();
    this.taskQueue.length = 0;

    // Queue full reindex
    this.queueTask({
      id: `reindex_${Date.now()}`,
      type: "cleanup_stale",
      priority: "high",
      createdAt: new Date(),
    });
  }
}
