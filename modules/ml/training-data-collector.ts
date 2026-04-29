import { EventEmitter } from "events";
import { Entity } from "../../memory-types.js";
import { logger } from "../logger.js";
import { TrainingDataPoint } from "./adaptive-model-trainer.js";

/**
 * User interaction types for training data collection
 */
export type UserInteractionType =
  | "search_query"
  | "entity_creation"
  | "entity_update"
  | "relationship_creation"
  | "interface_usage"
  | "context_retrieval"
  | "navigation_action"
  | "feedback_rating";

/**
 * Search interaction data
 */
export interface SearchInteraction {
  query: string;
  results: Entity[];
  selected_results: string[]; // Entity names that user interacted with
  search_type: "semantic" | "text" | "hybrid";
  response_time: number;
  user_satisfaction?: number; // 1-5 rating
  context?: string;
  session_id: string;
  timestamp: Date;
}

/**
 * Relationship discovery interaction
 */
export interface RelationshipInteraction {
  source_entity: string;
  target_entity: string;
  relationship_type: string;
  discovered_by: "user" | "system" | "suggestion";
  confidence: number;
  user_confirmed: boolean;
  context: string;
  session_id: string;
  timestamp: Date;
}

/**
 * Interface usage pattern
 */
export interface InterfaceUsagePattern {
  interface_id: number;
  interface_name: string;
  usage_context: string;
  file_context: string;
  success_indicators: {
    compilation_success: boolean;
    runtime_success: boolean;
    user_satisfaction?: number;
  };
  related_interfaces: number[];
  session_id: string;
  timestamp: Date;
}

/**
 * Context retrieval feedback
 */
export interface ContextRetrievalFeedback {
  query: string;
  retrieved_context: string[];
  user_rating: number; // 1-5
  missing_context?: string[];
  irrelevant_context?: string[];
  improvement_suggestions?: string;
  session_id: string;
  timestamp: Date;
}

/**
 * Training data collection statistics
 */
export interface CollectionStatistics {
  total_interactions: number;
  interactions_by_type: { [type in UserInteractionType]: number };
  successful_interactions: number;
  average_user_satisfaction: number;
  training_data_generated: number;
  recent_activity: Array<{
    type: UserInteractionType;
    timestamp: Date;
    quality_score: number;
  }>;
  collection_rate_per_hour: number;
}

/**
 * Training Data Collector
 * Automatically collects and processes user interactions to generate training data
 */
export class TrainingDataCollector extends EventEmitter {
  private searchInteractions: SearchInteraction[] = [];
  private relationshipInteractions: RelationshipInteraction[] = [];
  private interfaceUsagePatterns: InterfaceUsagePattern[] = [];
  private contextFeedback: ContextRetrievalFeedback[] = [];

  private collectionStartTime: Date;
  private sessionTrackingMap = new Map<string, number>(); // session_id -> interaction_count
  private dataQualityThreshold = 0.3; // Minimum quality score to include in training
  private cleanupInterval: NodeJS.Timeout | null = null;
  private maxInteractionsPerCollection = 5000;

  constructor() {
    super();
    this.collectionStartTime = new Date();

    // Periodically clean up old data (keep last 30 days)
    this.cleanupInterval = setInterval(
      () => {
        this.cleanupOldData();
      },
      24 * 60 * 60 * 1000,
    ); // Daily cleanup

    logger.debug("[DATA] Training data collector initialized");
  }

  /**
   * Record search interaction
   */
  async recordSearchInteraction(interaction: SearchInteraction): Promise<void> {
    this.searchInteractions.push(interaction);
    this.trimCollection(this.searchInteractions);
    this.trackSession(interaction.session_id);

    // Generate training data points
    const trainingPoints = await this.generateSearchTrainingData(interaction);

    for (const point of trainingPoints) {
      this.emit("trainingDataGenerated", point);
    }

    logger.debug(
      `[PROGRESS] Recorded search interaction: ${interaction.query} (${trainingPoints.length} training points)`,
    );
  }

  /**
   * Record relationship discovery
   */
  async recordRelationshipInteraction(interaction: RelationshipInteraction): Promise<void> {
    this.relationshipInteractions.push(interaction);
    this.trimCollection(this.relationshipInteractions);
    this.trackSession(interaction.session_id);

    // Generate training data if relationship was confirmed
    if (interaction.user_confirmed || interaction.confidence > 0.7) {
      const trainingPoint = await this.generateRelationshipTrainingData(interaction);
      if (trainingPoint) {
        this.emit("trainingDataGenerated", trainingPoint);
      }
    }

    logger.debug(
      `[LINK] Recorded relationship interaction: ${interaction.source_entity} -> ${interaction.target_entity}`,
    );
  }

  /**
   * Record interface usage pattern
   */
  async recordInterfaceUsage(pattern: InterfaceUsagePattern): Promise<void> {
    this.interfaceUsagePatterns.push(pattern);
    this.trimCollection(this.interfaceUsagePatterns);
    this.trackSession(pattern.session_id);

    // Generate training data for successful usage
    if (pattern.success_indicators.compilation_success) {
      const trainingPoint = await this.generateInterfaceTrainingData(pattern);
      if (trainingPoint) {
        this.emit("trainingDataGenerated", trainingPoint);
      }
    }

    logger.debug(`[CONFIG] Recorded interface usage: ${pattern.interface_name}`);
  }

  /**
   * Record context retrieval feedback
   */
  async recordContextFeedback(feedback: ContextRetrievalFeedback): Promise<void> {
    this.contextFeedback.push(feedback);
    this.trimCollection(this.contextFeedback);
    this.trackSession(feedback.session_id);

    // Generate training data from user feedback
    const trainingPoints = await this.generateContextTrainingData(feedback);

    for (const point of trainingPoints) {
      this.emit("trainingDataGenerated", point);
    }

    logger.debug(
      ` Recorded context feedback: rating=${feedback.user_rating} (${trainingPoints.length} training points)`,
    );
  }

  /**
   * Record successful entity relationship discovery
   */
  async recordSuccessfulEntityRelationship(
    sourceEntity: Entity,
    targetEntity: Entity,
    relationshipType: string,
    confidence: number,
    sessionId: string,
  ): Promise<void> {
    const interaction: RelationshipInteraction = {
      source_entity: sourceEntity.name,
      target_entity: targetEntity.name,
      relationship_type: relationshipType,
      discovered_by: "system",
      confidence,
      user_confirmed: true, // Assume confirmed if being recorded as successful
      context: `${sourceEntity.entityType} -> ${targetEntity.entityType}`,
      session_id: sessionId,
      timestamp: new Date(),
    };

    await this.recordRelationshipInteraction(interaction);
  }

  /**
   * Record search result selection patterns
   */
  async recordSearchResultSelection(
    query: string,
    allResults: Entity[],
    selectedEntityNames: string[],
    searchType: "semantic" | "text" | "hybrid",
    sessionId: string,
    responseTime?: number,
    userSatisfaction?: number,
  ): Promise<void> {
    const interaction: SearchInteraction = {
      query,
      results: allResults,
      selected_results: selectedEntityNames,
      search_type: searchType,
      response_time: responseTime || 0,
      user_satisfaction: userSatisfaction,
      session_id: sessionId,
      timestamp: new Date(),
    };

    await this.recordSearchInteraction(interaction);
  }

  /**
   * Get collection statistics
   */
  getStatistics(): CollectionStatistics {
    const totalInteractions =
      this.searchInteractions.length +
      this.relationshipInteractions.length +
      this.interfaceUsagePatterns.length +
      this.contextFeedback.length;

    const interactionsByType: { [type in UserInteractionType]: number } = {
      search_query: this.searchInteractions.length,
      entity_creation: 0, // Would need to be tracked separately
      entity_update: 0, // Would need to be tracked separately
      relationship_creation: this.relationshipInteractions.length,
      interface_usage: this.interfaceUsagePatterns.length,
      context_retrieval: this.contextFeedback.length,
      navigation_action: 0, // Would need to be tracked separately
      feedback_rating: this.contextFeedback.filter((f) => f.user_rating).length,
    };

    // Calculate successful interactions
    const successfulSearches = this.searchInteractions.filter(
      (s) => s.selected_results.length > 0 && (s.user_satisfaction || 3) >= 3,
    ).length;

    const successfulRelationships = this.relationshipInteractions.filter(
      (r) => r.user_confirmed,
    ).length;

    const successfulInterfaceUsage = this.interfaceUsagePatterns.filter(
      (p) => p.success_indicators.compilation_success,
    ).length;

    const successfulInteractions =
      successfulSearches + successfulRelationships + successfulInterfaceUsage;

    // Calculate average satisfaction
    const satisfactionRatings = [
      ...this.searchInteractions.map((s) => s.user_satisfaction).filter(Boolean),
      ...this.contextFeedback.map((f) => f.user_rating),
      ...this.interfaceUsagePatterns
        .map((p) => p.success_indicators.user_satisfaction)
        .filter(Boolean),
    ] as number[];

    const averageSatisfaction =
      satisfactionRatings.length > 0
        ? satisfactionRatings.reduce((sum, rating) => sum + rating, 0) / satisfactionRatings.length
        : 0;

    // Calculate collection rate
    const hoursSinceStart = (Date.now() - this.collectionStartTime.getTime()) / (1000 * 60 * 60);
    const collectionRate = hoursSinceStart > 0 ? totalInteractions / hoursSinceStart : 0;

    // Recent activity (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentActivity = [
      ...this.searchInteractions
        .filter((s) => s.timestamp > oneDayAgo)
        .map((s) => ({
          type: "search_query" as UserInteractionType,
          timestamp: s.timestamp,
          quality_score: this.calculateSearchQuality(s),
        })),
      ...this.relationshipInteractions
        .filter((r) => r.timestamp > oneDayAgo)
        .map((r) => ({
          type: "relationship_creation" as UserInteractionType,
          timestamp: r.timestamp,
          quality_score: r.confidence,
        })),
      ...this.contextFeedback
        .filter((f) => f.timestamp > oneDayAgo)
        .map((f) => ({
          type: "feedback_rating" as UserInteractionType,
          timestamp: f.timestamp,
          quality_score: f.user_rating / 5,
        })),
    ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return {
      total_interactions: totalInteractions,
      interactions_by_type: interactionsByType,
      successful_interactions: successfulInteractions,
      average_user_satisfaction: averageSatisfaction,
      training_data_generated: this.countGeneratedTrainingData(),
      recent_activity: recentActivity.slice(0, 50), // Last 50 activities
      collection_rate_per_hour: collectionRate,
    };
  }

  /**
   * Generate batch training data from collected interactions
   */
  async generateBatchTrainingData(): Promise<TrainingDataPoint[]> {
    const trainingPoints: TrainingDataPoint[] = [];

    // Process search interactions
    for (const search of this.searchInteractions) {
      const searchPoints = await this.generateSearchTrainingData(search);
      trainingPoints.push(...searchPoints);
    }

    // Process relationship interactions
    for (const relationship of this.relationshipInteractions) {
      if (relationship.user_confirmed) {
        const relationshipPoint = await this.generateRelationshipTrainingData(relationship);
        if (relationshipPoint) {
          trainingPoints.push(relationshipPoint);
        }
      }
    }

    // Process interface usage
    for (const usage of this.interfaceUsagePatterns) {
      if (usage.success_indicators.compilation_success) {
        const usagePoint = await this.generateInterfaceTrainingData(usage);
        if (usagePoint) {
          trainingPoints.push(usagePoint);
        }
      }
    }

    // Process context feedback
    for (const feedback of this.contextFeedback) {
      const contextPoints = await this.generateContextTrainingData(feedback);
      trainingPoints.push(...contextPoints);
    }

    // Filter by quality
    const qualityTrainingPoints = trainingPoints.filter(
      (point) => point.confidence >= this.dataQualityThreshold,
    );

    logger.info(
      ` Generated ${qualityTrainingPoints.length} quality training points from ${trainingPoints.length} total`,
    );

    return qualityTrainingPoints;
  }

  // Private helper methods

  /**
   * Generate training data from search interactions
   */
  private async generateSearchTrainingData(
    interaction: SearchInteraction,
  ): Promise<TrainingDataPoint[]> {
    const points: TrainingDataPoint[] = [];

    // Create training data for successful selections
    for (const selectedEntity of interaction.selected_results) {
      const confidence = this.calculateSearchQuality(interaction);

      if (confidence >= this.dataQualityThreshold) {
        points.push({
          id: `search_${interaction.session_id}_${Date.now()}_${Math.random()}`,
          input_text: `[SEARCH] ${interaction.query} -> ${selectedEntity}`,
          context: `search_success_${interaction.search_type}`,
          source_type: "search_success",
          confidence,
          timestamp: interaction.timestamp,
          metadata: {
            search_query: interaction.query,
            session_id: interaction.session_id,
            user_rating: interaction.user_satisfaction,
          },
        });
      }
    }

    return points;
  }

  /**
   * Generate training data from relationship interactions
   */
  private async generateRelationshipTrainingData(
    interaction: RelationshipInteraction,
  ): Promise<TrainingDataPoint | null> {
    if (interaction.confidence < this.dataQualityThreshold) {
      return null;
    }

    return {
      id: `relationship_${interaction.session_id}_${Date.now()}`,
      input_text: `[RELATIONSHIP] ${interaction.source_entity} ${interaction.relationship_type} ${interaction.target_entity}`,
      context: interaction.context,
      source_type: "relationship_discovery",
      confidence: interaction.confidence,
      timestamp: interaction.timestamp,
      metadata: {
        session_id: interaction.session_id,
      },
    };
  }

  /**
   * Generate training data from interface usage patterns
   */
  private async generateInterfaceTrainingData(
    pattern: InterfaceUsagePattern,
  ): Promise<TrainingDataPoint | null> {
    const confidence = this.calculateInterfaceUsageQuality(pattern);

    if (confidence < this.dataQualityThreshold) {
      return null;
    }

    return {
      id: `interface_${pattern.interface_id}_${Date.now()}`,
      input_text: `[INTERFACE] ${pattern.interface_name} in context: ${pattern.usage_context}`,
      context: pattern.file_context,
      source_type: "interface_usage",
      confidence,
      timestamp: pattern.timestamp,
      metadata: {
        interface_name: pattern.interface_name,
        session_id: pattern.session_id,
        user_rating: pattern.success_indicators.user_satisfaction,
      },
    };
  }

  /**
   * Generate training data from context feedback
   */
  private async generateContextTrainingData(
    feedback: ContextRetrievalFeedback,
  ): Promise<TrainingDataPoint[]> {
    const points: TrainingDataPoint[] = [];

    // Positive examples from good context
    if (feedback.user_rating >= 4) {
      for (const context of feedback.retrieved_context) {
        points.push({
          id: `context_positive_${feedback.session_id}_${Date.now()}_${Math.random()}`,
          input_text: `[CONTEXT] ${feedback.query} -> ${context}`,
          context: "context_success",
          source_type: "user_feedback",
          confidence: feedback.user_rating / 5,
          timestamp: feedback.timestamp,
          metadata: {
            user_rating: feedback.user_rating,
            session_id: feedback.session_id,
          },
        });
      }
    }

    return points;
  }

  /**
   * Calculate quality score for search interactions
   */
  private calculateSearchQuality(interaction: SearchInteraction): number {
    let quality = 0;

    // Base quality from user satisfaction
    if (interaction.user_satisfaction) {
      quality += (interaction.user_satisfaction / 5) * 0.4;
    }

    // Quality from selection rate
    if (interaction.results.length > 0) {
      const selectionRate = interaction.selected_results.length / interaction.results.length;
      quality += Math.min(selectionRate, 0.5) * 0.3; // Cap at 50% selection rate
    }

    // Quality from response time (faster is better, but not too important)
    if (interaction.response_time > 0) {
      const responseQuality = Math.max(0, 1 - interaction.response_time / 5000); // 5 second max
      quality += responseQuality * 0.1;
    }

    // Bonus for semantic searches (they're more valuable for training)
    if (interaction.search_type === "semantic") {
      quality += 0.2;
    }

    return Math.min(quality, 1.0);
  }

  /**
   * Calculate quality score for interface usage
   */
  private calculateInterfaceUsageQuality(pattern: InterfaceUsagePattern): number {
    let quality = 0;

    // Compilation success is critical
    if (pattern.success_indicators.compilation_success) {
      quality += 0.5;
    }

    // Runtime success is also important
    if (pattern.success_indicators.runtime_success) {
      quality += 0.3;
    }

    // User satisfaction adds to quality
    if (pattern.success_indicators.user_satisfaction) {
      quality += (pattern.success_indicators.user_satisfaction / 5) * 0.2;
    }

    return Math.min(quality, 1.0);
  }

  /**
   * Track session activity
   */
  private trackSession(sessionId: string): void {
    const currentCount = this.sessionTrackingMap.get(sessionId) || 0;
    this.sessionTrackingMap.set(sessionId, currentCount + 1);
  }

  /**
   * Count generated training data points
   */
  private countGeneratedTrainingData(): number {
    // This would be the actual count of training data points sent to the trainer
    // For now, we'll estimate based on successful interactions
    const successfulSearches = this.searchInteractions.filter(
      (s) => s.selected_results.length > 0,
    ).length;
    const successfulRelationships = this.relationshipInteractions.filter(
      (r) => r.user_confirmed,
    ).length;
    const successfulUsage = this.interfaceUsagePatterns.filter(
      (p) => p.success_indicators.compilation_success,
    ).length;
    const goodFeedback = this.contextFeedback.filter((f) => f.user_rating >= 4).length;

    return successfulSearches + successfulRelationships + successfulUsage + goodFeedback;
  }

  /**
   * Clean up old data (keep last 30 days)
   */
  private cleanupOldData(): void {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const beforeCount =
      this.searchInteractions.length +
      this.relationshipInteractions.length +
      this.interfaceUsagePatterns.length +
      this.contextFeedback.length;

    this.searchInteractions = this.searchInteractions.filter((s) => s.timestamp > thirtyDaysAgo);
    this.relationshipInteractions = this.relationshipInteractions.filter(
      (r) => r.timestamp > thirtyDaysAgo,
    );
    this.interfaceUsagePatterns = this.interfaceUsagePatterns.filter(
      (p) => p.timestamp > thirtyDaysAgo,
    );
    this.contextFeedback = this.contextFeedback.filter((f) => f.timestamp > thirtyDaysAgo);

    const afterCount =
      this.searchInteractions.length +
      this.relationshipInteractions.length +
      this.interfaceUsagePatterns.length +
      this.contextFeedback.length;

    if (beforeCount > afterCount) {
      logger.info(` Cleaned up ${beforeCount - afterCount} old training data points`);
    }
  }

  /**
   * Clear all collected data
   */
  clearAllData(): void {
    this.searchInteractions = [];
    this.relationshipInteractions = [];
    this.interfaceUsagePatterns = [];
    this.contextFeedback = [];
    this.sessionTrackingMap.clear();

    logger.info(" Cleared all training data collection");
  }

  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clearAllData();
    this.removeAllListeners();
  }

  /**
   * Export training data for analysis
   */
  exportTrainingData(): {
    search_interactions: SearchInteraction[];
    relationship_interactions: RelationshipInteraction[];
    interface_usage_patterns: InterfaceUsagePattern[];
    context_feedback: ContextRetrievalFeedback[];
    statistics: CollectionStatistics;
  } {
    return {
      search_interactions: this.searchInteractions,
      relationship_interactions: this.relationshipInteractions,
      interface_usage_patterns: this.interfaceUsagePatterns,
      context_feedback: this.contextFeedback,
      statistics: this.getStatistics(),
    };
  }

  private trimCollection<T>(items: T[]): void {
    if (items.length <= this.maxInteractionsPerCollection) return;
    items.splice(0, items.length - this.maxInteractionsPerCollection);
  }
}
