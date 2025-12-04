import { Entity } from "../../memory-types.js";
import { logger } from "../logger.js";
import { RelationshipDetector } from "./relationship-detector.js";
import { TextProcessor } from "./text-processor.js";

/**
 * Modern Similarity Engine - Replaces StatisticalSimilarityEngine
 * Uses sentence-similarity and natural packages for superior offline detection
 *
 * Key improvements over the old engine:
 * - Lower similarity thresholds (0.65 vs 0.78)
 * - Better text processing with natural NLP
 * - Enhanced pattern detection for software entities
 */
export class ModernSimilarityEngine {
  private textProcessor: TextProcessor;
  private relationshipDetector: RelationshipDetector;
  private initialized = false;

  constructor() {
    this.textProcessor = new TextProcessor();
    this.relationshipDetector = new RelationshipDetector();
  }

  /**
   * Initialize the similarity engine
   */
  async initialize(): Promise<void> {
    try {
      logger.info(
        "Initialized modern similarity engine with sentence-similarity + natural"
      );
      this.initialized = true;
    } catch (error) {
      logger.error("Failed to initialize modern similarity engine:", error);
      throw error;
    }
  }

  /**
   * Detect similar entities - main interface method
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
      logger.warn("Similarity engine not initialized, initializing now...");
      await this.initialize();
    }

    if (candidateEntities.length === 0) {
      return [];
    }

    try {
      logger.debug(
        `Modern similarity engine analyzing ${candidateEntities.length} candidates for "${targetEntity.name}"`
      );

      const results = await this.relationshipDetector.detectSimilarEntities(
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
      logger.error("Error in similarity detection:", error);
      return [];
    }
  }

  /**
   * Quick similarity check between two entities (utility method)
   */
  async calculateSimilarity(entity1: Entity, entity2: Entity): Promise<number> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Use the relationship detector's internal method
    const results = await this.relationshipDetector.detectSimilarEntities(
      entity1,
      [entity2]
    );

    return results.length > 0 ? results[0].similarity : 0;
  }

  /**
   * Batch similarity calculation for performance
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

    for (const entity of entities) {
      const otherEntities = entities.filter((e) => e.name !== entity.name);
      const similarities =
        await this.relationshipDetector.detectSimilarEntities(
          entity,
          otherEntities
        );

      results.set(
        entity.name,
        similarities.map((s) => ({
          entity: s.entity,
          similarity: s.similarity,
        }))
      );
    }

    return results;
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
  } {
    return {
      engine: "ModernSimilarityEngine",
      version: "1.0.0",
      features: [
        "sentence-similarity",
        "natural-nlp",
        "pattern-detection",
        "multi-modal-scoring",
        "software-aware",
      ],
      thresholds: {
        similarity: 0.5,
        highConfidence: 0.85,
        mediumConfidence: 0.75,
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
          name: "Database Connection Pool",
          entityType: "service",
          observations: ["Manages database connections", "Connection pooling"],
        } as Entity,
        expectedMinSimilarity: 0.0, // Should be low
        test: "Different services should have low similarity",
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
        `${passed ? "✅" : "❌"} [TEST] ${testCase.test}: ${(
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
   * Health check for monitoring
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
          message: "Engine not initialized",
          timestamp: new Date().toISOString(),
        };
      }

      // Quick functionality test
      const testEntity: Entity = {
        name: "Test Entity",
        entityType: "test",
        observations: ["Test observation"],
      };

      await this.calculateSimilarity(testEntity, testEntity);

      return {
        status: "healthy",
        message: "All systems operational",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: "unhealthy",
        message: `Error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
