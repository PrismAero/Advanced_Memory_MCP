import { Entity } from "../../memory-types.js";
import { ModernSimilarityEngine } from "./similarity-engine.js";

/**
 * Semantic Entity Classifier using TensorFlow.js embeddings
 * Automatically classifies entities and suggests metadata improvements
 */
export class EntityClassifier {
  private similarityEngine: ModernSimilarityEngine;
  private entityTypeTemplates: Map<string, Entity[]> = new Map();

  // Entity type classification rules based on semantic patterns
  private readonly TYPE_CLASSIFICATION_RULES: {
    [key: string]: {
      keywords: string[];
      patterns: string[];
      semanticContext: string;
      confidence: number;
    };
  } = {
    component: {
      keywords: ["component", "widget", "element", "ui", "interface"],
      patterns: ["Component", "Widget", "Element", ".tsx", ".jsx", "React"],
      semanticContext:
        "User interface component or reusable element in a software system",
      confidence: 0.8,
    },
    service: {
      keywords: ["service", "api", "endpoint", "handler", "controller"],
      patterns: ["Service", "API", "Handler", "Controller", "Endpoint"],
      semanticContext:
        "Service layer functionality providing business logic or external communication",
      confidence: 0.85,
    },
    module: {
      keywords: ["module", "package", "library", "utility", "helper"],
      patterns: ["Module", "Util", "Helper", "Lib", ".mod", "package"],
      semanticContext:
        "Modular code organization unit containing related functionality",
      confidence: 0.7,
    },
    class: {
      keywords: ["class", "object", "entity", "model", "data"],
      patterns: ["class ", "Class", "Model", "Entity", "Object"],
      semanticContext:
        "Object-oriented programming construct representing a data structure or behavior",
      confidence: 0.75,
    },
    interface: {
      keywords: ["interface", "contract", "protocol", "specification"],
      patterns: ["interface ", "Interface", "Protocol", "Contract", "Spec"],
      semanticContext:
        "Contract or specification defining expected behavior and structure",
      confidence: 0.8,
    },
    decision: {
      keywords: ["decision", "choice", "option", "alternative", "resolution"],
      patterns: ["decided", "choose", "selected", "resolved", "determined"],
      semanticContext:
        "Documented decision or choice made during development or design process",
      confidence: 0.9,
    },
    blocker: {
      keywords: ["blocker", "issue", "problem", "obstacle", "impediment"],
      patterns: ["blocked", "blocking", "issue", "problem", "stuck", "cannot"],
      semanticContext:
        "Obstacle or issue preventing progress on a task or feature",
      confidence: 0.85,
    },
    requirement: {
      keywords: ["requirement", "need", "must", "should", "specification"],
      patterns: [
        "required",
        "must have",
        "need to",
        "should be",
        "requirement",
      ],
      semanticContext:
        "Functional or non-functional requirement for the system",
      confidence: 0.8,
    },
    "current-status": {
      keywords: ["status", "progress", "update", "current", "ongoing"],
      patterns: ["currently", "in progress", "status", "working on", "update"],
      semanticContext:
        "Current state or progress information about a task or project",
      confidence: 0.75,
    },
  };

  constructor(similarityEngine: ModernSimilarityEngine) {
    this.similarityEngine = similarityEngine;
    this.initializeTypeTemplates();
  }

  /**
   * Initialize type templates for semantic comparison
   */
  private initializeTypeTemplates(): void {
    for (const [type, rules] of Object.entries(
      this.TYPE_CLASSIFICATION_RULES
    )) {
      const templates: Entity[] = [
        {
          name: `Example ${type}`,
          entityType: type,
          content: rules.semanticContext,
          observations: [
            rules.semanticContext,
            ...rules.keywords.map((keyword) => `Related to ${keyword}`),
          ],
        },
      ];
      this.entityTypeTemplates.set(type, templates);
    }
  }

  /**
   * Classify entity type using TensorFlow.js semantic analysis
   */
  async classifyEntityType(entity: Entity): Promise<{
    suggestedType: string;
    confidence: number;
    reasoning: string;
    alternatives: Array<{ type: string; confidence: number }>;
  }> {
    try {
      // Get semantic similarities to all type templates
      const typeScores: Array<{
        type: string;
        confidence: number;
        reasoning: string;
      }> = [];

      for (const [type, templates] of this.entityTypeTemplates.entries()) {
        let maxConfidence = 0;
        let bestReasoning = "";

        for (const template of templates) {
          const similarity = await this.similarityEngine.calculateSimilarity(
            entity,
            template
          );

          // Apply rule-based boosting
          const rules = this.TYPE_CLASSIFICATION_RULES[type];
          const ruleBoost = this.calculateRuleBoost(entity, rules);
          const finalConfidence = similarity * 0.7 + ruleBoost * 0.3;

          if (finalConfidence > maxConfidence) {
            maxConfidence = finalConfidence;
            bestReasoning = this.generateClassificationReasoning(
              entity,
              type,
              similarity,
              ruleBoost
            );
          }
        }

        if (maxConfidence > 0.3) {
          // Minimum threshold
          typeScores.push({
            type,
            confidence: maxConfidence,
            reasoning: bestReasoning,
          });
        }
      }

      // Sort by confidence
      typeScores.sort((a, b) => b.confidence - a.confidence);

      if (typeScores.length === 0) {
        return {
          suggestedType: entity.entityType || "unknown",
          confidence: 0.1,
          reasoning: "No clear semantic classification found",
          alternatives: [],
        };
      }

      const best = typeScores[0];
      const alternatives = typeScores.slice(1, 4); // Top 3 alternatives

      return {
        suggestedType: best.type,
        confidence: best.confidence,
        reasoning: best.reasoning,
        alternatives,
      };
    } catch (error) {
      console.error("Error in entity type classification:", error);
      return {
        suggestedType: entity.entityType || "unknown",
        confidence: 0.0,
        reasoning: "Classification failed due to error",
        alternatives: [],
      };
    }
  }

  /**
   * Calculate rule-based boost score
   */
  private calculateRuleBoost(
    entity: Entity,
    rules: (typeof this.TYPE_CLASSIFICATION_RULES)[string]
  ): number {
    let score = 0;
    const entityText = this.entityToText(entity).toLowerCase();

    // Keyword matching
    const keywordMatches = rules.keywords.filter((keyword) =>
      entityText.includes(keyword.toLowerCase())
    ).length;
    score += (keywordMatches / rules.keywords.length) * 0.4;

    // Pattern matching
    const patternMatches = rules.patterns.filter((pattern) =>
      entityText.includes(pattern.toLowerCase())
    ).length;
    score += (patternMatches / rules.patterns.length) * 0.4;

    // Base confidence from rules
    score += rules.confidence * 0.2;

    return Math.min(score, 1.0);
  }

  /**
   * Generate human-readable classification reasoning
   */
  private generateClassificationReasoning(
    entity: Entity,
    suggestedType: string,
    semanticSimilarity: number,
    ruleBoost: number
  ): string {
    const reasons: string[] = [];

    if (semanticSimilarity > 0.7) {
      reasons.push(
        `High semantic similarity (${(semanticSimilarity * 100).toFixed(
          1
        )}%) to ${suggestedType} patterns`
      );
    } else if (semanticSimilarity > 0.5) {
      reasons.push(
        `Moderate semantic similarity (${(semanticSimilarity * 100).toFixed(
          1
        )}%) to ${suggestedType} patterns`
      );
    }

    if (ruleBoost > 0.6) {
      reasons.push(`Strong rule-based indicators for ${suggestedType} type`);
    } else if (ruleBoost > 0.3) {
      reasons.push(`Some rule-based indicators for ${suggestedType} type`);
    }

    const rules = this.TYPE_CLASSIFICATION_RULES[suggestedType];
    const entityText = this.entityToText(entity).toLowerCase();
    const matchedKeywords = rules.keywords.filter((keyword) =>
      entityText.includes(keyword.toLowerCase())
    );

    if (matchedKeywords.length > 0) {
      reasons.push(`Contains keywords: ${matchedKeywords.join(", ")}`);
    }

    return reasons.length > 0
      ? reasons.join("; ")
      : "Based on TensorFlow.js semantic analysis";
  }

  /**
   * Suggest metadata improvements for an entity
   */
  async suggestMetadataImprovements(entity: Entity): Promise<{
    suggestions: Array<{
      type: "content" | "observations" | "entityType" | "crossReferences";
      current?: string;
      suggested: string;
      reasoning: string;
      confidence: number;
    }>;
  }> {
    const suggestions: Array<{
      type: "content" | "observations" | "entityType" | "crossReferences";
      current?: string;
      suggested: string;
      reasoning: string;
      confidence: number;
    }> = [];

    // Suggest entity type improvement
    const classification = await this.classifyEntityType(entity);
    if (
      classification.confidence > 0.6 &&
      classification.suggestedType !== entity.entityType
    ) {
      suggestions.push({
        type: "entityType",
        current: entity.entityType,
        suggested: classification.suggestedType,
        reasoning: `TensorFlow.js classification: ${classification.reasoning}`,
        confidence: classification.confidence,
      });
    }

    // Suggest content improvements
    if (!entity.content || entity.content.length < 50) {
      const suggestedContent = await this.generateContentSuggestion(entity);
      if (suggestedContent) {
        suggestions.push({
          type: "content",
          current: entity.content || "",
          suggested: suggestedContent,
          reasoning:
            "Generated descriptive content based on entity name and type",
          confidence: 0.7,
        });
      }
    }

    // Suggest observation improvements
    if (!entity.observations || entity.observations.length < 2) {
      const suggestedObservations = await this.generateObservationSuggestions(
        entity
      );
      suggestions.push({
        type: "observations",
        current: entity.observations?.join("; ") || "",
        suggested: suggestedObservations.join("; "),
        reasoning:
          "Generated observations based on entity type and semantic context",
        confidence: 0.6,
      });
    }

    return { suggestions };
  }

  /**
   * Generate content suggestion based on entity analysis
   */
  private async generateContentSuggestion(
    entity: Entity
  ): Promise<string | null> {
    const type = entity.entityType;
    const name = entity.name;

    const templates: { [key: string]: string } = {
      component: `${name} is a user interface component responsible for rendering and managing interactive elements in the application.`,
      service: `${name} is a service layer component that provides business logic and handles data processing operations.`,
      module: `${name} is a modular code unit that encapsulates related functionality and provides a clean interface for external usage.`,
      class: `${name} is a class that defines the structure and behavior of objects in the system.`,
      interface: `${name} defines a contract or specification that describes expected behavior and method signatures.`,
      decision: `${name} represents a documented decision made during the development process, including context and rationale.`,
      blocker: `${name} is an identified obstacle or issue that needs to be resolved to continue progress on the project.`,
      requirement: `${name} specifies a functional or non-functional requirement that the system must fulfill.`,
      "current-status": `${name} provides current status information about ongoing work or project progress.`,
    };

    return (
      templates[type] ||
      `${name} is a ${type} in the system that requires further documentation.`
    );
  }

  /**
   * Generate observation suggestions based on entity context
   */
  private async generateObservationSuggestions(
    entity: Entity
  ): Promise<string[]> {
    const type = entity.entityType;
    const name = entity.name;

    const observationTemplates: { [key: string]: string[] } = {
      component: [
        "Renders user interface elements",
        "Manages component state and interactions",
        "Follows established design patterns and accessibility guidelines",
      ],
      service: [
        "Implements business logic operations",
        "Handles data validation and processing",
        "Provides API endpoints or service methods",
      ],
      module: [
        "Exports public interfaces and functions",
        "Encapsulates related functionality",
        "Maintains clear separation of concerns",
      ],
      class: [
        "Defines object structure and methods",
        "Implements inheritance or composition patterns",
        "Manages object lifecycle and state",
      ],
      interface: [
        "Specifies method signatures and contracts",
        "Defines expected behavior and constraints",
        "Enables polymorphism and loose coupling",
      ],
      decision: [
        "Documents decision rationale and context",
        "Includes considered alternatives and trade-offs",
        "Specifies implementation approach and timeline",
      ],
      blocker: [
        "Describes the specific blocking issue or obstacle",
        "Identifies potential solutions and workarounds",
        "Tracks resolution progress and status updates",
      ],
      requirement: [
        "Specifies functional or performance requirements",
        "Defines acceptance criteria and testing approach",
        "Links to related features and dependencies",
      ],
      "current-status": [
        "Provides current progress and completion status",
        "Identifies next steps and upcoming milestones",
        "Notes any risks or issues affecting timeline",
      ],
    };

    const baseObservations = observationTemplates[type] || [
      "Requires further analysis and documentation",
      "Part of the overall system architecture",
      "May have dependencies on other components",
    ];

    // Customize observations based on entity name
    return baseObservations.map((obs) =>
      obs.replace(/component|entity|item/g, name.toLowerCase())
    );
  }

  /**
   * Convert entity to text for analysis
   */
  private entityToText(entity: Entity): string {
    const parts: string[] = [entity.name];

    if (entity.content) {
      parts.push(entity.content);
    }

    if (entity.observations) {
      parts.push(...entity.observations);
    }

    return parts.join(" ");
  }

  /**
   * Batch classify multiple entities for efficiency
   */
  async classifyEntitiesBatch(entities: Entity[]): Promise<
    Map<
      string,
      {
        suggestedType: string;
        confidence: number;
        reasoning: string;
      }
    >
  > {
    const results = new Map<
      string,
      {
        suggestedType: string;
        confidence: number;
        reasoning: string;
      }
    >();

    // Process in smaller batches to avoid overwhelming the system
    const batchSize = 10;
    for (let i = 0; i < entities.length; i += batchSize) {
      const batch = entities.slice(i, i + batchSize);

      for (const entity of batch) {
        try {
          const classification = await this.classifyEntityType(entity);
          results.set(entity.name, {
            suggestedType: classification.suggestedType,
            confidence: classification.confidence,
            reasoning: classification.reasoning,
          });
        } catch (error) {
          console.error(`Error classifying entity ${entity.name}:`, error);
          results.set(entity.name, {
            suggestedType: entity.entityType || "unknown",
            confidence: 0.0,
            reasoning: "Classification failed",
          });
        }
      }

      // Small delay between batches to prevent overwhelming the TF.js engine
      if (i + batchSize < entities.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return results;
  }
}
