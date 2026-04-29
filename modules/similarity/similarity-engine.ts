import { Entity } from "../../memory-types.js";
import { logger } from "../logger.js";
import {
  CACHE_CONFIG,
  CONFIDENCE_CONFIG,
  THRESHOLDS,
} from "./similarity-config.js";
import { TensorFlowModelManager } from "./tensorflow-model-manager.js";

/**
 * LRU (Least Recently Used) Cache implementation
 * Automatically evicts least recently used entries when capacity is reached
 */
class LRUCache<K, V> {
  private cache: Map<K, V>;
  private maxSize: number;

  constructor(maxSize: number) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      // Update existing - move to end
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Delete oldest (first) entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  get size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }
}

/**
 * TensorFlow.js Similarity Engine - Complete replacement with semantic embeddings
 * Uses TensorFlow.js Universal Sentence Encoder for superior semantic understanding
 *
 * Key improvements over the old engine:
 * - Deep semantic understanding using embeddings
 * - Contextual similarity detection
 * - Optimized for software development entities
 * - Local-only operation with cached models
 */
export class ModernSimilarityEngine {
  private modelManager: TensorFlowModelManager;
  private embeddingCache: LRUCache<string, number[]>;
  private initialized = false;

  // Use central configuration for thresholds
  private readonly SIMILARITY_THRESHOLD = THRESHOLDS.minimum;
  private readonly HIGH_CONFIDENCE_THRESHOLD = CONFIDENCE_CONFIG.high;
  private readonly MEDIUM_CONFIDENCE_THRESHOLD = CONFIDENCE_CONFIG.medium;
  private readonly MAX_CACHE_SIZE = CACHE_CONFIG.maxSize;

  constructor() {
    this.modelManager = new TensorFlowModelManager();
    this.embeddingCache = new LRUCache(CACHE_CONFIG.maxSize);
  }

  /**
   * Initialize the TensorFlow.js similarity engine
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.debug(
        "TensorFlow.js similarity engine already initialized, skipping"
      );
      return;
    }

    try {
      logger.debug("Initializing TensorFlow.js similarity engine...");
      await this.modelManager.initialize();
      this.initialized = true;
      logger.info(
        "[SUCCESS] TensorFlow.js similarity engine ready with semantic embeddings"
      );
    } catch (error) {
      logger.error(
        "Failed to initialize TensorFlow.js similarity engine:",
        error
      );
      throw error;
    }
  }

  getModelManager(): TensorFlowModelManager {
    return this.modelManager;
  }

  dispose(): void {
    this.embeddingCache.clear();
    this.modelManager.dispose();
    this.initialized = false;
  }

  /**
   * Detect similar entities using TensorFlow.js semantic embeddings
   */
  async detectSimilarEntities(
    targetEntity: Entity,
    candidateEntities: Entity[]
  ): Promise<
    Array<{
      entity: Entity;
      similarity: number;
      confidence: "high" | "medium" | "low";
      suggestedRelationType: string;
      reasoning: string;
    }>
  > {
    if (!this.initialized) {
      logger.warn(
        "TensorFlow.js similarity engine not initialized, initializing now..."
      );
      await this.initialize();
    }

    if (candidateEntities.length === 0) {
      return [];
    }

    try {
      logger.debug(
        `TensorFlow.js similarity engine analyzing ${candidateEntities.length} candidates for "${targetEntity.name}"`
      );

      // Get semantic similarity using embeddings
      const results = await this.calculateSemanticSimilarities(
        targetEntity,
        candidateEntities
      );

      logger.debug(`Found ${results.length} similar entities above threshold`);

      // Log detailed results for debugging
      results.forEach((result, i) => {
        logger.debug(
          `${i + 1}. "${result.entity.name}" - ${(
            result.similarity * 100
          ).toFixed(1)}% similar (${result.confidence}) - ${
            result.suggestedRelationType
          }`
        );
      });

      return results;
    } catch (error) {
      logger.error("Error in TensorFlow.js similarity detection:", error);
      return [];
    }
  }

  /**
   * Quick similarity check between two entities using embeddings
   */
  async calculateSimilarity(entity1: Entity, entity2: Entity): Promise<number> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Get embeddings for both entities
      const embedding1 = await this.getEntityEmbedding(entity1);
      const embedding2 = await this.getEntityEmbedding(entity2);

      // Calculate cosine similarity
      const similarity = this.modelManager.calculateCosineSimilarity(
        embedding1,
        embedding2
      );

      // Apply entity type compatibility boost/penalty
      const typeCompatibility = this.calculateTypeCompatibility(
        entity1,
        entity2
      );
      const adjustedSimilarity = similarity * 0.8 + typeCompatibility * 0.2;

      return Math.min(adjustedSimilarity, 1.0);
    } catch (error) {
      logger.error("Error calculating entity similarity:", error);
      return 0;
    }
  }

  /**
   * Batch similarity calculation using TensorFlow.js embeddings
   */
  async calculateBatchSimilarity(
    entities: Entity[]
  ): Promise<Map<string, Array<{ entity: Entity; similarity: number }>>> {
    if (!this.initialized) {
      await this.initialize();
    }

    const results = new Map<
      string,
      Array<{ entity: Entity; similarity: number }>
    >();

    try {
      // Pre-compute embeddings for all entities for efficiency
      logger.debug(`Computing embeddings for ${entities.length} entities...`);
      const embeddings = new Map<string, number[]>();

      for (const entity of entities) {
        embeddings.set(entity.name, await this.getEntityEmbedding(entity));
      }

      // Calculate pairwise similarities
      for (const entity of entities) {
        const entityEmbedding = embeddings.get(entity.name)!;
        const similarities: Array<{ entity: Entity; similarity: number }> = [];

        for (const otherEntity of entities) {
          if (entity.name === otherEntity.name) continue;

          const otherEmbedding = embeddings.get(otherEntity.name)!;
          const semanticSimilarity =
            this.modelManager.calculateCosineSimilarity(
              entityEmbedding,
              otherEmbedding
            );

          // Apply type compatibility
          const typeCompatibility = this.calculateTypeCompatibility(
            entity,
            otherEntity
          );
          const finalSimilarity =
            semanticSimilarity * 0.8 + typeCompatibility * 0.2;

          if (finalSimilarity > this.SIMILARITY_THRESHOLD) {
            similarities.push({
              entity: otherEntity,
              similarity: finalSimilarity,
            });
          }
        }

        // Sort by similarity
        similarities.sort((a, b) => b.similarity - a.similarity);
        results.set(entity.name, similarities);
      }

      logger.debug(
        `Batch similarity calculation completed for ${entities.length} entities`
      );
      return results;
    } catch (error) {
      logger.error("Error in batch similarity calculation:", error);
      return new Map();
    }
  }

  /**
   * Calculate semantic similarities using TensorFlow.js embeddings
   */
  private async calculateSemanticSimilarities(
    targetEntity: Entity,
    candidateEntities: Entity[]
  ): Promise<
    Array<{
      entity: Entity;
      similarity: number;
      confidence: "high" | "medium" | "low";
      suggestedRelationType: string;
      reasoning: string;
    }>
  > {
    const results: Array<{
      entity: Entity;
      similarity: number;
      confidence: "high" | "medium" | "low";
      suggestedRelationType: string;
      reasoning: string;
    }> = [];

    // Get target entity embedding
    const targetEmbedding = await this.getEntityEmbedding(targetEntity);

    for (const candidate of candidateEntities) {
      if (candidate.name === targetEntity.name) continue;

      // Get candidate embedding
      const candidateEmbedding = await this.getEntityEmbedding(candidate);

      // Calculate semantic similarity
      const semanticSimilarity = this.modelManager.calculateCosineSimilarity(
        targetEmbedding,
        candidateEmbedding
      );

      // Apply type compatibility
      const typeCompatibility = this.calculateTypeCompatibility(
        targetEntity,
        candidate
      );
      const finalSimilarity =
        semanticSimilarity * 0.8 + typeCompatibility * 0.2;

      if (finalSimilarity > this.SIMILARITY_THRESHOLD) {
        const confidence = this.determineConfidence(finalSimilarity);
        const { relationType, reasoning } = this.inferRelationshipType(
          targetEntity,
          candidate,
          finalSimilarity,
          semanticSimilarity
        );

        results.push({
          entity: candidate,
          similarity: finalSimilarity,
          confidence,
          suggestedRelationType: relationType,
          reasoning,
        });
      }
    }

    // Sort by similarity and limit results
    return results.sort((a, b) => b.similarity - a.similarity).slice(0, 8);
  }

  /**
   * Get or compute entity embedding with caching
   */
  private async getEntityEmbedding(entity: Entity): Promise<number[]> {
    // Create cache key from entity content
    const cacheKey = this.createEntityCacheKey(entity);

    // Check cache first
    if (this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey)!;
    }

    // Compute new embedding
    const entityText = this.entityToText(entity);
    const embeddings = await this.modelManager.generateEmbeddings([entityText]);
    const embedding = embeddings[0];

    // Cache the result (LRU cache handles eviction automatically)
    this.embeddingCache.set(cacheKey, embedding);

    return embedding;
  }

  /**
   * Calculate type compatibility between entities
   */
  private calculateTypeCompatibility(entity1: Entity, entity2: Entity): number {
    if (entity1.entityType === entity2.entityType) {
      return 1.0; // Perfect compatibility for same types
    }

    // Define type compatibility matrix for software entities
    const typeCompatibilityMap: { [key: string]: { [key: string]: number } } = {
      component: { service: 0.7, module: 0.8, class: 0.6 },
      service: { component: 0.7, api: 0.8, module: 0.5 },
      module: { component: 0.8, service: 0.5, class: 0.6 },
      class: { component: 0.6, module: 0.6, interface: 0.8 },
      interface: { class: 0.8, component: 0.5, api: 0.7 },
      api: { service: 0.8, interface: 0.7, endpoint: 0.9 },
      endpoint: { api: 0.9, service: 0.6 },
      decision: { requirement: 0.6, blocker: 0.4 },
      requirement: { decision: 0.6, specification: 0.8 },
      blocker: { decision: 0.4, issue: 0.8 },
    };

    const type1 = entity1.entityType.toLowerCase();
    const type2 = entity2.entityType.toLowerCase();

    return (
      typeCompatibilityMap[type1]?.[type2] ||
      typeCompatibilityMap[type2]?.[type1] ||
      0.3
    ); // Default compatibility for unrelated types
  }

  /**
   * Convert entity to text for embedding generation
   */
  private entityToText(entity: Entity): string {
    const parts: string[] = [];

    // Add entity name and type
    parts.push(`${entity.entityType}: ${entity.name}`);

    // Add content if available
    if (entity.content) {
      parts.push(entity.content);
    }

    // Add observations
    if (entity.observations && entity.observations.length > 0) {
      parts.push(entity.observations.join(". "));
    }

    return parts.join(". ").trim();
  }

  /**
   * Create cache key for entity
   */
  private createEntityCacheKey(entity: Entity): string {
    // Include key entity properties that affect embedding
    const keyProperties = {
      name: entity.name,
      type: entity.entityType,
      content: entity.content || "",
      observations: entity.observations || [],
    };

    return JSON.stringify(keyProperties);
  }

  /**
   * Determine confidence level based on similarity score
   */
  private determineConfidence(similarity: number): "high" | "medium" | "low" {
    if (similarity >= this.HIGH_CONFIDENCE_THRESHOLD) {
      return "high";
    } else if (similarity >= this.MEDIUM_CONFIDENCE_THRESHOLD) {
      return "medium";
    } else {
      return "low";
    }
  }

  /**
   * Infer relationship type based on entity analysis and embeddings
   */
  private inferRelationshipType(
    entity1: Entity,
    entity2: Entity,
    finalSimilarity: number,
    semanticSimilarity: number
  ): {
    relationType: string;
    reasoning: string;
  } {
    const type1 = entity1.entityType.toLowerCase();
    const type2 = entity2.entityType.toLowerCase();
    const name1 = entity1.name.toLowerCase();
    const name2 = entity2.name.toLowerCase();

    // High semantic similarity relationships
    if (semanticSimilarity > 0.9) {
      return {
        relationType: "semantically_similar",
        reasoning: `Very high semantic similarity (${(
          semanticSimilarity * 100
        ).toFixed(1)}%) detected by TensorFlow.js embeddings`,
      };
    }

    // Same type relationships with good similarity
    if (type1 === type2 && finalSimilarity > 0.8) {
      return {
        relationType: "similar_to",
        reasoning: `High similarity between same-type entities (${(
          finalSimilarity * 100
        ).toFixed(1)}%)`,
      };
    }

    // Containment relationships based on names
    if (name1.includes(name2) || name2.includes(name1)) {
      const isParent = name1.length > name2.length;
      return {
        relationType: isParent ? "contains" : "part_of",
        reasoning: `Name containment detected with semantic confirmation (${(
          finalSimilarity * 100
        ).toFixed(1)}% similarity)`,
      };
    }

    // Type-specific relationships
    if (
      (type1 === "decision" && type2 === "requirement") ||
      (type1 === "requirement" && type2 === "decision")
    ) {
      return {
        relationType: "addresses",
        reasoning: `Decision-requirement relationship with semantic similarity (${(
          finalSimilarity * 100
        ).toFixed(1)}%)`,
      };
    }

    if (
      (type1 === "component" && type2 === "service") ||
      (type1 === "service" && type2 === "component")
    ) {
      return {
        relationType: "uses",
        reasoning: `Component-service relationship with semantic similarity (${(
          finalSimilarity * 100
        ).toFixed(1)}%)`,
      };
    }

    // Default semantic relationship
    return {
      relationType: "related_to",
      reasoning: `Semantic relationship detected by TensorFlow.js (${(
        finalSimilarity * 100
      ).toFixed(1)}% similarity)`,
    };
  }

  /**
   * Get similarity statistics for monitoring
   */
  getStatistics(): {
    engine: string;
    version: string;
    features: string[];
    thresholds: {
      similarity: number;
      highConfidence: number;
      mediumConfidence: number;
    };
    modelInfo?: {
      modelId: string | null;
      isLoaded: boolean;
      memoryUsage: number;
      backend?: string | null;
      provider?: string;
      artifactPath?: string;
      tensorCount?: number;
      lastTensorDelta?: number;
    };
    cacheStats?: {
      embeddingsCached: number;
    };
  } {
    const modelInfo = this.modelManager.getModelInfo();
    return {
      engine: "TensorFlowSimilarityEngine",
      version: "2.0.0",
      features: [
        "tensorflow-js-embeddings",
        "universal-sentence-encoder",
        "semantic-similarity",
        "embedding-cache",
        "type-compatibility",
        "local-only-inference",
      ],
      thresholds: {
        similarity: this.SIMILARITY_THRESHOLD,
        highConfidence: this.HIGH_CONFIDENCE_THRESHOLD,
        mediumConfidence: this.MEDIUM_CONFIDENCE_THRESHOLD,
      },
      modelInfo: {
        modelId: modelInfo.modelId,
        isLoaded: modelInfo.isLoaded,
        memoryUsage: modelInfo.memoryUsage,
        backend: modelInfo.backend,
        provider: modelInfo.provider,
        artifactPath: modelInfo.artifactPath,
        tensorCount: modelInfo.tensorCount,
        lastTensorDelta: modelInfo.lastTensorDelta,
      },
      cacheStats: {
        embeddingsCached: this.embeddingCache.size,
      },
    };
  }

  /**
   * Test the similarity engine with sample entities
   */
  async runSelfTest(): Promise<{
    success: boolean;
    results: Array<{
      test: string;
      similarity: number;
      passed: boolean;
    }>;
  }> {
    logger.info("Running similarity engine self-test...");

    const testCases = [
      {
        entity1: {
          name: "Dashboard Component Manager",
          entityType: "component",
          observations: [
            "Manages dashboard components",
            "Handles component lifecycle",
          ],
        } as Entity,
        entity2: {
          name: "Dashboard Grid System",
          entityType: "component",
          observations: [
            "Grid layout system for dashboard",
            "Responsive grid components",
          ],
        } as Entity,
        expectedMinSimilarity: 0.5,
        test: "Dashboard components should be similar",
      },
      {
        entity1: {
          name: "User Authentication Service",
          entityType: "service",
          observations: ["Handles user login", "JWT token management"],
        } as Entity,
        entity2: {
          name: "CSS Button Styling",
          entityType: "component",
          observations: [
            "Styled button with hover effects",
            "Color palette and border radius",
          ],
        } as Entity,
        expectedMinSimilarity: 0.0, // Should be low - truly unrelated concepts
        test: "Unrelated concepts should have low similarity",
      },
    ];

    const results = [];
    let allPassed = true;

    for (const testCase of testCases) {
      const similarity = await this.calculateSimilarity(
        testCase.entity1,
        testCase.entity2
      );

      const passed = testCase.test.includes("low")
        ? similarity < 0.5
        : similarity >= testCase.expectedMinSimilarity;

      if (!passed) allPassed = false;

      results.push({
        test: testCase.test,
        similarity,
        passed,
      });

      logger.info(
        `${passed ? "[SUCCESS]" : "[ERROR]"} [TEST] ${testCase.test}: ${(
          similarity * 100
        ).toFixed(1)}%`
      );
    }

    logger.info(`Self-test ${allPassed ? "PASSED" : "FAILED"}`);

    return {
      success: allPassed,
      results,
    };
  }

  /**
   * Health check for TensorFlow.js model and embedding system
   */
  async healthCheck(): Promise<{
    status: "healthy" | "degraded" | "unhealthy";
    message: string;
    timestamp: string;
  }> {
    try {
      if (!this.initialized) {
        return {
          status: "unhealthy",
          message: "TensorFlow.js similarity engine not initialized",
          timestamp: new Date().toISOString(),
        };
      }

      if (!this.modelManager.isReady()) {
        return {
          status: "unhealthy",
          message: "TensorFlow.js model not loaded",
          timestamp: new Date().toISOString(),
        };
      }

      // Quick functionality test with embeddings
      const testEntity: Entity = {
        name: "Health Check Test Entity",
        entityType: "test",
        observations: ["Testing TensorFlow.js embedding generation"],
      };

      const similarity = await this.calculateSimilarity(testEntity, testEntity);

      // Self-similarity should be very high (close to 1.0)
      if (similarity < 0.95) {
        return {
          status: "degraded",
          message: `TensorFlow.js model producing unexpected results (self-similarity: ${similarity.toFixed(
            3
          )})`,
          timestamp: new Date().toISOString(),
        };
      }

      const modelInfo = this.modelManager.getModelInfo();
      return {
        status: "healthy",
        message: `TensorFlow.js similarity engine operational (Model: ${
          modelInfo.modelId
        }, Memory: ${modelInfo.memoryUsage.toFixed(1)}MB, Cache: ${
          this.embeddingCache.size
        } embeddings)`,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: "unhealthy",
        message: `TensorFlow.js engine error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
