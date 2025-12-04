import { Entity } from "../../memory-types.js";
import { TextProcessor } from "./text-processor.js";

/**
 * Relationship detection logic using modern similarity algorithms
 * Handles entity relationship inference and scoring
 */
export class RelationshipDetector {
  private textProcessor: TextProcessor;

  // Configurable thresholds for better results
  private readonly SIMILARITY_THRESHOLD = 0.5; // Lowered for realistic detection
  private readonly HIGH_CONFIDENCE_THRESHOLD = 0.85;
  private readonly MEDIUM_CONFIDENCE_THRESHOLD = 0.75;

  constructor() {
    this.textProcessor = new TextProcessor();
  }

  /**
   * Detect relationships between entities using multiple similarity approaches
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
    const results: Array<{
      entity: Entity;
      similarity: number;
      confidence: "high" | "medium" | "low";
      suggestedRelationType: string;
      reasoning: string;
    }> = [];

    for (const candidate of candidateEntities) {
      if (candidate.name === targetEntity.name) continue;

      const similarity = this.calculateEntitySimilarity(
        targetEntity,
        candidate
      );

      if (similarity > this.SIMILARITY_THRESHOLD) {
        const confidence = this.determineConfidence(similarity);
        const { relationType, reasoning } = this.inferRelationshipType(
          targetEntity,
          candidate,
          similarity
        );

        results.push({
          entity: candidate,
          similarity,
          confidence,
          suggestedRelationType: relationType,
          reasoning,
        });
      }
    }

    // Sort by similarity score and limit results
    return results.sort((a, b) => b.similarity - a.similarity).slice(0, 8);
  }

  /**
   * Calculate comprehensive entity similarity using multiple algorithms
   */
  private calculateEntitySimilarity(entity1: Entity, entity2: Entity): number {
    // 1. Name similarity (most important)
    const nameSimilarity = this.textProcessor.calculateSentenceSimilarity(
      entity1.name,
      entity2.name
    );

    // 2. Type similarity
    const typeSimilarity = this.calculateTypeSimilarity(entity1, entity2);

    // 3. Content similarity (observations)
    const contentSimilarity = this.calculateContentSimilarity(entity1, entity2);

    // 4. Pattern-based similarity (software-specific)
    const patternResult = this.textProcessor.detectNamePatterns(
      entity1.name,
      entity2.name
    );

    // 5. Structural similarity
    const structuralSimilarity = this.calculateStructuralSimilarity(
      entity1,
      entity2
    );

    // Weighted combination - name and patterns are most important
    const weights = {
      name: 0.35,
      type: 0.2,
      content: 0.25,
      pattern: 0.15,
      structural: 0.05,
    };

    const finalScore =
      weights.name * nameSimilarity +
      weights.type * typeSimilarity +
      weights.content * contentSimilarity +
      weights.pattern * patternResult.score +
      weights.structural * structuralSimilarity;

    return Math.min(finalScore, 1.0);
  }

  /**
   * Calculate type similarity with enhanced matching
   */
  private calculateTypeSimilarity(entity1: Entity, entity2: Entity): number {
    if (entity1.entityType === entity2.entityType) {
      return 1.0;
    }

    // Use text processor for semantic type comparison
    return this.textProcessor.calculateSentenceSimilarity(
      entity1.entityType,
      entity2.entityType
    );
  }

  /**
   * Calculate content similarity from observations
   */
  private calculateContentSimilarity(entity1: Entity, entity2: Entity): number {
    const content1 = (entity1.observations || []).join(" ");
    const content2 = (entity2.observations || []).join(" ");

    if (!content1 || !content2) return 0.3; // Neutral score for missing content

    return this.textProcessor.calculateSemanticSimilarity(content1, content2);
  }

  /**
   * Calculate structural similarity based on entity properties
   */
  private calculateStructuralSimilarity(
    entity1: Entity,
    entity2: Entity
  ): number {
    let score = 0;

    // Observation count similarity
    const obsCount1 = entity1.observations?.length || 0;
    const obsCount2 = entity2.observations?.length || 0;

    if (obsCount1 > 0 && obsCount2 > 0) {
      const countSimilarity =
        1 - Math.abs(obsCount1 - obsCount2) / Math.max(obsCount1, obsCount2);
      score += countSimilarity * 0.4;
    }

    // Status similarity
    if (entity1.status === entity2.status) {
      score += 0.3;
    }

    // Note: Creation time proximity not available in current Entity type
    // Could be added as future enhancement if timestamp tracking is needed

    return Math.min(score, 1.0);
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
   * Infer relationship type based on entity analysis
   */
  private inferRelationshipType(
    entity1: Entity,
    entity2: Entity,
    similarity: number
  ): {
    relationType: string;
    reasoning: string;
  } {
    const type1 = entity1.entityType.toLowerCase();
    const type2 = entity2.entityType.toLowerCase();
    const name1 = entity1.name.toLowerCase();
    const name2 = entity2.name.toLowerCase();

    // 1. Containment relationships (hierarchical)
    if (name1.includes(name2) || name2.includes(name1)) {
      const isParent = name1.length > name2.length;
      return {
        relationType: isParent ? "contains" : "part_of",
        reasoning: `Name containment detected: "${
          isParent ? name1 : name2
        }" contains "${isParent ? name2 : name1}"`,
      };
    }

    // 2. Same type relationships
    if (type1 === type2) {
      if (similarity > 0.9) {
        return {
          relationType: "similar_to",
          reasoning: `Very high similarity (${similarity.toFixed(
            2
          )}) between same-type entities`,
        };
      } else {
        return {
          relationType: "related_to",
          reasoning: `Same entity type: ${type1}`,
        };
      }
    }

    // 3. High similarity default
    if (similarity > 0.9) {
      return {
        relationType: "closely_related",
        reasoning: `Extremely high similarity score (${similarity.toFixed(2)})`,
      };
    }

    // 4. Default semantic relationship
    return {
      relationType: "related_to",
      reasoning: `Semantic similarity detected (${similarity.toFixed(2)})`,
    };
  }

  /**
   * Get human-readable relationship explanation
   */
  getRelationshipExplanation(
    entity1: Entity,
    entity2: Entity,
    relationType: string,
    similarity: number
  ): string {
    const confidence = this.determineConfidence(similarity);
    const confidenceText = {
      high: "Very confident",
      medium: "Moderately confident",
      low: "Somewhat confident",
    }[confidence];

    return `${confidenceText} that "${entity1.name}" ${relationType.replace(
      /_/g,
      " "
    )} "${entity2.name}" (similarity: ${(similarity * 100).toFixed(1)}%)`;
  }
}
