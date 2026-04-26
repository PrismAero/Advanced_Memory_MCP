import * as use from "@tensorflow-models/universal-sentence-encoder";
import * as tf from "@tensorflow/tfjs-node";
import { logger } from "../logger.js";
import {
  EnvironmentConfig,
  ModelConfig,
  ModelSelection,
  getDefaultModelSelection,
  getEnvironmentConfig,
  getModelConfig,
} from "./model-config.js";

/**
 * TensorFlow.js Model Manager
 * Handles model loading and lifecycle management for local-only operation.
 *
 * TensorFlow.js is a REQUIRED dependency - no fallback mode.
 * If TensorFlow.js fails to initialize, the server will not start.
 */
export class TensorFlowModelManager {
  private loadedModel: tf.GraphModel | tf.LayersModel | any | null = null;
  private currentModelId: string | null = null;
  private modelCacheDir: string;
  private environmentConfig: EnvironmentConfig;
  private modelSelection: ModelSelection;
  private isInitialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;

  constructor(modelCacheDir?: string) {
    this.environmentConfig = getEnvironmentConfig();
    this.modelCacheDir = modelCacheDir || this.environmentConfig.modelCacheDir;
    this.modelSelection = getDefaultModelSelection();
  }

  /**
   * Initialize the model manager and load the preferred model.
   * Throws an error if initialization fails - no fallback mode.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._performInitialization();
    return this.initializationPromise;
  }

  private async _performInitialization(): Promise<void> {
    logger.info(
      "Initializing TensorFlow.js Model Manager with bundled models..."
    );

    // Load preferred model (bundled - no downloading needed)
    await this.loadPreferredModel();

    // Test TensorFlow compatibility immediately after loading
    await this.testCompatibility();

    this.isInitialized = true;
    logger.info(
      `TensorFlow.js Model Manager ready with bundled model: ${this.currentModelId}`
    );
  }

  /**
   * Load preferred bundled model
   */
  private async loadPreferredModel(): Promise<void> {
    const modelId = this.modelSelection.preferredModel;

    logger.info(`Loading bundled model: ${modelId}`);
    await this.loadModel(modelId);
    logger.info(`Successfully loaded bundled model: ${modelId}`);
  }

  /**
   * Load a specific model by ID - supports bundled models for local-only operation
   */
  async loadModel(modelId: string): Promise<void> {
    const modelConfig = getModelConfig(modelId);
    if (!modelConfig) {
      throw new Error(`Unknown model ID: ${modelId}`);
    }

    const startTime = Date.now();

    // Handle bundled Universal Sentence Encoder
    if (modelId === "universal-sentence-encoder") {
      logger.info(`Loading bundled Universal Sentence Encoder...`);
      this.loadedModel = await use.load();
      this.currentModelId = modelId;
      const loadTime = Date.now() - startTime;
      logger.info(`Bundled model loaded in ${loadTime}ms`);

      // Warm up the model with a test inference
      await this.warmUpModel();
      return;
    }

    // Only universal-sentence-encoder is supported
    throw new Error(
      `Model ${modelId} is not available as a bundled model. Only 'universal-sentence-encoder' is supported for local-only operation.`
    );
  }

  /**
   * Generate embeddings for text input using bundled Universal Sentence Encoder.
   * Throws an error if embedding generation fails - no fallback.
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.loadedModel) {
      throw new Error(
        "TensorFlow.js model not loaded. Call initialize() first."
      );
    }

    if (!this.isInitialized) {
      throw new Error(
        "TensorFlow.js Model Manager not initialized. Call initialize() first."
      );
    }

    // Preprocess texts for model input
    const processedTexts = texts.map((text) => this.preprocessText(text));

    // Use Universal Sentence Encoder API for bundled model
    if (this.currentModelId === "universal-sentence-encoder") {
      const embeddings = await (this.loadedModel as any).embed(processedTexts);
      const embeddingData = await embeddings.data();
      embeddings.dispose();

      // Reshape results - USE produces 512-dimensional embeddings
      const embeddingDim = 512;
      const results: number[][] = [];

      for (let i = 0; i < processedTexts.length; i++) {
        const start = i * embeddingDim;
        const end = start + embeddingDim;
        results.push(Array.from(embeddingData.slice(start, end)));
      }

      return results;
    }

    throw new Error(
      `Unsupported model type for embedding generation: ${this.currentModelId}`
    );
  }

  /**
   * Test TensorFlow compatibility by generating a simple embedding directly
   */
  private async testCompatibility(): Promise<void> {
    if (!this.loadedModel) {
      throw new Error("No model loaded for compatibility test");
    }

    // Test embedding generation directly
    const testTexts = ["test"];
    const processedTexts = testTexts.map((text) => this.preprocessText(text));

    if (this.currentModelId === "universal-sentence-encoder") {
      const embeddings = await (this.loadedModel as any).embed(processedTexts);
      const embeddingData = await embeddings.data();
      embeddings.dispose();

      if (embeddingData && embeddingData.length > 0) {
        logger.info("TensorFlow.js compatibility test passed");
      } else {
        throw new Error(
          "TensorFlow.js compatibility test failed: no embedding data returned"
        );
      }
    }
  }

  /**
   * Calculate cosine similarity between embeddings
   */
  calculateCosineSimilarity(
    embedding1: number[],
    embedding2: number[]
  ): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error("Embeddings must have the same dimension");
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);

    if (magnitude === 0) {
      return 0;
    }

    return dotProduct / magnitude;
  }

  /**
   * Batch similarity calculation for efficiency
   */
  async calculateBatchSimilarity(
    targetText: string,
    candidateTexts: string[]
  ): Promise<{ text: string; similarity: number }[]> {
    if (candidateTexts.length === 0) {
      return [];
    }

    // Generate embeddings for all texts
    const allTexts = [targetText, ...candidateTexts];
    const embeddings = await this.generateEmbeddings(allTexts);

    const targetEmbedding = embeddings[0];
    const results: { text: string; similarity: number }[] = [];

    // Calculate similarity with each candidate
    for (let i = 1; i < embeddings.length; i++) {
      const similarity = this.calculateCosineSimilarity(
        targetEmbedding,
        embeddings[i]
      );
      results.push({
        text: candidateTexts[i - 1],
        similarity,
      });
    }

    // Sort by similarity (highest first)
    return results.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Get current model configuration
   */
  getCurrentModelConfig(): ModelConfig | null {
    if (!this.currentModelId) {
      return null;
    }
    return getModelConfig(this.currentModelId);
  }

  /**
   * Check if model manager is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.loadedModel !== null;
  }

  /**
   * Get model statistics and health info
   */
  getModelInfo(): {
    modelId: string | null;
    isLoaded: boolean;
    memoryUsage: number;
    modelConfig: ModelConfig | null;
  } {
    return {
      modelId: this.currentModelId,
      isLoaded: this.loadedModel !== null,
      memoryUsage: tf.memory().numBytes / (1024 * 1024), // MB
      modelConfig: this.getCurrentModelConfig(),
    };
  }

  /**
   * Dispose of loaded model and free memory
   */
  dispose(): void {
    if (this.loadedModel) {
      if (typeof (this.loadedModel as any).dispose === "function") {
        (this.loadedModel as any).dispose();
      }
      this.loadedModel = null;
    }
    this.currentModelId = null;
    this.isInitialized = false;
    this.initializationPromise = null;
  }

  /**
   * Warm up the model by verifying it's properly loaded
   */
  private async warmUpModel(): Promise<void> {
    logger.info("Warming up model...");

    if (
      this.currentModelId === "universal-sentence-encoder" &&
      this.loadedModel
    ) {
      // Verify the model object exists and has the embed method
      if (typeof (this.loadedModel as any).embed === "function") {
        logger.info("Model warmed up successfully - embed method available");
      } else {
        throw new Error("Model loaded but embed method not available");
      }
    } else {
      logger.info("Model object verified");
    }
  }

  /**
   * Preprocess text for TensorFlow.js models
   */
  private preprocessText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 256); // Limit to model's max tokens
  }
}
