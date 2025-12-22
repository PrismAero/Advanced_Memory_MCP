/**
 * Central Similarity Configuration
 * Single source of truth for all similarity thresholds and settings
 */

export const SIMILARITY_CONFIG = {
  /**
   * Similarity score thresholds for entity matching
   */
  thresholds: {
    /** Minimum similarity score to consider entities related (used in search) */
    minimum: 0.5,

    /** Medium confidence threshold (used for "medium" confidence classification) */
    medium: 0.6,

    /** High confidence threshold (used for "high" confidence classification) */
    high: 0.75,

    /** Very high threshold for auto-creating relations without user confirmation */
    autoCreate: 0.82,

    /** Self-similarity minimum (for health checks - should be close to 1.0) */
    selfSimilarity: 0.95,
  },

  /**
   * Batch processing configuration
   */
  batch: {
    /** Default batch size for processing entities */
    size: 20,

    /** Higher threshold for batch processing to reduce noise */
    highThreshold: 0.75,

    /** Maximum number of entities to process in initial index */
    maxInitialIndex: 50,

    /** Maximum candidates to consider for relationship detection */
    maxCandidates: 20,
  },

  /**
   * Confidence level classification
   */
  confidence: {
    /** Threshold for "high" confidence classification */
    high: 0.85,

    /** Threshold for "medium" confidence classification */
    medium: 0.75,
    // Below medium is "low"
  },

  /**
   * Cache configuration
   */
  cache: {
    /** Maximum number of embeddings to cache */
    maxSize: 1000,
  },

  /**
   * Background processing configuration
   */
  background: {
    /** Interval in minutes for background processing */
    intervalMinutes: 30,

    /** Minimum relevance score change to trigger update */
    relevanceUpdateThreshold: 0.1,

    /** Days after which entities are considered "old" for relevance decay */
    oldEntityDays: 30,

    /** Days of inactivity before removing from working context */
    workingContextTimeoutDays: 14,

    /** Days to consider entity as "recent" */
    recentAccessDays: 3,
  },
} as const;

// Export individual sections for convenience
export const THRESHOLDS = SIMILARITY_CONFIG.thresholds;
export const BATCH_CONFIG = SIMILARITY_CONFIG.batch;
export const CONFIDENCE_CONFIG = SIMILARITY_CONFIG.confidence;
export const CACHE_CONFIG = SIMILARITY_CONFIG.cache;
export const BACKGROUND_CONFIG = SIMILARITY_CONFIG.background;
