/**
 * TensorFlow.js Model Configuration
 * Defines supported lightweight models with URLs, metadata, and performance characteristics
 */

export interface ModelConfig {
  id: string;
  name: string;
  description: string;
  url: string;
  size: number; // MB
  embeddingDim: number;
  maxTokens: number;
  priority: "primary" | "alternative" | "fallback";
  performance: {
    accuracy: "high" | "medium" | "low";
    speed: "fast" | "medium" | "slow";
    memory: "light" | "medium" | "heavy";
  };
}

/**
 * Supported TensorFlow.js models for entity similarity
 * All models are bundled locally for offline operation
 */
export const SUPPORTED_MODELS: { [key: string]: ModelConfig } = {
  "universal-sentence-encoder": {
    id: "universal-sentence-encoder",
    name: "Universal Sentence Encoder",
    description: "Bundled model for semantic similarity (local-only)",
    url: "@tensorflow-models/universal-sentence-encoder",
    size: 25, // Approximate size in MB when loaded
    embeddingDim: 512,
    maxTokens: 256,
    priority: "primary",
    performance: {
      accuracy: "high",
      speed: "medium",
      memory: "medium",
    },
  },
};

/**
 * Model selection configuration
 */
export interface ModelSelection {
  preferredModel: string;
  fallbackModels: string[];
  autoFallback: boolean;
  performanceMode: "accuracy" | "balanced" | "speed";
}

/**
 * Get default model selection based on environment and preferences
 */
export function getDefaultModelSelection(): ModelSelection {
  // Check environment variables for overrides
  const envModel = process.env.TENSORFLOW_MODEL;
  const envPerformanceMode = process.env.PERFORMANCE_MODE as
    | "accuracy"
    | "balanced"
    | "speed";

  if (envModel && SUPPORTED_MODELS[envModel]) {
    return {
      preferredModel: envModel,
      fallbackModels: Object.keys(SUPPORTED_MODELS).filter(
        (id) => id !== envModel
      ),
      autoFallback: true,
      performanceMode: envPerformanceMode || "balanced",
    };
  }

  // Default configuration using bundled model
  return {
    preferredModel: "universal-sentence-encoder",
    fallbackModels: [], // No fallbacks needed - bundled model is always available
    autoFallback: false,
    performanceMode: "balanced",
  };
}

/**
 * Get model configuration by ID
 */
export function getModelConfig(modelId: string): ModelConfig | null {
  return SUPPORTED_MODELS[modelId] || null;
}

/**
 * Get models sorted by priority and performance mode
 */
export function getModelsByPreference(
  performanceMode: "accuracy" | "balanced" | "speed"
): ModelConfig[] {
  const models = Object.values(SUPPORTED_MODELS);

  return models.sort((a, b) => {
    // Sort by performance mode preference
    if (performanceMode === "accuracy") {
      if (a.performance.accuracy !== b.performance.accuracy) {
        const accuracyOrder = { high: 3, medium: 2, low: 1 };
        return (
          accuracyOrder[b.performance.accuracy] -
          accuracyOrder[a.performance.accuracy]
        );
      }
    } else if (performanceMode === "speed") {
      if (a.performance.speed !== b.performance.speed) {
        const speedOrder = { fast: 3, medium: 2, slow: 1 };
        return (
          speedOrder[b.performance.speed] - speedOrder[a.performance.speed]
        );
      }
    }

    // Default balanced mode - consider all factors
    const getPriority = (model: ModelConfig) => {
      const priorityOrder = { primary: 3, alternative: 2, fallback: 1 };
      return priorityOrder[model.priority];
    };

    return getPriority(b) - getPriority(a);
  });
}

/**
 * Validate model configuration
 */
export function validateModelConfig(config: ModelConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config.id || typeof config.id !== "string") {
    errors.push("Model ID is required and must be a string");
  }

  if (!config.url || typeof config.url !== "string") {
    errors.push("Model URL is required and must be a string");
  }

  if (typeof config.size !== "number" || config.size <= 0) {
    errors.push("Model size must be a positive number");
  }

  if (typeof config.embeddingDim !== "number" || config.embeddingDim <= 0) {
    errors.push("Embedding dimension must be a positive number");
  }

  if (config.size > 50) {
    errors.push(
      "Model size should be under 50MB for lightweight local execution"
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Model performance characteristics for monitoring
 */
export interface ModelPerformanceMetrics {
  modelId: string;
  loadTime: number; // milliseconds
  averageInferenceTime: number; // milliseconds per embedding
  memoryUsage: number; // MB
  accuracy: number; // 0-1 score based on validation
  lastUpdated: Date;
}

/**
 * Environment configuration for model selection
 */
export interface EnvironmentConfig {
  maxMemoryUsage: number; // MB
  preferredPerformance: "accuracy" | "balanced" | "speed";
  allowModelDownload: boolean;
  modelCacheDir: string;
  networkTimeout: number; // milliseconds
}

/**
 * Get environment configuration with defaults
 */
export function getEnvironmentConfig(): EnvironmentConfig {
  return {
    maxMemoryUsage: parseInt(process.env.MAX_MODEL_MEMORY || "200"),
    preferredPerformance: (process.env.PERFORMANCE_MODE as any) || "balanced",
    allowModelDownload: process.env.ALLOW_MODEL_DOWNLOAD !== "false",
    modelCacheDir: process.env.MODEL_CACHE_DIR || ".memory/models",
    networkTimeout: parseInt(process.env.MODEL_DOWNLOAD_TIMEOUT || "30000"),
  };
}
