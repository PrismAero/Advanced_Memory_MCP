import { EnhancedMemoryManager } from "../enhanced-memory-manager-modular.js";
import { Entity } from "../memory-types.js";
import { ContextEngine } from "./intelligence/context-engine.js";
import { logger } from "./logger.js";
import { AdaptiveModelTrainer } from "./ml/adaptive-model-trainer.js";
import { resolveOwnedPath } from "./path-boundary.js";
import { ProjectEmbeddingEngine } from "./ml/project-embedding-engine.js";
import { TrainingDataCollector } from "./ml/training-data-collector.js";
import { FileWatcher } from "./project-analysis/file-watcher.js";
import { InterfaceMapper } from "./project-analysis/interface-mapper.js";
import { ProjectIndexer } from "./project-analysis/project-indexer.js";
import {
  BACKGROUND_CONFIG,
  BATCH_CONFIG,
} from "./similarity/similarity-config.js";
import { ModernSimilarityEngine } from "./similarity/similarity-engine.js";
import { ProjectAnalysisOperations } from "./sqlite/project-analysis-operations.js";

/**
 * Background Processing Service for AI Memory Enhancement
 * Handles automatic relationship detection, relevance scoring, and context management
 */
export class BackgroundProcessor {
  private memoryManager: EnhancedMemoryManager;
  private similarityEngine: ModernSimilarityEngine;
  private isProcessing: boolean = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private accessHistory: Map<
    string,
    { count: number; lastAccess: Date; coAccessors: Set<string> }
  > = new Map();

  // Per-branch signature cache used to short-circuit background passes
  // when nothing has changed in a branch since the previous run.
  // Signature is `<entityCount>:<maxLastAccessedISO>:<maxRelationCount>`.
  private branchSignatures: Map<string, string> = new Map();

  // New project analysis components
  private projectIndexer: ProjectIndexer;
  private fileWatcher: FileWatcher | null = null;
  private interfaceMapper: InterfaceMapper | null = null;
  private projectAnalysisOps: ProjectAnalysisOperations | null = null;
  private trainingDataCollector: TrainingDataCollector;
  private adaptiveModelTrainer: AdaptiveModelTrainer | null = null;
  private contextEngine: ContextEngine | null = null;
  private projectEmbeddingEngine: ProjectEmbeddingEngine | null = null;

  // Project monitoring state
  private currentProjectPath: string | null = null;
  private lastProjectAnalysis: Date | null = null;
  private projectMonitoringInterval: NodeJS.Timeout | null = null;
  private interfaceAnalysisInterval: NodeJS.Timeout | null = null;
  private initialProjectScanTimeout: NodeJS.Timeout | null = null;

  constructor(
    memoryManager: EnhancedMemoryManager,
    similarityEngine: ModernSimilarityEngine,
    projectAnalysisOps?: ProjectAnalysisOperations,
    adaptiveModelTrainer?: AdaptiveModelTrainer,
  ) {
    this.memoryManager = memoryManager;
    this.similarityEngine = similarityEngine;
    this.projectAnalysisOps = projectAnalysisOps || null;
    this.adaptiveModelTrainer = adaptiveModelTrainer || null;

    // Initialize ML components if not provided
    if (!this.adaptiveModelTrainer) {
      const modelManager = this.similarityEngine.getModelManager();
      this.adaptiveModelTrainer = new AdaptiveModelTrainer(modelManager);
    }

    this.projectEmbeddingEngine = new ProjectEmbeddingEngine(
      this.similarityEngine.getModelManager(),
      this.adaptiveModelTrainer,
    );

    if (this.projectAnalysisOps) {
      this.interfaceMapper = new InterfaceMapper(
        this.projectAnalysisOps,
        this.projectEmbeddingEngine,
      );

      this.contextEngine = new ContextEngine(
        this.projectEmbeddingEngine,
        this.interfaceMapper,
        this.projectAnalysisOps,
      );
    }

    // Initialize project analysis components
    this.projectIndexer = new ProjectIndexer();
    this.trainingDataCollector = new TrainingDataCollector();

    // Set up training data collection events
    this.trainingDataCollector.on("trainingDataGenerated", (trainingPoint) => {
      if (this.adaptiveModelTrainer) {
        this.adaptiveModelTrainer.addTrainingData(trainingPoint);
      }
    });

    logger.info(
      "[BOT] Enhanced background processor initialized with ML-based project monitoring",
    );
  }

  getInterfaceMapper(): InterfaceMapper | null {
    return this.interfaceMapper;
  }

  getAdaptiveModelTrainer(): AdaptiveModelTrainer | null {
    return this.adaptiveModelTrainer;
  }

  getProjectIndexer(): ProjectIndexer {
    return this.projectIndexer;
  }

  getContextEngine(): ContextEngine | null {
    return this.contextEngine;
  }

  getProjectEmbeddingEngine(): ProjectEmbeddingEngine | null {
    return this.projectEmbeddingEngine;
  }

  /**
   * Start background processing with configurable interval
   */
  start(intervalMinutes: number = 30): void {
    if (this.processingInterval) {
      logger.info("Background processor already running");
      return;
    }

    const intervalMs = intervalMinutes * 60 * 1000;
    this.processingInterval = setInterval(() => {
      this.runBackgroundTasks().catch((error) => {
        logger.error("Background processing error:", error);
      });
    }, intervalMs);

    logger.info(
      `Background processor started with ${intervalMinutes} minute interval`,
    );

    // Run initial background tasks after a short delay
    setTimeout(() => {
      this.runBackgroundTasks().catch((error) => {
        logger.error("Initial background processing error:", error);
      });
    }, 30000); // 30 seconds delay
  }

  /**
   * Stop background processing
   */
  stop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    if (this.projectMonitoringInterval) {
      clearInterval(this.projectMonitoringInterval);
      this.projectMonitoringInterval = null;
    }

    if (this.initialProjectScanTimeout) {
      clearTimeout(this.initialProjectScanTimeout);
      this.initialProjectScanTimeout = null;
    }

    if (this.interfaceAnalysisInterval) {
      clearInterval(this.interfaceAnalysisInterval);
      this.interfaceAnalysisInterval = null;
    }

    if (this.fileWatcher) {
      void this.fileWatcher.stopWatching();
      this.fileWatcher = null;
    }

    this.trainingDataCollector.dispose();
    this.contextEngine?.dispose();
    this.adaptiveModelTrainer?.dispose();

    logger.info("Enhanced background processor stopped");
  }

  /**
   * Set the project to monitor and start monitoring tasks
   */
  setMonitoredProject(projectPath: string): void {
    this.currentProjectPath = resolveOwnedPath(projectPath, "project_path");
    // Force the next monitorProjectStructure() to actually run,
    // even if the process previously ran one for a different path.
    this.lastProjectAnalysis = null;
    logger.info(
      `[BACKGROUND] Set monitored project path: ${this.currentProjectPath}`,
    );

    // Start monitoring if not already running
    if (!this.projectMonitoringInterval) {
      this.startProjectMonitoring();
    }

    if (!this.interfaceAnalysisInterval) {
      this.startInterfaceAnalysis();
    }

    this.cleanupIgnoredProjectFiles().catch((error) => {
      logger.warn("Startup ignored-file cleanup failed:", error);
    });

    this.scheduleInitialProjectScan();
  }

  /**
   * Start project structure monitoring (every 3 minutes)
   */
  private startProjectMonitoring(): void {
    if (!this.currentProjectPath) return;

    this.projectMonitoringInterval = setInterval(
      async () => {
        try {
          await this.monitorProjectStructure();
        } catch (error) {
          logger.error("Project monitoring error:", error);
        }
      },
      3 * 60 * 1000,
    ); // 3 minutes

    // Start file watcher for real-time changes
    if (!this.fileWatcher) {
      this.fileWatcher = new FileWatcher(this.projectIndexer, {
        skipInitialAnalysis: true,
        skipInitialFolderTree: true,
      });
      this.fileWatcher.startWatching(this.currentProjectPath).catch((error) => {
        logger.warn("File watcher startup failed:", error);
      });

      this.fileWatcher.on("significantChanges", (changes) => {
        logger.debug(
          `[FOLDER] Detected ${changes.length} significant file changes`,
        );
        this.handleFileChanges(changes);
      });
    }

    logger.info("[FOLDER] Project monitoring started (3-minute intervals)");
  }

  private scheduleInitialProjectScan(): void {
    if (!this.currentProjectPath) return;
    if (this.initialProjectScanTimeout) {
      clearTimeout(this.initialProjectScanTimeout);
      this.initialProjectScanTimeout = null;
    }

    const delayMs = Number(
      process.env.ADVANCED_MEMORY_INITIAL_SCAN_DELAY_MS || 60_000,
    );
    this.initialProjectScanTimeout = setTimeout(() => {
      this.initialProjectScanTimeout = null;
      this.shouldSkipInitialProjectScan()
        .then((skip) => {
          if (skip) {
            logger.info(
              "[BACKGROUND] Existing project index found; skipping startup full project scan",
            );
            this.lastProjectAnalysis = new Date();
            return;
          }
          return this.monitorProjectStructure();
        })
        .catch((error) => {
          logger.error("Initial project scan error:", error);
        });
    }, Math.max(0, delayMs));

    logger.info(
      `[BACKGROUND] Initial project scan scheduled in ${Math.round(
        delayMs / 1000,
      )}s`,
    );
  }

  private async shouldSkipInitialProjectScan(): Promise<boolean> {
    if (!this.projectAnalysisOps || !this.currentProjectPath) return false;
    const stats = await this.projectAnalysisOps.getProjectIndexStats();
    return stats.fileCount > 0;
  }

  private async cleanupIgnoredProjectFiles(): Promise<void> {
    if (!this.projectAnalysisOps || !this.currentProjectPath) return;
    const removed = await this.projectAnalysisOps.cleanupIgnoredFiles(
      this.currentProjectPath,
    );
    if (removed > 0) {
      logger.info(`[MEMORYIGNORE] Removed ${removed} ignored project files`);
    }
  }

  /**
   * Start interface analysis (every 10 minutes)
   */
  private startInterfaceAnalysis(): void {
    if (!this.projectAnalysisOps) return;

    this.interfaceAnalysisInterval = setInterval(
      async () => {
        try {
          await this.analyzeProjectInterfaces();
        } catch (error) {
          logger.error("Interface analysis error:", error);
        }
      },
      10 * 60 * 1000,
    ); // 10 minutes

    logger.info("[SEARCH] Interface analysis started (10-minute intervals)");
  }

  /**
   * Monitor project structure changes.
   *
   * Persistence runs in two phases so an interrupted scan still leaves
   * the database in a useful state:
   *   1. Cheap: scan files, write project_files / code_interfaces /
   *      project_dependencies / workspace_context rows.
   *   2. Expensive: embed files+interfaces and back-fill the vectors
   *      table. This is allowed to be slow / interrupted.
   */
  private async monitorProjectStructure(): Promise<void> {
    if (!this.currentProjectPath || !this.projectAnalysisOps) return;

    try {
      logger.debug("[DATA] Monitoring project structure changes");

      // Re-analyze project if it's been a while
      const shouldReanalyze =
        !this.lastProjectAnalysis ||
        Date.now() - this.lastProjectAnalysis.getTime() > 30 * 60 * 1000; // 30 minutes

      if (!shouldReanalyze) return;

      const projectInfo = await this.projectIndexer.analyzeProject(
        this.currentProjectPath,
      );
      await this.projectAnalysisOps.storeWorkspaceContext(projectInfo);

      const files = await this.projectIndexer.scanProjectFiles(
        this.currentProjectPath,
      );
      logger.info(
        `[ANALYSIS] Persisting ${files.length} project files (embeddings will follow)`,
      );

      // Phase 1 — persist file + interface + dependency metadata before
      // doing any embedding work, so even a short-lived process leaves
      // a useful snapshot in the database.
      const storedFiles =
        await this.projectAnalysisOps.storeProjectFiles(files);
      const storedFilesByPath = new Map(
        storedFiles
          .filter((f) => typeof f.id === "number")
          .map((f) => [f.file_path, f.id as number]),
      );

      for (const file of files) {
        const storedId = storedFilesByPath.get(file.filePath);
        if (!storedId) continue;

        if (file.interfaces && file.interfaces.length > 0) {
          await this.projectAnalysisOps.storeCodeInterfaces(
            storedId,
            file.interfaces,
          );
        }

        if (
          (file.imports && file.imports.length > 0) ||
          (file.exports && file.exports.length > 0)
        ) {
          await this.projectAnalysisOps.storeProjectDependencies(
            storedId,
            file.imports || [],
            file.exports || [],
          );
        }
      }

      await this.projectAnalysisOps.refreshInterfaceRelationships();

      // Drop rows for files that no longer exist on disk.
      try {
        await this.cleanupIgnoredProjectFiles();

        await this.projectAnalysisOps.cleanupDeletedFiles(
          files.map((f) => f.filePath),
        );
      } catch (error) {
        logger.warn("Cleanup of deleted files failed:", error);
      }

      this.lastProjectAnalysis = new Date();
      logger.info(
        `[LOADING] Project structure persisted (${storedFiles.length}/${files.length} files)`,
      );

      // Phase 2 — kick off embedding back-fill in the background. Any
      // already-persisted row simply gets its vector populated when the
      // model finishes; we don't block this scan on it.
      if (this.projectEmbeddingEngine) {
        this.backfillMissingEmbeddings().catch((error) => {
          logger.debug("Embedding backfill error:", error);
        });
      }
    } catch (error) {
      logger.error("Failed to monitor project structure:", error);
    }
  }

  /**
   * Analyze project interfaces for semantic relationships
   */
  private async analyzeProjectInterfaces(): Promise<void> {
    if (!this.interfaceMapper) return;

    try {
      logger.debug("[SEARCH] Analyzing project interfaces");

      // Also check and backfill missing embeddings
      if (this.projectAnalysisOps && this.projectEmbeddingEngine) {
        await this.backfillMissingEmbeddings();
      }

      if (this.projectAnalysisOps) {
        const created =
          await this.projectAnalysisOps.refreshInterfaceRelationships();
        logger.debug(
          `Interface relationship refresh created ${created} relationships`,
        );
      }
    } catch (error) {
      logger.error("Failed to analyze project interfaces:", error);
    }
  }

  /**
   * Backfill missing embeddings for existing data
   */
  private async backfillMissingEmbeddings(): Promise<void> {
    if (!this.projectAnalysisOps || !this.projectEmbeddingEngine) return;

    try {
      // Generate embeddings for files without them (batch of 50)
      const fileEmbeddingGenerator = async (fileContext: string) => {
        const result =
          await this.projectEmbeddingEngine!.generateProjectEmbedding(
            fileContext,
            "documentation",
            {},
          );
        return result?.embedding || null;
      };

      const updatedFiles =
        await this.projectAnalysisOps.generateMissingFileEmbeddings(
          fileEmbeddingGenerator,
          50,
        );

      // Generate embeddings for interfaces without them (batch of 50)
      const interfaceEmbeddingGenerator = async (interfaceContext: string) => {
        const result =
          await this.projectEmbeddingEngine!.generateProjectEmbedding(
            interfaceContext,
            "interface_definition",
            {},
          );
        return result?.embedding || null;
      };

      const updatedInterfaces =
        await this.projectAnalysisOps.generateMissingInterfaceEmbeddings(
          interfaceEmbeddingGenerator,
          50,
        );

      if (updatedFiles.length > 0 || updatedInterfaces.length > 0) {
        logger.info(
          `[VECTOR] Backfilled embeddings: ${updatedFiles.length} files, ${updatedInterfaces.length} interfaces`,
        );
      }
    } catch (error) {
      logger.debug("Backfill embeddings error:", error);
    }
  }

  /**
   * Handle real-time file changes
   */
  private async handleFileChanges(changes: any[]): Promise<void> {
    for (const change of changes) {
      try {
        // Extract relevant information for training data
        if (
          this.trainingDataCollector &&
          this.shouldCollectTrainingData(change)
        ) {
          // This would collect training data from file changes
          logger.debug(` Would collect training data from: ${change.path}`);
        }

        // Update relevant entity relevance scores
        await this.updateRelevanceForFileChange(change);
      } catch (error) {
        logger.warn(`Failed to process file change ${change.path}:`, error);
      }
    }
  }

  /**
   * Check if we should collect training data from this change
   */
  private shouldCollectTrainingData(change: any): boolean {
    if (!change.path) return false;

    // Collect from TypeScript/JavaScript files
    const ext = change.path.split(".").pop();
    return ["ts", "tsx", "js", "jsx"].includes(ext);
  }

  /**
   * Update entity relevance scores based on file changes
   */
  private async updateRelevanceForFileChange(change: any): Promise<void> {
    try {
      // Find entities related to the changed file
      const fileName = change.path.split("/").pop();
      if (!fileName) return;

      // Search for entities that might be related to this file
      const searchResults = await this.memoryManager.searchNodes(
        fileName,
        undefined,
        undefined,
        false,
      );

      for (const entity of searchResults.entities.slice(0, 5)) {
        // Boost relevance for entities related to recently changed files
        await this.updateEntityRelevanceScore(entity.name, 0.8, "main");
        await this.updateEntityWorkingContext(entity.name, true, "main");
      }
    } catch (error) {
      logger.debug(`Failed to update relevance for file change:`, error);
    }
  }

  /**
   * Record entity access for pattern analysis
   */
  recordEntityAccess(
    entityName: string,
    coAccessedEntities: string[] = [],
  ): void {
    const now = new Date();

    // Update access history for main entity
    const history = this.accessHistory.get(entityName) || {
      count: 0,
      lastAccess: now,
      coAccessors: new Set<string>(),
    };

    history.count++;
    history.lastAccess = now;

    // Track co-accessed entities
    coAccessedEntities.forEach((coEntity) => {
      if (coEntity !== entityName) {
        history.coAccessors.add(coEntity);
      }
    });

    this.accessHistory.set(entityName, history);

    // Clean up old access history (older than 30 days)
    const cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    for (const [key, value] of this.accessHistory.entries()) {
      if (value.lastAccess < cutoffDate) {
        this.accessHistory.delete(key);
      }
    }
  }

  /**
   * Run all background processing tasks
   */
  private async runBackgroundTasks(): Promise<void> {
    if (this.isProcessing) {
      logger.debug("Background processing already in progress, skipping");
      return;
    }

    this.isProcessing = true;
    logger.info("Starting background processing tasks");

    try {
      // Task 1: Update relevance scores based on access patterns
      await this.updateRelevanceScores();

      // Task 2: Detect and create new relationships
      await this.detectAndCreateRelationships();

      // Task 3: Update working context flags
      await this.updateWorkingContextFlags();

      // Task 4: Clean up outdated context flags
      await this.cleanupOutdatedContext();

      // Task 5: Suggest new branch relationships
      await this.suggestBranchRelationships();

      logger.info("Background processing tasks completed successfully");
    } catch (error) {
      logger.error("Error during background processing:", error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Compute a cheap signature for a branch graph. Used to skip
   * background passes when nothing has changed since the last run.
   */
  private computeBranchSignature(branchGraph: {
    entities: Entity[];
    relations?: any[];
  }): string {
    const entityCount = branchGraph.entities.length;
    const relationCount = branchGraph.relations?.length || 0;
    let maxLastAccessed = 0;
    for (const entity of branchGraph.entities) {
      if (entity.lastAccessed) {
        const t = new Date(entity.lastAccessed).getTime();
        if (t > maxLastAccessed) maxLastAccessed = t;
      }
    }
    return `${entityCount}:${maxLastAccessed}:${relationCount}`;
  }

  /**
   * Update relevance scores based on access patterns and recency
   */
  private async updateRelevanceScores(): Promise<void> {
    logger.debug("Updating relevance scores based on access patterns");

    try {
      // Get all branches to process
      const branches = await this.memoryManager.listBranches();

      for (const branch of branches) {
        const branchGraph = await this.memoryManager.exportBranch(branch.name);

        // Short-circuit: if nothing changed in this branch since the
        // last pass, the previously-computed relevance scores are
        // still valid and we can skip the inner loop entirely.
        const sig = this.computeBranchSignature(branchGraph);
        const sigKey = `relevance:${branch.name}`;
        if (this.branchSignatures.get(sigKey) === sig) {
          logger.debug(
            `Skipping relevance pass for unchanged branch '${branch.name}'`,
          );
          continue;
        }
        this.branchSignatures.set(sigKey, sig);

        for (const entity of branchGraph.entities) {
          const newRelevanceScore = this.calculateRelevanceScore(entity);

          // Update if score changed significantly
          if (
            Math.abs((entity.relevanceScore || 0.5) - newRelevanceScore) >
            BACKGROUND_CONFIG.relevanceUpdateThreshold
          ) {
            await this.updateEntityRelevanceScore(
              entity.name,
              newRelevanceScore,
              branch.name,
            );
          }
        }
      }

      logger.debug("Relevance scores updated successfully");
    } catch (error) {
      logger.error("Error updating relevance scores:", error);
    }
  }

  /**
   * Calculate relevance score based on multiple factors
   */
  private calculateRelevanceScore(entity: Entity): number {
    let score = 0.5; // Base score

    // Factor 1: Access frequency from recorded history
    const accessHistory = this.accessHistory.get(entity.name);
    if (accessHistory) {
      // Higher access count increases relevance
      const accessWeight = Math.min(accessHistory.count / 10, 0.3); // Max 0.3 boost
      score += accessWeight;
    }

    // Factor 2: Recency of access
    const lastAccessed = entity.lastAccessed
      ? new Date(entity.lastAccessed)
      : new Date(0);
    const daysSinceAccess =
      (Date.now() - lastAccessed.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceAccess < 1)
      score += 0.2; // Very recent
    else if (daysSinceAccess < 7)
      score += 0.1; // Recent
    else if (daysSinceAccess > 30) score -= 0.1; // Old

    // Factor 3: Working context status
    if (entity.workingContext) {
      score += 0.3;
    }

    // Factor 4: Entity type importance
    if (entity.entityType === "decision") score += 0.1;
    else if (entity.entityType === "blocker") score += 0.15;
    else if (entity.entityType === "current-status") score += 0.2;

    // Factor 5: Co-access patterns (entities accessed together)
    if (accessHistory && accessHistory.coAccessors.size > 0) {
      score += Math.min(accessHistory.coAccessors.size / 20, 0.1); // Max 0.1 boost
    }

    // Ensure score stays within bounds
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Detect and create new relationships between entities
   */
  private async detectAndCreateRelationships(): Promise<void> {
    logger.debug("Detecting new entity relationships");

    try {
      const branches = await this.memoryManager.listBranches();

      for (const branch of branches) {
        const branchGraph = await this.memoryManager.exportBranch(branch.name);

        // Short-circuit: skip the (expensive) similarity sweep if no
        // entities have been added or touched since the last pass.
        const sig = this.computeBranchSignature(branchGraph);
        const sigKey = `relations:${branch.name}`;
        if (this.branchSignatures.get(sigKey) === sig) {
          logger.debug(
            `Skipping relationship detection for unchanged branch '${branch.name}'`,
          );
          continue;
        }
        this.branchSignatures.set(sigKey, sig);

        // Find potential relationships using similarity and access patterns
        const newRelationships = await this.findPotentialRelationships(
          branchGraph.entities,
        );

        // Batch all qualifying relationships into a single
        // createRelations call. The legacy implementation looped and
        // called createRelations once per pair, which produced
        // hundreds of "[INFO] Created 1 of 1 relations" log lines
        // and hammered SQLite with one transaction per relation.
        const candidates = newRelationships
          .filter((rel) => rel.confidence > 0.7)
          .map((rel) => ({
            from: rel.from,
            to: rel.to,
            relationType: rel.type,
          }));

        if (candidates.length === 0) continue;

        try {
          const created = await this.memoryManager.createRelations(
            candidates,
            branch.name,
          );
          if (created.length > 0) {
            logger.debug(
              `Created ${created.length} relationships in branch ${branch.name}`,
            );
          }
        } catch (error) {
          // INSERT OR IGNORE inside createRelations swallows duplicates,
          // so anything that surfaces here is a real failure.
          logger.warn("Error creating relationship batch:", error);
        }
      }

      logger.debug("Relationship detection completed");
    } catch (error) {
      logger.error("Error in relationship detection:", error);
    }
  }

  /**
   * Find potential relationships between entities using TensorFlow.js embeddings
   */
  private async findPotentialRelationships(entities: Entity[]): Promise<any[]> {
    // Optimize for embeddings: Use batch processing for large entity sets
    if (entities.length > BATCH_CONFIG.size) {
      logger.debug(
        `Using batch TensorFlow.js processing for ${entities.length} entities`,
      );
      return this.findPotentialRelationshipsBatch(entities);
    }

    const relationships: any[] = [];

    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const entity1 = entities[i];
        const entity2 = entities[j];

        // Check TensorFlow.js embedding-based relationships
        const similarityResults =
          await this.similarityEngine.detectSimilarEntities(entity1, [entity2]);

        if (
          similarityResults.length > 0 &&
          (similarityResults[0].confidence === "high" ||
            (similarityResults[0].confidence === "medium" &&
              similarityResults[0].similarity > 0.8))
        ) {
          relationships.push({
            from: entity1.name,
            to: entity2.name,
            type:
              similarityResults[0].suggestedRelationType ||
              "semantically_related",
            confidence: similarityResults[0].similarity,
            reason: `TensorFlow.js embedding similarity: ${(
              similarityResults[0].similarity * 100
            ).toFixed(1)}%`,
          });
        }

        // Check co-access patterns
        const entity1History = this.accessHistory.get(entity1.name);
        const entity2History = this.accessHistory.get(entity2.name);

        if (
          entity1History?.coAccessors.has(entity2.name) &&
          entity2History?.coAccessors.has(entity1.name)
        ) {
          relationships.push({
            from: entity1.name,
            to: entity2.name,
            type: "co_accessed",
            confidence: 0.75,
            reason: "frequent_co_access",
          });
        }

        // Check type-based relationships
        if (
          entity1.entityType === "blocker" &&
          entity2.entityType === "decision"
        ) {
          relationships.push({
            from: entity1.name,
            to: entity2.name,
            type: "blocks",
            confidence: 0.6,
            reason: "type_inference",
          });
        }

        if (
          entity1.entityType === "decision" &&
          entity2.entityType === "current-status"
        ) {
          relationships.push({
            from: entity1.name,
            to: entity2.name,
            type: "affects",
            confidence: 0.65,
            reason: "type_inference",
          });
        }
      }
    }

    return relationships;
  }

  /**
   * Optimized batch relationship detection for large entity sets using TensorFlow.js
   */
  private async findPotentialRelationshipsBatch(
    entities: Entity[],
  ): Promise<any[]> {
    const relationships: any[] = [];
    const batchSize = 20; // Process in smaller batches to avoid memory issues

    logger.debug(
      `Processing ${entities.length} entities in batches of ${batchSize}`,
    );

    try {
      // Use the similarity engine's batch calculation for efficiency
      const batchSimilarities =
        await this.similarityEngine.calculateBatchSimilarity(entities);

      // Process results to extract relationships
      for (const [entityName, similarities] of batchSimilarities.entries()) {
        for (const similarity of similarities) {
          // Apply higher thresholds for batch processing to reduce noise
          if (similarity.similarity > 0.75) {
            relationships.push({
              from: entityName,
              to: similarity.entity.name,
              type: "embedding_similarity",
              confidence: similarity.similarity,
              reason: `Batch TensorFlow.js processing: ${(
                similarity.similarity * 100
              ).toFixed(1)}% similarity`,
            });
          }
        }
      }

      // Add co-access and type-based relationships for batch entities
      for (let i = 0; i < entities.length; i += batchSize) {
        const batch = entities.slice(i, i + batchSize);
        const batchRelationships =
          await this.findPatternBasedRelationships(batch);
        relationships.push(...batchRelationships);
      }

      logger.debug(
        `Batch processing found ${relationships.length} potential relationships`,
      );
      return relationships;
    } catch (error) {
      logger.error("Error in batch relationship detection:", error);
      // Fall back to normal processing
      return this.findPotentialRelationshipsNormal(entities.slice(0, 50)); // Limit to prevent overload
    }
  }

  /**
   * Find pattern-based relationships (co-access, type-based) for batch processing
   */
  private async findPatternBasedRelationships(
    entities: Entity[],
  ): Promise<any[]> {
    const relationships: any[] = [];

    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const entity1 = entities[i];
        const entity2 = entities[j];

        // Check co-access patterns
        const entity1History = this.accessHistory.get(entity1.name);
        const entity2History = this.accessHistory.get(entity2.name);

        if (
          entity1History?.coAccessors.has(entity2.name) &&
          entity2History?.coAccessors.has(entity1.name)
        ) {
          relationships.push({
            from: entity1.name,
            to: entity2.name,
            type: "co_accessed",
            confidence: 0.75,
            reason: "frequent_co_access_pattern",
          });
        }

        // Enhanced type-based relationship detection
        const typeRelationship = this.detectTypeBasedRelationship(
          entity1,
          entity2,
        );
        if (typeRelationship) {
          relationships.push(typeRelationship);
        }
      }
    }

    return relationships;
  }

  /**
   * Detect type-based relationships with enhanced rules for TensorFlow.js context
   */
  private detectTypeBasedRelationship(
    entity1: Entity,
    entity2: Entity,
  ): any | null {
    // Enhanced type relationship rules
    const typeRules = [
      { from: "blocker", to: "decision", type: "blocks", confidence: 0.7 },
      {
        from: "decision",
        to: "current-status",
        type: "affects",
        confidence: 0.65,
      },
      {
        from: "requirement",
        to: "decision",
        type: "influences",
        confidence: 0.6,
      },
      { from: "component", to: "service", type: "uses", confidence: 0.6 },
      { from: "api", to: "service", type: "implements", confidence: 0.7 },
      { from: "issue", to: "blocker", type: "causes", confidence: 0.65 },
    ];

    for (const rule of typeRules) {
      if (entity1.entityType === rule.from && entity2.entityType === rule.to) {
        return {
          from: entity1.name,
          to: entity2.name,
          type: rule.type,
          confidence: rule.confidence,
          reason: `type_inference: ${rule.from} -> ${rule.to}`,
        };
      }

      // Check reverse direction
      if (entity2.entityType === rule.from && entity1.entityType === rule.to) {
        return {
          from: entity2.name,
          to: entity1.name,
          type: rule.type,
          confidence: rule.confidence,
          reason: `type_inference: ${rule.from} -> ${rule.to} (reverse)`,
        };
      }
    }

    return null;
  }

  /**
   * Normal (non-batch) relationship processing for fallback
   */
  private async findPotentialRelationshipsNormal(
    entities: Entity[],
  ): Promise<any[]> {
    const relationships: any[] = [];

    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const entity1 = entities[i];
        const entity2 = entities[j];

        // Basic similarity check
        const similarity = await this.similarityEngine.calculateSimilarity(
          entity1,
          entity2,
        );

        if (similarity > 0.7) {
          relationships.push({
            from: entity1.name,
            to: entity2.name,
            type: "related",
            confidence: similarity,
            reason: `fallback_similarity: ${(similarity * 100).toFixed(1)}%`,
          });
        }
      }
    }

    return relationships;
  }

  /**
   * Update working context flags based on recent access patterns
   */
  private async updateWorkingContextFlags(): Promise<void> {
    logger.debug("Updating working context flags");

    try {
      const recentCutoff = new Date(
        Date.now() - BACKGROUND_CONFIG.recentAccessDays * 24 * 60 * 60 * 1000,
      );
      const branches = await this.memoryManager.listBranches();

      for (const branch of branches) {
        const branchGraph = await this.memoryManager.exportBranch(branch.name);

        for (const entity of branchGraph.entities) {
          const shouldBeWorkingContext = this.shouldBeInWorkingContext(
            entity,
            recentCutoff,
          );

          if (shouldBeWorkingContext && !entity.workingContext) {
            await this.updateEntityWorkingContext(
              entity.name,
              true,
              branch.name,
            );
            logger.debug(`Added ${entity.name} to working context`);
          } else if (!shouldBeWorkingContext && entity.workingContext) {
            await this.updateEntityWorkingContext(
              entity.name,
              false,
              branch.name,
            );
            logger.debug(`Removed ${entity.name} from working context`);
          }
        }
      }

      logger.debug("Working context flags updated");
    } catch (error) {
      logger.error("Error updating working context flags:", error);
    }
  }

  /**
   * Determine if entity should be in working context
   */
  private shouldBeInWorkingContext(
    entity: Entity,
    recentCutoff: Date,
  ): boolean {
    // Always include if explicitly marked as current status or blocker
    if (
      entity.entityType === "current-status" ||
      entity.entityType === "blocker"
    ) {
      return true;
    }

    // Include if accessed recently
    const lastAccessed = entity.lastAccessed
      ? new Date(entity.lastAccessed)
      : new Date(0);
    if (lastAccessed > recentCutoff) {
      return true;
    }

    // Include if has high relevance score
    if (entity.relevanceScore && entity.relevanceScore > 0.8) {
      return true;
    }

    // Include if frequently co-accessed with other working context entities
    const accessHistory = this.accessHistory.get(entity.name);
    if (
      accessHistory &&
      accessHistory.count > 5 &&
      accessHistory.lastAccess > recentCutoff
    ) {
      return true;
    }

    return false;
  }

  /**
   * Clean up outdated working context flags and low relevance scores
   */
  private async cleanupOutdatedContext(): Promise<void> {
    logger.debug("Cleaning up outdated context");

    try {
      const oldCutoff = new Date(
        Date.now() -
          BACKGROUND_CONFIG.workingContextTimeoutDays * 24 * 60 * 60 * 1000,
      );
      const branches = await this.memoryManager.listBranches();

      for (const branch of branches) {
        const branchGraph = await this.memoryManager.exportBranch(branch.name);

        for (const entity of branchGraph.entities) {
          const lastAccessed = entity.lastAccessed
            ? new Date(entity.lastAccessed)
            : new Date(0);

          // Remove from working context if not accessed in 14 days and low relevance
          if (
            entity.workingContext &&
            lastAccessed < oldCutoff &&
            (!entity.relevanceScore || entity.relevanceScore < 0.4)
          ) {
            await this.updateEntityWorkingContext(
              entity.name,
              false,
              branch.name,
            );
            logger.debug(`Cleaned up outdated working context: ${entity.name}`);
          }

          // Reset very low relevance scores to default
          if (entity.relevanceScore && entity.relevanceScore < 0.2) {
            await this.updateEntityRelevanceScore(
              entity.name,
              0.5,
              branch.name,
            );
          }
        }
      }

      logger.debug("Outdated context cleanup completed");
    } catch (error) {
      logger.error("Error during context cleanup:", error);
    }
  }

  /**
   * Suggest relationships between branches based on entity relationships
   */
  private async suggestBranchRelationships(): Promise<void> {
    logger.debug("Analyzing cross-branch relationships");

    // This would analyze cross-branch entity relationships and suggest
    // branch-level relationships like "depends_on", "related_to", etc.
    // Implementation would go here for future enhancement
  }

  // Helper methods for database updates - use public API
  private async updateEntityRelevanceScore(
    entityName: string,
    score: number,
    branchName: string,
  ): Promise<void> {
    try {
      await this.memoryManager.updateEntityRelevanceScore(
        entityName,
        score,
        branchName,
      );
      logger.debug(
        `Updated relevance score for ${entityName} to ${score.toFixed(2)}`,
      );
    } catch (error) {
      logger.warn(`Failed to update relevance score for ${entityName}:`, error);
    }
  }

  private async updateEntityWorkingContext(
    entityName: string,
    isWorking: boolean,
    branchName: string,
  ): Promise<void> {
    try {
      await this.memoryManager.updateEntityWorkingContext(
        entityName,
        isWorking,
        branchName,
      );
      logger.debug(`Updated working context for ${entityName} to ${isWorking}`);
    } catch (error) {
      logger.warn(`Failed to update working context for ${entityName}:`, error);
    }
  }
}
