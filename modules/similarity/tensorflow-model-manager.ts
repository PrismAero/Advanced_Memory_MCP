import { promises as fs } from "fs";
import { logger } from "../logger.js";
import {
  PreparedUseModelArtifacts,
  USE_LITE_EMBEDDING_DIM,
  getDefaultUseModelArtifactConfig,
  prepareUseModelArtifacts,
} from "../ml/model-artifacts.js";
import { tf, tensorflowRuntime } from "../ml/tf-runtime.js";
import {
  EnvironmentConfig,
  ModelConfig,
  ModelSelection,
  getDefaultModelSelection,
  getEnvironmentConfig,
  getModelConfig,
} from "./model-config.js";

export type EmbeddingProviderMode = "universal-sentence-encoder" | "fake";

export interface TensorFlowModelManagerOptions {
  modelCacheDir?: string;
  provider?: EmbeddingProviderMode;
  allowModelDownload?: boolean;
  modelUrl?: string;
  vocabUrl?: string;
  downloadTimeoutMs?: number;
  embeddingBatchSize?: number;
}

/**
 * TensorFlow.js Model Manager
 * Handles model loading and lifecycle management for local-only operation.
 *
 * TensorFlow.js is a REQUIRED dependency - no fallback mode.
 * If TensorFlow.js fails to initialize, the server will not start.
 */
export class TensorFlowModelManager {
  private loadedModel: any | null = null;
  private currentModelId: string | null = null;
  private modelCacheDir: string;
  private environmentConfig: EnvironmentConfig;
  private modelSelection: ModelSelection;
  private isInitialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;
  private providerMode: EmbeddingProviderMode;
  private preparedArtifacts: PreparedUseModelArtifacts | null = null;
  private embeddingBatchSize: number;
  private lastTensorDelta = 0;

  constructor(options?: string | TensorFlowModelManagerOptions) {
    const normalized =
      typeof options === "string" ? { modelCacheDir: options } : options || {};
    this.environmentConfig = getEnvironmentConfig();
    this.modelCacheDir =
      normalized.modelCacheDir || this.environmentConfig.modelCacheDir;
    this.modelSelection = getDefaultModelSelection();
    this.providerMode =
      normalized.provider ||
      (process.env
        .ADVANCED_MEMORY_EMBEDDING_PROVIDER as EmbeddingProviderMode) ||
      "universal-sentence-encoder";
    this.embeddingBatchSize = clampPositiveInt(
      normalized.embeddingBatchSize ||
        Number(process.env.ADVANCED_MEMORY_EMBEDDING_BATCH_SIZE),
      1,
      128,
      32,
    );

    if (normalized.allowModelDownload !== undefined) {
      this.environmentConfig.allowModelDownload = normalized.allowModelDownload;
    }
    if (normalized.modelUrl) {
      process.env.ADVANCED_MEMORY_USE_MODEL_URL = normalized.modelUrl;
    }
    if (normalized.vocabUrl) {
      process.env.ADVANCED_MEMORY_USE_VOCAB_URL = normalized.vocabUrl;
    }
    if (normalized.downloadTimeoutMs) {
      this.environmentConfig.networkTimeout = normalized.downloadTimeoutMs;
    }
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
    logger.info("Initializing TensorFlow.js Model Manager...");
    await tensorflowRuntime.initialize();

    await this.loadPreferredModel();

    this.isInitialized = true;

    // Test TensorFlow compatibility immediately after loading
    await this.testCompatibility();

    logger.info(
      `TensorFlow.js Model Manager ready with model: ${this.currentModelId}`,
    );
  }

  /**
   * Load preferred model
   */
  private async loadPreferredModel(): Promise<void> {
    const modelId =
      this.providerMode === "fake"
        ? "fake-embedding-provider"
        : this.modelSelection.preferredModel;

    logger.info(`Loading embedding provider: ${modelId}`);
    await this.loadModel(modelId);
    logger.info(`Successfully loaded embedding provider: ${modelId}`);
  }

  /**
   * Load a specific model by ID.
   */
  async loadModel(modelId: string): Promise<void> {
    if (modelId === "fake-embedding-provider") {
      this.loadedModel = new FakeEmbeddingProvider(USE_LITE_EMBEDDING_DIM);
      this.currentModelId = modelId;
      return;
    }

    const modelConfig = getModelConfig(modelId);
    if (!modelConfig) {
      throw new Error(`Unknown model ID: ${modelId}`);
    }

    const startTime = Date.now();

    if (modelId === "universal-sentence-encoder") {
      const artifactConfig = getDefaultUseModelArtifactConfig(
        this.modelCacheDir,
      );
      artifactConfig.allowDownload = this.environmentConfig.allowModelDownload;
      artifactConfig.downloadTimeoutMs = this.environmentConfig.networkTimeout;

      this.preparedArtifacts = await prepareUseModelArtifacts(artifactConfig);
      logger.info(
        `[TENSORFLOW] Loading Universal Sentence Encoder from ${this.preparedArtifacts.modelDir}`,
      );
      this.loadedModel =
        await LocalUniversalSentenceEncoderProvider.load(this.preparedArtifacts);
      this.currentModelId = modelId;
      const loadTime = Date.now() - startTime;
      logger.info(
        `Universal Sentence Encoder loaded in ${loadTime}ms${
          this.preparedArtifacts.downloaded ? " after cache preparation" : ""
        }`,
      );

      await this.warmUpModel();
      return;
    }

    // Only universal-sentence-encoder is supported
    throw new Error(
      `Model ${modelId} is not available as a bundled model. Only 'universal-sentence-encoder' is supported for local-only operation.`,
    );
  }

  /**
   * Generate embeddings for text input using bundled Universal Sentence Encoder.
   * Throws an error if embedding generation fails - no fallback.
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.loadedModel) {
      throw new Error(
        "TensorFlow.js model not loaded. Call initialize() first.",
      );
    }

    if (!this.isInitialized) {
      throw new Error(
        "TensorFlow.js Model Manager not initialized. Call initialize() first.",
      );
    }

    if (texts.length === 0) return [];

    const results: number[][] = [];
    for (let i = 0; i < texts.length; i += this.embeddingBatchSize) {
      const batch = texts
        .slice(i, i + this.embeddingBatchSize)
        .map((text) => this.preprocessText(text));
      results.push(...(await this.generateEmbeddingBatch(batch)));
    }
    return results;
  }

  /**
   * Test TensorFlow compatibility by generating a simple embedding directly
   */
  private async testCompatibility(): Promise<void> {
    if (!this.loadedModel) {
      throw new Error("No model loaded for compatibility test");
    }

    const [embedding] = await this.generateEmbeddings(["test"]);
    if (embedding?.length === USE_LITE_EMBEDDING_DIM) {
      logger.info("TensorFlow.js compatibility test passed");
    } else {
      throw new Error(
        `TensorFlow.js compatibility test failed: expected ${USE_LITE_EMBEDDING_DIM} dimensions, got ${embedding?.length || 0}`,
      );
    }
  }

  /**
   * Calculate cosine similarity between embeddings
   */
  calculateCosineSimilarity(
    embedding1: number[],
    embedding2: number[],
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
    candidateTexts: string[],
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
        embeddings[i],
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
    backend: string | null;
    provider: EmbeddingProviderMode;
    artifactPath?: string;
    tensorCount: number;
    lastTensorDelta: number;
    modelConfig: ModelConfig | null;
  } {
    const health = tensorflowRuntime.getHealth();
    return {
      modelId: this.currentModelId,
      isLoaded: this.loadedModel !== null,
      memoryUsage: health.memory.numBytes / (1024 * 1024), // MB
      backend: health.backend,
      provider: this.providerMode,
      artifactPath: this.preparedArtifacts?.modelDir,
      tensorCount: health.memory.numTensors,
      lastTensorDelta: this.lastTensorDelta,
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
      } else if (
        typeof (this.loadedModel as any).model?.dispose === "function"
      ) {
        (this.loadedModel as any).model.dispose();
      }
      this.loadedModel = null;
    }
    this.currentModelId = null;
    this.preparedArtifacts = null;
    this.isInitialized = false;
    this.initializationPromise = null;
  }

  /**
   * Warm up the model by verifying it's properly loaded
   */
  private async warmUpModel(): Promise<void> {
    logger.debug("Warming up model...");

    if (
      !this.loadedModel ||
      typeof (this.loadedModel as any).embed !== "function"
    ) {
      throw new Error("Model loaded but embed method not available");
    }
  }

  private async generateEmbeddingBatch(texts: string[]): Promise<number[][]> {
    if (
      !this.loadedModel ||
      typeof (this.loadedModel as any).embed !== "function"
    ) {
      throw new Error(`Unsupported embedding provider: ${this.currentModelId}`);
    }

    const before = tensorflowRuntime.snapshot("embed-before");
    const embeddings = await (this.loadedModel as any).embed(texts);
    const embeddingData = await embeddings.data();
    embeddings.dispose();
    const after = tensorflowRuntime.snapshot("embed-after");
    this.lastTensorDelta = after.numTensors - before.numTensors;
    tensorflowRuntime.warnOnTensorGrowth(before, after, 0);

    const results: number[][] = [];
    for (let i = 0; i < texts.length; i++) {
      const start = i * USE_LITE_EMBEDDING_DIM;
      const end = start + USE_LITE_EMBEDDING_DIM;
      const vector = Array.from(
        embeddingData.slice(start, end) as ArrayLike<number>,
      );
      if (vector.length !== USE_LITE_EMBEDDING_DIM) {
        throw new Error(
          `Embedding dimension mismatch. Expected ${USE_LITE_EMBEDDING_DIM}, got ${vector.length}`,
        );
      }
      results.push(vector);
    }
    return results;
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

class FakeEmbeddingProvider {
  constructor(private readonly dimensions: number) {}

  async embed(texts: string[]): Promise<FakeTensor> {
    return new FakeTensor(
      texts.map((text) => deterministicEmbedding(text, this.dimensions)),
    );
  }
}

class LocalUniversalSentenceEncoderProvider {
  private constructor(
    private readonly model: tf.GraphModel,
    private readonly tokenizer: { encode(input: string): number[] },
  ) {}

  static async load(
    artifacts: PreparedUseModelArtifacts,
  ): Promise<LocalUniversalSentenceEncoderProvider> {
    const [model, vocabularyModule] = await Promise.all([
      tf.loadGraphModel(artifacts.modelUrl),
      import("@tensorflow-models/universal-sentence-encoder"),
    ]);
    const vocabulary = JSON.parse(await fs.readFile(artifacts.vocabPath, "utf-8"));
    const tokenizer = new (vocabularyModule as any).Tokenizer(vocabulary);
    return new LocalUniversalSentenceEncoderProvider(model, tokenizer);
  }

  async embed(inputs: string[]): Promise<tf.Tensor> {
    const encodings = inputs.map((input) => this.tokenizer.encode(input));
    const flattenedIndices: number[][] = [];
    for (let i = 0; i < encodings.length; i++) {
      for (let j = 0; j < encodings[i].length; j++) {
        flattenedIndices.push([i, j]);
      }
    }

    const indices = tf.tensor2d(flattenedIndices, [flattenedIndices.length, 2], "int32");
    const values = tf.tensor1d(encodings.flat(), "int32");
    try {
      const embeddings = await this.model.executeAsync({ indices, values });
      return Array.isArray(embeddings) ? embeddings[0] : embeddings;
    } finally {
      indices.dispose();
      values.dispose();
    }
  }

  dispose(): void {
    this.model.dispose();
  }
}

class FakeTensor {
  constructor(private readonly vectors: number[][]) {}

  async data(): Promise<Float32Array> {
    return Float32Array.from(this.vectors.flat());
  }

  dispose(): void {
    // No-op fake tensor for deterministic tests.
  }
}

function deterministicEmbedding(text: string, dimensions: number): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  const tokens = tokenizeForFakeEmbedding(text);
  for (const token of tokens) {
    addTokenSignal(vector, token, 1);
    for (const related of FAKE_SEMANTIC_GROUPS[token] || []) {
      addTokenSignal(vector, related, 0.65);
    }
  }
  for (let i = 0; i < tokens.length - 1; i++) {
    addTokenSignal(vector, `${tokens[i]}:${tokens[i + 1]}`, 0.35);
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return norm === 0 ? vector : vector.map((value) => value / norm);
}

function tokenizeForFakeEmbedding(text: string): string[] {
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !FAKE_STOP_WORDS.has(token));
}

function addTokenSignal(vector: number[], token: string, weight: number): void {
  const index = stableHash(token) % vector.length;
  vector[index] += weight;
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const FAKE_STOP_WORDS = new Set([
  "and",
  "the",
  "for",
  "with",
  "after",
  "before",
  "into",
  "from",
  "local",
  "files",
]);

const FAKE_SEMANTIC_GROUPS: Record<string, string[]> = {
  auth: ["authentication", "oauth", "token", "jwt", "security"],
  authentication: ["auth", "oauth", "token", "jwt", "security"],
  oauth: ["auth", "authentication", "callback", "token"],
  jwt: ["auth", "authentication", "token"],
  token: ["auth", "authentication", "jwt", "credential"],
  validation: ["validate", "verification", "security"],
  callback: ["oauth", "handler", "controller"],
  controller: ["handler", "endpoint", "route"],
  service: ["handler", "business", "logic"],
};

function clampPositiveInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(numeric)));
}
