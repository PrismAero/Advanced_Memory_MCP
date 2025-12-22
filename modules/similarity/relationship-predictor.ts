import { Entity, Relation } from "../../memory-types.js";
import { logger } from "../logger.js";
import { ModernSimilarityEngine } from "./similarity-engine.js";

/**
 * Context-Aware Relationship Predictor using TensorFlow.js
 * Predicts high-confidence relationships between entities using semantic analysis
 */
export class RelationshipPredictor {
  private similarityEngine: ModernSimilarityEngine;

  // Relationship type templates for semantic comparison
  private readonly RELATIONSHIP_TEMPLATES: {
    [key: string]: {
      description: string;
      semanticContext: string;
      entityTypePairs: Array<{ from: string; to: string; confidence: number }>;
      patterns: string[];
      examples: string[];
    };
  } = {
    uses: {
      description: "One entity uses or depends on another",
      semanticContext:
        "Dependency relationship where the source entity requires or utilizes the target entity for functionality",
      entityTypePairs: [
        { from: "component", to: "service", confidence: 0.8 },
        { from: "service", to: "module", confidence: 0.7 },
        { from: "class", to: "interface", confidence: 0.9 },
        { from: "module", to: "class", confidence: 0.6 },
      ],
      patterns: ["uses", "utilizes", "depends on", "requires", "imports"],
      examples: [
        "UserComponent uses AuthService for authentication",
        "PaymentService uses DatabaseModule for data access",
        "OrderClass uses PaymentInterface for processing",
      ],
    },
    implements: {
      description: "One entity implements the specification of another",
      semanticContext:
        "Implementation relationship where the source entity provides concrete implementation of target specification",
      entityTypePairs: [
        { from: "class", to: "interface", confidence: 0.95 },
        { from: "service", to: "interface", confidence: 0.9 },
        { from: "component", to: "interface", confidence: 0.8 },
      ],
      patterns: [
        "implements",
        "realizes",
        "fulfills",
        "provides implementation",
      ],
      examples: [
        "DatabaseService implements DataInterface specification",
        "UserRepository implements RepositoryInterface contract",
        "PaymentGateway implements PaymentInterface methods",
      ],
    },
    contains: {
      description: "One entity contains or encompasses another",
      semanticContext:
        "Containment relationship where the source entity includes or encompasses the target entity",
      entityTypePairs: [
        { from: "module", to: "class", confidence: 0.8 },
        { from: "service", to: "component", confidence: 0.6 },
        { from: "component", to: "class", confidence: 0.7 },
      ],
      patterns: ["contains", "includes", "encompasses", "has", "holds"],
      examples: [
        "UserModule contains UserClass and UserService",
        "DashboardComponent contains multiple sub-components",
        "AuthService contains TokenValidator and UserManager",
      ],
    },
    addresses: {
      description: "One entity addresses or resolves another",
      semanticContext:
        "Resolution relationship where the source entity provides solution or response to target entity",
      entityTypePairs: [
        { from: "decision", to: "requirement", confidence: 0.9 },
        { from: "decision", to: "blocker", confidence: 0.85 },
        { from: "requirement", to: "blocker", confidence: 0.7 },
      ],
      patterns: ["addresses", "resolves", "solves", "handles", "responds to"],
      examples: [
        "Authentication Decision addresses Security Requirement",
        "Caching Strategy addresses Performance Blocker",
        "New Framework Decision resolves Technical Debt Issue",
      ],
    },
    blocks: {
      description: "One entity blocks or prevents progress on another",
      semanticContext:
        "Impediment relationship where the source entity prevents or hinders progress on target entity",
      entityTypePairs: [
        { from: "blocker", to: "requirement", confidence: 0.9 },
        { from: "blocker", to: "decision", confidence: 0.8 },
        { from: "blocker", to: "current-status", confidence: 0.7 },
      ],
      patterns: ["blocks", "prevents", "hinders", "impedes", "stops"],
      examples: [
        "Database Migration Blocker prevents New Feature Release",
        "Security Review Blocker blocks Deployment Decision",
        "Performance Issue blocks User Experience Improvement",
      ],
    },
    related_to: {
      description: "General semantic relationship between entities",
      semanticContext:
        "General relationship indicating semantic connection or relevance between entities",
      entityTypePairs: [
        { from: "component", to: "component", confidence: 0.6 },
        { from: "service", to: "service", confidence: 0.6 },
        { from: "decision", to: "decision", confidence: 0.7 },
        { from: "requirement", to: "requirement", confidence: 0.6 },
      ],
      patterns: [
        "related to",
        "connected with",
        "associated with",
        "linked to",
      ],
      examples: [
        "User Authentication relates to User Authorization",
        "Frontend Components relate to Backend Services",
        "Performance Requirements relate to Scalability Decisions",
      ],
    },
    extends: {
      description: "One entity extends or builds upon another",
      semanticContext:
        "Extension relationship where the source entity builds upon or enhances the target entity",
      entityTypePairs: [
        { from: "class", to: "class", confidence: 0.9 },
        { from: "component", to: "component", confidence: 0.8 },
        { from: "service", to: "service", confidence: 0.7 },
      ],
      patterns: ["extends", "inherits from", "builds upon", "enhances"],
      examples: [
        "AdminUser extends BaseUser with additional privileges",
        "AdvancedButton extends Button with custom styling",
        "EnhancedLogger extends Logger with additional features",
      ],
    },
  };

  constructor(similarityEngine: ModernSimilarityEngine) {
    this.similarityEngine = similarityEngine;
  }

  /**
   * Predict relationships between entities using multi-factor analysis
   */
  async predictRelationships(
    sourceEntity: Entity,
    candidateEntities: Entity[],
    context?: {
      existingRelations?: Relation[];
      branchName?: string;
      confidenceThreshold?: number;
    }
  ): Promise<
    Array<{
      targetEntity: Entity;
      predictedRelationType: string;
      confidence: number;
      reasoning: string;
      semanticSimilarity: number;
      contextFactors: {
        typeCompatibility: number;
        patternMatching: number;
        semanticRelevance: number;
      };
    }>
  > {
    const predictions: Array<{
      targetEntity: Entity;
      predictedRelationType: string;
      confidence: number;
      reasoning: string;
      semanticSimilarity: number;
      contextFactors: {
        typeCompatibility: number;
        patternMatching: number;
        semanticRelevance: number;
      };
    }> = [];

    const confidenceThreshold = context?.confidenceThreshold || 0.6;

    for (const candidate of candidateEntities) {
      if (candidate.name === sourceEntity.name) continue;

      try {
        const prediction = await this.predictSingleRelationship(
          sourceEntity,
          candidate,
          context
        );

        if (prediction.confidence >= confidenceThreshold) {
          predictions.push(prediction);
        }
      } catch (error) {
        logger.error(
          `Error predicting relationship between ${sourceEntity.name} and ${candidate.name}:`,
          error
        );
      }
    }

    // Sort by confidence and return top predictions
    return predictions.sort((a, b) => b.confidence - a.confidence).slice(0, 10); // Limit to top 10 predictions
  }

  /**
   * Predict single relationship between two entities
   */
  private async predictSingleRelationship(
    sourceEntity: Entity,
    targetEntity: Entity,
    context?: {
      existingRelations?: Relation[];
      branchName?: string;
    }
  ): Promise<{
    targetEntity: Entity;
    predictedRelationType: string;
    confidence: number;
    reasoning: string;
    semanticSimilarity: number;
    contextFactors: {
      typeCompatibility: number;
      patternMatching: number;
      semanticRelevance: number;
    };
  }> {
    // Calculate base semantic similarity
    const semanticSimilarity = await this.similarityEngine.calculateSimilarity(
      sourceEntity,
      targetEntity
    );

    // Analyze each relationship type
    const relationshipScores: Array<{
      type: string;
      score: number;
      reasoning: string;
      contextFactors: {
        typeCompatibility: number;
        patternMatching: number;
        semanticRelevance: number;
      };
    }> = [];

    for (const [relationType, template] of Object.entries(
      this.RELATIONSHIP_TEMPLATES
    )) {
      const analysis = await this.analyzeRelationshipType(
        sourceEntity,
        targetEntity,
        relationType,
        template,
        semanticSimilarity
      );

      relationshipScores.push(analysis);
    }

    // Find best relationship type
    relationshipScores.sort((a, b) => b.score - a.score);
    const bestPrediction = relationshipScores[0];

    // Apply contextual boosting
    const contextBoost = await this.calculateContextualBoost(
      sourceEntity,
      targetEntity,
      bestPrediction.type,
      context
    );

    const finalConfidence = Math.min(bestPrediction.score + contextBoost, 1.0);

    return {
      targetEntity,
      predictedRelationType: bestPrediction.type,
      confidence: finalConfidence,
      reasoning: this.generatePredictionReasoning(
        bestPrediction,
        semanticSimilarity,
        contextBoost
      ),
      semanticSimilarity,
      contextFactors: bestPrediction.contextFactors,
    };
  }

  /**
   * Analyze specific relationship type between entities
   */
  private async analyzeRelationshipType(
    sourceEntity: Entity,
    targetEntity: Entity,
    relationType: string,
    template: (typeof this.RELATIONSHIP_TEMPLATES)[string],
    baseSimilarity: number
  ): Promise<{
    type: string;
    score: number;
    reasoning: string;
    contextFactors: {
      typeCompatibility: number;
      patternMatching: number;
      semanticRelevance: number;
    };
  }> {
    // Factor 1: Entity type compatibility
    const typeCompatibility = this.calculateTypeCompatibility(
      sourceEntity.entityType,
      targetEntity.entityType,
      template.entityTypePairs
    );

    // Factor 2: Pattern matching in entity content
    const patternMatching = this.calculatePatternMatching(
      sourceEntity,
      targetEntity,
      template.patterns
    );

    // Factor 3: Semantic relevance to relationship context
    const semanticRelevance = await this.calculateSemanticRelevance(
      sourceEntity,
      targetEntity,
      template.semanticContext
    );

    // Combine factors with weights
    const combinedScore =
      baseSimilarity * 0.3 +
      typeCompatibility * 0.25 +
      patternMatching * 0.2 +
      semanticRelevance * 0.25;

    return {
      type: relationType,
      score: combinedScore,
      reasoning: this.generateAnalysisReasoning(
        relationType,
        typeCompatibility,
        patternMatching,
        semanticRelevance
      ),
      contextFactors: {
        typeCompatibility,
        patternMatching,
        semanticRelevance,
      },
    };
  }

  /**
   * Calculate type compatibility score
   */
  private calculateTypeCompatibility(
    sourceType: string,
    targetType: string,
    typePairs: Array<{ from: string; to: string; confidence: number }>
  ): number {
    const exactMatch = typePairs.find(
      (pair) => pair.from === sourceType && pair.to === targetType
    );

    if (exactMatch) {
      return exactMatch.confidence;
    }

    // Check reverse direction with lower confidence
    const reverseMatch = typePairs.find(
      (pair) => pair.from === targetType && pair.to === sourceType
    );

    if (reverseMatch) {
      return reverseMatch.confidence * 0.7;
    }

    // Same type compatibility
    if (sourceType === targetType) {
      return 0.5;
    }

    return 0.2; // Default low compatibility
  }

  /**
   * Calculate pattern matching score
   */
  private calculatePatternMatching(
    sourceEntity: Entity,
    targetEntity: Entity,
    patterns: string[]
  ): number {
    const combinedText = [
      sourceEntity.name,
      sourceEntity.content || "",
      ...(sourceEntity.observations || []),
      targetEntity.name,
      targetEntity.content || "",
      ...(targetEntity.observations || []),
    ]
      .join(" ")
      .toLowerCase();

    const matchingPatterns = patterns.filter((pattern) =>
      combinedText.includes(pattern.toLowerCase())
    );

    return matchingPatterns.length / patterns.length;
  }

  /**
   * Calculate semantic relevance to relationship context
   */
  private async calculateSemanticRelevance(
    sourceEntity: Entity,
    targetEntity: Entity,
    relationshipContext: string
  ): Promise<number> {
    try {
      // Create a synthetic entity representing the relationship context
      const contextEntity: Entity = {
        name: "Relationship Context",
        entityType: "context",
        content: relationshipContext,
        observations: [relationshipContext],
      };

      // Calculate how well both entities relate to this relationship context
      const sourceRelevance = await this.similarityEngine.calculateSimilarity(
        sourceEntity,
        contextEntity
      );

      const targetRelevance = await this.similarityEngine.calculateSimilarity(
        targetEntity,
        contextEntity
      );

      // Return average relevance
      return (sourceRelevance + targetRelevance) / 2;
    } catch (error) {
      logger.error("Error calculating semantic relevance:", error);
      return 0.3; // Default moderate relevance
    }
  }

  /**
   * Calculate contextual boost based on existing relationships and patterns
   */
  private async calculateContextualBoost(
    sourceEntity: Entity,
    targetEntity: Entity,
    predictedType: string,
    context?: {
      existingRelations?: Relation[];
      branchName?: string;
    }
  ): Promise<number> {
    let boost = 0;

    if (context?.existingRelations) {
      // Boost if similar relationship patterns exist
      const similarPatterns = context.existingRelations.filter(
        (rel) =>
          rel.relationType === predictedType ||
          rel.from === sourceEntity.name ||
          rel.to === sourceEntity.name ||
          rel.from === targetEntity.name ||
          rel.to === targetEntity.name
      );

      boost += Math.min(similarPatterns.length * 0.05, 0.15);
    }

    // Boost for high-confidence entity types
    if (sourceEntity.entityType && targetEntity.entityType) {
      const template = this.RELATIONSHIP_TEMPLATES[predictedType];
      const typeMatch = template.entityTypePairs.find(
        (pair) =>
          pair.from === sourceEntity.entityType &&
          pair.to === targetEntity.entityType
      );

      if (typeMatch && typeMatch.confidence > 0.8) {
        boost += 0.1;
      }
    }

    return boost;
  }

  /**
   * Generate human-readable analysis reasoning
   */
  private generateAnalysisReasoning(
    relationType: string,
    typeCompatibility: number,
    patternMatching: number,
    semanticRelevance: number
  ): string {
    const factors: string[] = [];

    if (typeCompatibility > 0.7) {
      factors.push(
        `Strong entity type compatibility (${(typeCompatibility * 100).toFixed(
          0
        )}%)`
      );
    } else if (typeCompatibility > 0.4) {
      factors.push(
        `Moderate entity type compatibility (${(
          typeCompatibility * 100
        ).toFixed(0)}%)`
      );
    }

    if (patternMatching > 0.6) {
      factors.push(`High pattern matching for ${relationType} relationships`);
    } else if (patternMatching > 0.3) {
      factors.push(`Some pattern indicators for ${relationType} relationships`);
    }

    if (semanticRelevance > 0.7) {
      factors.push(`Strong semantic relevance to ${relationType} context`);
    } else if (semanticRelevance > 0.4) {
      factors.push(`Moderate semantic relevance to ${relationType} context`);
    }

    return factors.length > 0
      ? factors.join("; ")
      : `TensorFlow.js semantic analysis suggests ${relationType} relationship`;
  }

  /**
   * Generate comprehensive prediction reasoning
   */
  private generatePredictionReasoning(
    bestPrediction: {
      type: string;
      score: number;
      reasoning: string;
    },
    semanticSimilarity: number,
    contextBoost: number
  ): string {
    const components: string[] = [];

    components.push(
      `Predicted ${bestPrediction.type} relationship (${(
        bestPrediction.score * 100
      ).toFixed(1)}% base confidence)`
    );

    if (semanticSimilarity > 0.6) {
      components.push(
        `High semantic similarity (${(semanticSimilarity * 100).toFixed(1)}%)`
      );
    }

    components.push(bestPrediction.reasoning);

    if (contextBoost > 0.05) {
      components.push(`Contextual boost: +${(contextBoost * 100).toFixed(1)}%`);
    }

    return components.join("; ");
  }

  /**
   * Batch predict relationships for multiple entity pairs
   */
  async predictRelationshipsBatch(
    entityPairs: Array<{ source: Entity; targets: Entity[] }>,
    context?: {
      existingRelations?: Relation[];
      branchName?: string;
      confidenceThreshold?: number;
    }
  ): Promise<
    Map<
      string,
      Array<{
        targetEntity: Entity;
        predictedRelationType: string;
        confidence: number;
        reasoning: string;
      }>
    >
  > {
    const results = new Map<
      string,
      Array<{
        targetEntity: Entity;
        predictedRelationType: string;
        confidence: number;
        reasoning: string;
      }>
    >();

    for (const { source, targets } of entityPairs) {
      try {
        const predictions = await this.predictRelationships(
          source,
          targets,
          context
        );
        results.set(
          source.name,
          predictions.map((p) => ({
            targetEntity: p.targetEntity,
            predictedRelationType: p.predictedRelationType,
            confidence: p.confidence,
            reasoning: p.reasoning,
          }))
        );
      } catch (error) {
        logger.error(`Error in batch prediction for ${source.name}:`, error);
        results.set(source.name, []);
      }

      // Small delay to prevent overwhelming the TF.js engine
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return results;
  }

  /**
   * Get relationship statistics and patterns
   */
  getRelationshipStats(): {
    supportedTypes: string[];
    typeTemplates: {
      [key: string]: { description: string; examples: string[] };
    };
    averageConfidenceThresholds: { [key: string]: number };
  } {
    const supportedTypes = Object.keys(this.RELATIONSHIP_TEMPLATES);

    const typeTemplates: {
      [key: string]: { description: string; examples: string[] };
    } = {};
    const averageConfidenceThresholds: { [key: string]: number } = {};

    for (const [type, template] of Object.entries(
      this.RELATIONSHIP_TEMPLATES
    )) {
      typeTemplates[type] = {
        description: template.description,
        examples: template.examples,
      };

      // Calculate average confidence threshold for this type
      const avgConfidence =
        template.entityTypePairs.reduce(
          (sum, pair) => sum + pair.confidence,
          0
        ) / template.entityTypePairs.length;
      averageConfidenceThresholds[type] = avgConfidence;
    }

    return {
      supportedTypes,
      typeTemplates,
      averageConfidenceThresholds,
    };
  }
}
