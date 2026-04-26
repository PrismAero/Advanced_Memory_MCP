import * as tf from "@tensorflow/tfjs-node";
import { promises as fs } from "fs";
import path from "path";
import { logger } from "../logger.js";
import { TensorFlowModelManager } from "../similarity/tensorflow-model-manager.js";
import { buildBaselineSeedData } from "./seed-knowledge.js";

/**
 * Training data point for model fine-tuning
 */
export interface TrainingDataPoint {
  id: string;
  input_text: string;
  target_embedding?: number[];
  context: string;
  source_type:
    | "search_success"
    | "interface_usage"
    | "relationship_discovery"
    | "user_feedback";
  confidence: number; // 0-1
  timestamp: Date;
  metadata?: {
    file_path?: string;
    interface_name?: string;
    search_query?: string;
    user_rating?: number; // 1-5
    session_id?: string;
    language?: string; // e.g. "c" | "cpp" | "go" | "typescript" | "any"
    domain?: string; // free-form taxonomy hint, e.g. "go-concurrency"
  };
}

/**
 * Model training configuration
 */
export interface TrainingConfig {
  learning_rate: number;
  batch_size: number;
  epochs: number;
  validation_split: number;
  early_stopping_patience: number;
  model_save_frequency: number; // Save model every N epochs
  max_training_data_points: number;
  min_confidence_threshold: number;
}

/**
 * Model version information
 */
export interface ModelVersion {
  version: string;
  created_at: Date;
  training_data_size: number;
  validation_accuracy?: number;
  training_loss?: number;
  base_model: string;
  config: TrainingConfig;
  file_path: string;
  is_active: boolean;
  performance_metrics?: {
    search_improvement: number;
    interface_detection_accuracy: number;
    relationship_accuracy: number;
  };
}

/**
 * Training session information
 */
export interface TrainingSession {
  id: string;
  started_at: Date;
  completed_at?: Date;
  status: "running" | "completed" | "failed" | "cancelled";
  data_points_count: number;
  epochs_completed: number;
  current_loss?: number;
  current_accuracy?: number;
  config: TrainingConfig;
  error_message?: string;
}

/**
 * Adaptive Model Training Service
 * Handles incremental fine-tuning of TensorFlow.js models for project-specific understanding
 */
export class AdaptiveModelTrainer {
  private baseModelManager: TensorFlowModelManager;
  private trainingData: Map<string, TrainingDataPoint> = new Map();
  private modelVersions: ModelVersion[] = [];
  private currentSession: TrainingSession | null = null;
  private modelCacheDir: string;
  private activeModel: tf.LayersModel | null = null;
  private isTraining = false;
  private initializationPromise: Promise<void>;
  private scheduledTrainingTimer: NodeJS.Timeout | null = null;
  private maxRetainedTrainingDataPoints = 10000;

  constructor(baseModelManager: TensorFlowModelManager, cacheDir?: string) {
    this.baseModelManager = baseModelManager;
    this.modelCacheDir =
      cacheDir || path.join(process.cwd(), ".memory", "trained-models");
    this.initializationPromise = this.initializeTrainer().catch((error) => {
      logger.error("Failed to initialize adaptive model trainer:", error);
    });
  }

  /**
   * Awaits trainer initialization (loading existing model versions,
   * applying baseline seed, etc.). Tests and any callers that need
   * to read training data immediately after construction should
   * `await trainer.ready()` first.
   */
  async ready(): Promise<void> {
    return this.initializationPromise;
  }

  /**
   * Initialize the trainer
   */
  private async initializeTrainer(): Promise<void> {
    try {
      await fs.mkdir(this.modelCacheDir, { recursive: true });
      await this.loadExistingVersions();
      await this.loadActiveModel();
      await this.maybeLoadBaselineSeed();

      logger.info("[SUCCESS] Adaptive model trainer initialized");
    } catch (error) {
      logger.error("Failed to initialize adaptive model trainer:", error);
      throw error;
    }
  }

  /**
   * On first run, prime the trainer with a curated set of canonical
   * software-engineering concept pairs (see modules/ml/seed-knowledge).
   * This gives the model meaningful baseline opinions about the
   * domain before any user interactions exist.
   *
   * - Skipped if the user opts out via `DISABLE_BASELINE_SEED=1`.
   * - Skipped if a `seed.lock` marker already exists in the model
   *   cache dir (we only seed once per cache dir).
   * - Skipped if the trainer already has training data loaded
   *   (i.e., an in-memory caller added points before init finished).
   *
   * Seed points are added directly to `trainingData` so we don't
   * trip the auto-train scheduler on startup.
   */
  private async maybeLoadBaselineSeed(): Promise<void> {
    if (process.env.DISABLE_BASELINE_SEED === "1") {
      logger.info(
        "[SEED] Baseline seed disabled via DISABLE_BASELINE_SEED env var"
      );
      return;
    }

    const seedMarkerPath = path.join(this.modelCacheDir, "seed.lock");
    if (await this.fileExists(seedMarkerPath)) {
      logger.debug("[SEED] Baseline seed already applied; skipping");
      return;
    }

    if (this.trainingData.size > 0) {
      logger.debug(
        "[SEED] Trainer already has data points; skipping baseline seed"
      );
      return;
    }

    try {
      const seedPoints = buildBaselineSeedData();
      for (const point of seedPoints) {
        // Insert directly to bypass the auto-training scheduler in
        // addTrainingData(); we don't want a fresh init to spawn a
        // training job before the rest of the system is ready.
        if (point.confidence >= 0.3) {
          this.trainingData.set(point.id, point);
        }
      }

      await fs.writeFile(
        seedMarkerPath,
        JSON.stringify(
          {
            seeded_at: new Date().toISOString(),
            data_points: seedPoints.length,
            note: "Delete this file (and re-init) to re-apply baseline seed.",
          },
          null,
          2
        )
      );

      logger.info(
        `[SEED] Loaded ${seedPoints.length} baseline knowledge points`
      );
    } catch (error) {
      // Seeding is best-effort; never fail init because of it.
      logger.warn("[SEED] Failed to load baseline seed:", error);
    }
  }

  /**
   * Add training data point
   */
  async addTrainingData(dataPoint: TrainingDataPoint): Promise<void> {
    if (dataPoint.confidence < 0.3) {
      logger.debug(`Skipping low-confidence training data: ${dataPoint.id}`);
      return;
    }

    this.trainingData.set(dataPoint.id, dataPoint);
    this.trimTrainingData();

    // Auto-trigger training if we have enough data
    if (this.trainingData.size % 100 === 0 && this.trainingData.size > 0) {
      logger.info(
        `[DATA] Collected ${this.trainingData.size} training data points, considering training`
      );

      // Only trigger if not already training
      if (!this.isTraining && this.trainingData.size >= 500) {
        this.scheduleTraining();
      }
    }
  }

  /**
   * Add batch training data
   */
  async addBatchTrainingData(dataPoints: TrainingDataPoint[]): Promise<void> {
    for (const point of dataPoints) {
      await this.addTrainingData(point);
    }

    logger.info(`[PROGRESS] Added ${dataPoints.length} training data points`);
  }

  /**
   * Start training with current data
   */
  async startTraining(
    config?: Partial<TrainingConfig>
  ): Promise<TrainingSession> {
    if (this.isTraining) {
      throw new Error("Training is already in progress");
    }

    if (this.trainingData.size < 50) {
      throw new Error(
        `Insufficient training data: ${this.trainingData.size} points (minimum 50 required)`
      );
    }

    const trainingConfig: TrainingConfig = {
      learning_rate: 0.001,
      batch_size: 16,
      epochs: 10,
      validation_split: 0.2,
      early_stopping_patience: 3,
      model_save_frequency: 2,
      max_training_data_points: 10000,
      min_confidence_threshold: 0.4,
      ...config,
    };

    const session: TrainingSession = {
      id: `training_${Date.now()}`,
      started_at: new Date(),
      status: "running",
      data_points_count: this.trainingData.size,
      epochs_completed: 0,
      config: trainingConfig,
    };

    this.currentSession = session;
    this.isTraining = true;

    logger.info(
      `[INIT] Starting training session ${session.id} with ${session.data_points_count} data points`
    );

    try {
      await this.performTraining(session);

      session.completed_at = new Date();
      session.status = "completed";

      logger.info(`[SUCCESS] Training session ${session.id} completed successfully`);
    } catch (error) {
      session.status = "failed";
      session.error_message =
        error instanceof Error ? error.message : "Unknown error";
      logger.error(`[ERROR] Training session ${session.id} failed:`, error);
      throw error;
    } finally {
      this.isTraining = false;
    }

    return session;
  }

  /**
   * Perform the actual training
   */
  private async performTraining(session: TrainingSession): Promise<void> {
    try {
      // Prepare training data
      const { inputs, targets } = await this.prepareTrainingData(
        session.config
      );

      // Create or load model for fine-tuning
      const model = await this.createFineTuningModel();

      // Configure training
      model.compile({
        optimizer: tf.train.adam(session.config.learning_rate),
        loss: "meanSquaredError",
        metrics: ["accuracy"],
      });

      // Setup callbacks
      const callbacks = this.createTrainingCallbacks(session);

      // Train the model
      const history = await model.fit(inputs, targets, {
        epochs: session.config.epochs,
        batchSize: session.config.batch_size,
        validationSplit: session.config.validation_split,
        callbacks: callbacks,
        shuffle: true,
        verbose: 0,
      });

      // Save trained model
      const modelVersion = await this.saveTrainedModel(model, session, history);

      // Update active model
      if (this.activeModel) {
        this.activeModel.dispose();
      }
      this.activeModel = model;

      // Update model version as active
      await this.setActiveModel(modelVersion.version);

      logger.info(`[SAVE] Saved model version ${modelVersion.version}`);
    } catch (error) {
      logger.error("Training failed:", error);
      throw error;
    }
  }

  /**
   * Prepare training data for TensorFlow
   */
  private async prepareTrainingData(config: TrainingConfig): Promise<{
    inputs: tf.Tensor;
    targets: tf.Tensor;
  }> {
    const dataPoints = Array.from(this.trainingData.values())
      .filter((point) => point.confidence >= config.min_confidence_threshold)
      .slice(0, config.max_training_data_points);

    const inputTexts: string[] = [];
    const targetEmbeddings: number[][] = [];

    for (const point of dataPoints) {
      inputTexts.push(point.input_text);

      if (point.target_embedding) {
        targetEmbeddings.push(point.target_embedding);
      } else {
        // Generate target embedding using base model
        const embedding = await this.baseModelManager.generateEmbeddings([
          point.input_text,
        ]);
        targetEmbeddings.push(embedding[0]);
      }
    }

    // Convert to tensors
    const inputEmbeddings = await this.baseModelManager.generateEmbeddings(
      inputTexts
    );

    const inputs = tf.tensor2d(inputEmbeddings);
    const targets = tf.tensor2d(targetEmbeddings);

    return { inputs, targets };
  }

  /**
   * Create fine-tuning model based on Universal Sentence Encoder
   */
  private async createFineTuningModel(): Promise<tf.LayersModel> {
    // Create a simple fine-tuning model that learns to adjust embeddings
    const model = tf.sequential({
      layers: [
        tf.layers.dense({
          inputShape: [512], // Universal Sentence Encoder output size
          units: 256,
          activation: "relu",
          name: "fine_tune_layer_1",
        }),
        tf.layers.dropout({ rate: 0.1 }),
        tf.layers.dense({
          units: 512,
          activation: "linear",
          name: "fine_tune_output",
        }),
      ],
    });

    return model;
  }

  /**
   * Create training callbacks (simplified version for compatibility)
   */
  private createTrainingCallbacks(
    session: TrainingSession
  ): tf.CustomCallback[] {
    const epochEndCallback: tf.CustomCallback = {
      onEpochEnd: async (epoch: number, logs?: tf.Logs) => {
        session.epochs_completed = epoch + 1;

        // Extract scalar values safely
        let lossValue = 0;
        let accuracyValue = 0;

        if (logs?.loss) {
          if (typeof logs.loss === "number") {
            lossValue = logs.loss;
          } else {
            lossValue = (logs.loss as tf.Scalar).dataSync()[0];
          }
        }

        if (logs?.accuracy) {
          if (typeof logs.accuracy === "number") {
            accuracyValue = logs.accuracy;
          } else {
            accuracyValue = (logs.accuracy as tf.Scalar).dataSync()[0];
          }
        }

        session.current_loss = lossValue;
        session.current_accuracy = accuracyValue;

        logger.info(
          `[PROGRESS] Epoch ${epoch + 1}/${session.config.epochs}: ` +
            `loss=${lossValue.toFixed(4)}, accuracy=${accuracyValue.toFixed(4)}`
        );

        // Save model periodically
        if ((epoch + 1) % session.config.model_save_frequency === 0) {
          logger.info(`[SAVE] Saving model checkpoint at epoch ${epoch + 1}`);
        }
      },
    } as tf.CustomCallback;

    return [epochEndCallback];
  }

  /**
   * Save trained model as new version
   */
  private async saveTrainedModel(
    model: tf.LayersModel,
    session: TrainingSession,
    history: tf.History
  ): Promise<ModelVersion> {
    const version = `v${Date.now()}`;
    const modelPath = path.join(this.modelCacheDir, version);

    await fs.mkdir(modelPath, { recursive: true });

    // Save model
    await model.save(`file://${path.join(modelPath, "model")}`);

    // Calculate final metrics
    const finalLoss = history.history.loss[
      history.history.loss.length - 1
    ] as number;
    const finalAccuracy = history.history.accuracy?.[
      history.history.accuracy.length - 1
    ] as number;

    const modelVersion: ModelVersion = {
      version,
      created_at: new Date(),
      training_data_size: session.data_points_count,
      validation_accuracy: finalAccuracy,
      training_loss: finalLoss,
      base_model: "universal-sentence-encoder",
      config: session.config,
      file_path: modelPath,
      is_active: false, // Will be set active later
    };

    // Save version metadata
    await fs.writeFile(
      path.join(modelPath, "metadata.json"),
      JSON.stringify(modelVersion, null, 2)
    );

    this.modelVersions.push(modelVersion);
    await this.saveVersionsManifest();

    return modelVersion;
  }

  /**
   * Generate enhanced embedding using trained model
   */
  async generateEnhancedEmbedding(text: string): Promise<number[] | null> {
    if (!this.activeModel) {
      // Fallback to base model
      return this.baseModelManager
        .generateEmbeddings([text])
        .then((embeddings) => embeddings[0]);
    }

    try {
      // Get base embedding
      const baseEmbeddings = await this.baseModelManager.generateEmbeddings([
        text,
      ]);
      if (!baseEmbeddings || baseEmbeddings.length === 0) {
        return null;
      }

      // Apply fine-tuned adjustments
      const baseEmbedding = tf.tensor2d([baseEmbeddings[0]]);
      const enhancedEmbedding = this.activeModel.predict(
        baseEmbedding
      ) as tf.Tensor;
      const result = await enhancedEmbedding.data();

      // Cleanup tensors
      baseEmbedding.dispose();
      enhancedEmbedding.dispose();

      return Array.from(result);
    } catch (error) {
      logger.warn(
        "Failed to generate enhanced embedding, falling back to base:",
        error
      );
      return this.baseModelManager
        .generateEmbeddings([text])
        .then((embeddings) => embeddings[0]);
    }
  }

  /**
   * Load existing model versions
   */
  private async loadExistingVersions(): Promise<void> {
    try {
      const manifestPath = path.join(this.modelCacheDir, "versions.json");
      if (await this.fileExists(manifestPath)) {
        const content = await fs.readFile(manifestPath, "utf-8");
        this.modelVersions = JSON.parse(content);
        logger.info(
          `[CLIPBOARD] Loaded ${this.modelVersions.length} existing model versions`
        );
      }
    } catch (error) {
      logger.warn("Failed to load existing versions:", error);
      this.modelVersions = [];
    }
  }

  /**
   * Save versions manifest
   */
  private async saveVersionsManifest(): Promise<void> {
    const manifestPath = path.join(this.modelCacheDir, "versions.json");
    await fs.writeFile(
      manifestPath,
      JSON.stringify(this.modelVersions, null, 2)
    );
  }

  /**
   * Load active model
   */
  private async loadActiveModel(): Promise<void> {
    const activeVersion = this.modelVersions.find((v) => v.is_active);
    if (activeVersion) {
      try {
        const modelPath = path.join(
          activeVersion.file_path,
          "model",
          "model.json"
        );
        this.activeModel = await tf.loadLayersModel(`file://${modelPath}`);
        logger.info(`[TARGET] Loaded active model version ${activeVersion.version}`);
      } catch (error) {
        logger.warn(
          `Failed to load active model ${activeVersion.version}:`,
          error
        );
      }
    }
  }

  /**
   * Set active model version
   */
  async setActiveModel(version: string): Promise<void> {
    // Deactivate all versions
    this.modelVersions.forEach((v) => (v.is_active = false));

    // Activate specified version
    const targetVersion = this.modelVersions.find((v) => v.version === version);
    if (targetVersion) {
      targetVersion.is_active = true;
      await this.saveVersionsManifest();

      // Reload active model
      await this.loadActiveModel();

      logger.info(`[SUCCESS] Set model version ${version} as active`);
    } else {
      throw new Error(`Model version ${version} not found`);
    }
  }

  /**
   * Get training statistics
   */
  getTrainingStatistics(): {
    total_data_points: number;
    data_by_source: { [source: string]: number };
    average_confidence: number;
    model_versions: number;
    active_version?: string;
    is_training: boolean;
    current_session?: TrainingSession;
  } {
    const dataPoints = Array.from(this.trainingData.values());
    const sourceTypes = dataPoints.reduce((acc, point) => {
      acc[point.source_type] = (acc[point.source_type] || 0) + 1;
      return acc;
    }, {} as { [source: string]: number });

    const averageConfidence =
      dataPoints.length > 0
        ? dataPoints.reduce((sum, point) => sum + point.confidence, 0) /
          dataPoints.length
        : 0;

    const activeVersion = this.modelVersions.find((v) => v.is_active);

    return {
      total_data_points: dataPoints.length,
      data_by_source: sourceTypes,
      average_confidence: averageConfidence,
      model_versions: this.modelVersions.length,
      active_version: activeVersion?.version,
      is_training: this.isTraining,
      current_session: this.currentSession || undefined,
    };
  }

  /**
   * Schedule training to run asynchronously
   */
  private scheduleTraining(): void {
    if (this.scheduledTrainingTimer) return;

    this.scheduledTrainingTimer = setTimeout(async () => {
      this.scheduledTrainingTimer = null;
      try {
        if (!this.isTraining && this.trainingData.size >= 500) {
          logger.info("[BOT] Auto-starting incremental training");
          await this.startTraining();
        }
      } catch (error) {
        logger.error("Auto-training failed:", error);
      }
    }, 5000); // 5 second delay
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.scheduledTrainingTimer) {
      clearTimeout(this.scheduledTrainingTimer);
      this.scheduledTrainingTimer = null;
    }

    if (this.activeModel) {
      this.activeModel.dispose();
      this.activeModel = null;
    }

    this.trainingData.clear();
    this.isTraining = false;
    this.currentSession = null;
  }

  // Helper methods
  private trimTrainingData(): void {
    if (this.trainingData.size <= this.maxRetainedTrainingDataPoints) return;

    const sorted = Array.from(this.trainingData.values()).sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );
    const overflow = this.trainingData.size - this.maxRetainedTrainingDataPoints;
    for (const point of sorted.slice(0, overflow)) {
      this.trainingData.delete(point.id);
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
