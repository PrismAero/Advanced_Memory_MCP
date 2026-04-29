#!/usr/bin/env npx ts-node
/**
 * Comprehensive Test Suite for Adaptive Reasoning Server
 *
 * Tests cover:
 * - Entity CRUD operations and edge cases
 * - TensorFlow.js semantic similarity
 * - Search functionality (text and semantic)
 * - Branch management
 * - Performance and throughput
 * - Concurrent operations
 * - Error handling and recovery
 */

// CRITICAL: Apply Node.js v24 compatibility polyfills BEFORE any TensorFlow.js imports
import "../modules/node-compat.js";

import * as fs from "fs";
import * as path from "path";
import { EnhancedMemoryManager } from "../enhanced-memory-manager-modular.js";
import { Entity } from "../memory-types.js";
import { BackgroundProcessor } from "../modules/background-processor.js";
import { AdaptiveModelTrainer } from "../modules/ml/adaptive-model-trainer.js";
import { ProjectEmbeddingEngine } from "../modules/ml/project-embedding-engine.js";
import {
  buildBaselineSeedData,
  getSeedConceptPairs,
  getSeedConceptsByLanguage,
  getSeedDataPointCount,
  getSeedLanguages,
  languageTag,
} from "../modules/ml/seed-knowledge.js";
import { TrainingDataCollector } from "../modules/ml/training-data-collector.js";
import { RelationshipIndexer } from "../modules/relationship-indexer.js";
import { ModernSimilarityEngine } from "../modules/similarity/similarity-engine.js";
import { ProjectAnalysisOperations } from "../modules/sqlite/project-analysis-operations.js";
import { SQLiteConnection } from "../modules/sqlite/sqlite-connection.js";
import { runAuditFixTests as runAuditFixSuite } from "./suites/audit-fix-tests.js";
import {
  runBranchTests as runBranchSuite,
  runRelationTests as runRelationSuite,
  runWorkingContextTests as runWorkingContextSuite,
} from "./suites/branch-relation-tests.js";
import { createTestEntity, runEntityTests as runEntitySuite } from "./suites/entity-tests.js";
import { runMLHandlerTests as runMLHandlerSuite } from "./suites/ml-handler-tests.js";
import {
  runConcurrencyTests as runConcurrencySuite,
  runPerformanceTests as runPerformanceSuite,
} from "./suites/performance-concurrency-tests.js";
import {
  runSearchTests as runSearchSuite,
  runSimilarityTests as runSimilaritySuite,
} from "./suites/similarity-search-tests.js";

// Test configuration
const TEST_CONFIG = {
  testMemoryPath: path.join(process.cwd(), "test-memory-data"),
  testTrainerCachePath: path.join(process.cwd(), "test-memory-data", "trained-models"),
  verbose: true,
  performanceIterations: 100,
  concurrencyLevel: 10,
};

// Set the MEMORY_PATH environment variable for tests
process.env.MEMORY_PATH = TEST_CONFIG.testMemoryPath;

// Test result tracking
interface TestResult {
  name: string;
  category: string;
  passed: boolean;
  duration: number;
  error?: string;
  details?: any;
}

class TestRunner {
  private results: TestResult[] = [];
  memoryManager!: EnhancedMemoryManager;
  similarityEngine!: ModernSimilarityEngine;
  private relationshipIndexer!: RelationshipIndexer;
  private backgroundProcessor!: BackgroundProcessor;
  sqliteConnection!: SQLiteConnection;
  projectAnalysisOps!: ProjectAnalysisOperations;
  projectEmbeddingEngine!: ProjectEmbeddingEngine;
  adaptiveModelTrainer!: AdaptiveModelTrainer;
  private startTime: number = 0;

  async setup(): Promise<void> {
    console.log("\n🔧 Setting up test environment...\n");

    // Clean up any existing test data directory
    if (fs.existsSync(TEST_CONFIG.testMemoryPath)) {
      fs.rmSync(TEST_CONFIG.testMemoryPath, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_CONFIG.testMemoryPath, { recursive: true });

    // Initialize components - similarity engine first, then memory manager with it
    this.similarityEngine = new ModernSimilarityEngine();
    this.memoryManager = new EnhancedMemoryManager(this.similarityEngine);
    this.relationshipIndexer = new RelationshipIndexer(this.memoryManager, this.similarityEngine);

    // Initialize SQLite connection for direct access
    this.sqliteConnection = new SQLiteConnection(TEST_CONFIG.testMemoryPath);
    this.projectAnalysisOps = new ProjectAnalysisOperations(this.sqliteConnection);

    // Initialize ML components. Pin the trainer cache dir to the
    // test data dir so we don't pollute the project's .memory dir
    // and we get deterministic state across runs.
    this.adaptiveModelTrainer = new AdaptiveModelTrainer(
      this.similarityEngine.getModelManager(),
      TEST_CONFIG.testTrainerCachePath,
    );
    this.projectEmbeddingEngine = new ProjectEmbeddingEngine(
      this.similarityEngine.getModelManager(),
      this.adaptiveModelTrainer,
    );

    this.backgroundProcessor = new BackgroundProcessor(
      this.memoryManager,
      this.similarityEngine,
      this.projectAnalysisOps,
      this.adaptiveModelTrainer,
    );

    // Initialize all components in order
    await this.similarityEngine.initialize();
    await this.memoryManager.initialize();
    await this.relationshipIndexer.initialize();
    await this.sqliteConnection.initialize();
    await this.projectAnalysisOps.initialize();
    // The trainer's constructor kicks off async init (loading
    // existing model versions and applying baseline seed). We need
    // to wait for it before any ML test reads training-data state.
    await this.adaptiveModelTrainer.ready();

    console.log("✅ Test environment ready\n");
  }

  async teardown(): Promise<void> {
    console.log("\n🧹 Cleaning up test environment...");

    try {
      this.backgroundProcessor.stop();
      this.relationshipIndexer.shutdown();
      await this.memoryManager.close();
      await this.sqliteConnection.close();
    } catch (error) {
      console.log("Warning during cleanup:", error);
    }

    // Remove test data directory
    if (fs.existsSync(TEST_CONFIG.testMemoryPath)) {
      fs.rmSync(TEST_CONFIG.testMemoryPath, { recursive: true, force: true });
    }

    console.log("✅ Cleanup complete\n");
  }

  async runTest(name: string, category: string, testFn: () => Promise<any>): Promise<TestResult> {
    const start = Date.now();
    let result: TestResult;

    try {
      const details = await testFn();
      result = {
        name,
        category,
        passed: true,
        duration: Date.now() - start,
        details,
      };
      console.log(`  ✅ ${name} (${result.duration}ms)`);
    } catch (error: any) {
      result = {
        name,
        category,
        passed: false,
        duration: Date.now() - start,
        error: error.message || String(error),
      };
      console.log(`  ❌ ${name} (${result.duration}ms)`);
      if (TEST_CONFIG.verbose) {
        console.log(`     Error: ${result.error}`);
      }
    }

    this.results.push(result);
    return result;
  }

  // ============================================
  // ENTITY TESTS
  // ============================================

  async runEntityTests(): Promise<void> {
    await runEntitySuite(this);
  }

  // ============================================
  // SIMILARITY TESTS
  // ============================================

  async runSimilarityTests(): Promise<void> {
    await runSimilaritySuite(this);
  }

  // ============================================
  // SEARCH TESTS
  // ============================================

  async runSearchTests(): Promise<void> {
    await runSearchSuite(this);
  }

  // ============================================
  // BRANCH TESTS
  // ============================================

  async runBranchTests(): Promise<void> {
    await runBranchSuite(this);
  }

  // ============================================
  // RELATION TESTS
  // ============================================

  async runRelationTests(): Promise<void> {
    await runRelationSuite(this);
  }

  // ============================================
  // PERFORMANCE TESTS
  // ============================================

  async runPerformanceTests(): Promise<void> {
    await runPerformanceSuite(this, TEST_CONFIG.performanceIterations);
  }

  // ============================================
  // CONCURRENT TESTS
  // ============================================

  async runConcurrencyTests(): Promise<void> {
    await runConcurrencySuite(this, TEST_CONFIG.concurrencyLevel);
  }

  // ============================================
  // WORKING CONTEXT TESTS
  // ============================================

  async runWorkingContextTests(): Promise<void> {
    await runWorkingContextSuite(this);
  }

  async runAuditFixTests(): Promise<void> {
    await runAuditFixSuite(this, TEST_CONFIG.testMemoryPath);
  }

  // ============================================
  // ML & VECTOR DB TESTS
  // ============================================

  async runMLTests(): Promise<void> {
    console.log("\n🧠 ML & VECTOR DB TESTS\n");

    // ---------- Group A: Baseline Knowledge Seed ----------

    await this.runTest("Baseline seed loaded into trainer", "ML-Baseline", async () => {
      const stats = this.adaptiveModelTrainer.getTrainingStatistics();
      const expected = getSeedDataPointCount();
      // The trainer might also have whatever ambient training points
      // were recorded by other tests/init paths, so allow >=.
      if (stats.total_data_points < expected) {
        throw new Error(
          `Expected at least ${expected} seed points, got ${stats.total_data_points}`,
        );
      }
      if (
        !stats.data_by_source["interface_usage"] ||
        !stats.data_by_source["relationship_discovery"]
      ) {
        throw new Error(
          `Seed source breakdown missing expected types: ${JSON.stringify(stats.data_by_source)}`,
        );
      }
      return {
        totalPoints: stats.total_data_points,
        expectedSeed: expected,
        sources: stats.data_by_source,
      };
    });

    await this.runTest("Baseline seed marker file written", "ML-Baseline", async () => {
      const markerPath = path.join(TEST_CONFIG.testTrainerCachePath, "seed.lock");
      if (!fs.existsSync(markerPath)) {
        throw new Error(`seed.lock missing at ${markerPath}`);
      }
      const content = JSON.parse(fs.readFileSync(markerPath, "utf-8"));
      if (typeof content.data_points !== "number" || content.data_points < 1)
        throw new Error("seed.lock is malformed");
      return { dataPoints: content.data_points };
    });

    await this.runTest("Re-init does not re-apply baseline seed", "ML-Baseline", async () => {
      // Spin up a fresh trainer pointed at the same cache dir; the
      // existing seed.lock should make it skip seeding entirely.
      const replicaTrainer = new AdaptiveModelTrainer(
        this.similarityEngine.getModelManager(),
        TEST_CONFIG.testTrainerCachePath,
      );
      await replicaTrainer.ready();
      const stats = replicaTrainer.getTrainingStatistics();
      // A fresh in-memory trainer that *skips* seeding should have
      // 0 points (it doesn't load points from disk - they're in-mem).
      if (stats.total_data_points !== 0) {
        throw new Error(
          `Expected 0 points on re-init (seed already applied), got ${stats.total_data_points}`,
        );
      }
      replicaTrainer.dispose();
      return { rescannedPoints: stats.total_data_points };
    });

    await this.runTest("DISABLE_BASELINE_SEED env var honored", "ML-Baseline", async () => {
      const prev = process.env.DISABLE_BASELINE_SEED;
      process.env.DISABLE_BASELINE_SEED = "1";
      const isolatedDir = path.join(TEST_CONFIG.testMemoryPath, "no-seed-trainer");
      try {
        const trainer = new AdaptiveModelTrainer(
          this.similarityEngine.getModelManager(),
          isolatedDir,
        );
        await trainer.ready();
        const stats = trainer.getTrainingStatistics();
        if (stats.total_data_points !== 0) {
          throw new Error(`Expected 0 points with seed disabled, got ${stats.total_data_points}`);
        }
        // No seed.lock should be written when seeding is disabled.
        const markerPath = path.join(isolatedDir, "seed.lock");
        if (fs.existsSync(markerPath))
          throw new Error("seed.lock written despite DISABLE_BASELINE_SEED");
        trainer.dispose();
        return { points: stats.total_data_points };
      } finally {
        if (prev === undefined) delete process.env.DISABLE_BASELINE_SEED;
        else process.env.DISABLE_BASELINE_SEED = prev;
      }
    });

    await this.runTest("Seed builder produces well-formed points", "ML-Baseline", async () => {
      const points = buildBaselineSeedData();
      if (points.length !== getSeedDataPointCount())
        throw new Error("Count mismatch with getSeedDataPointCount()");
      for (const p of points) {
        if (!p.id || !p.input_text) throw new Error("Seed point missing id or input_text");
        if (p.confidence < 0.3 || p.confidence > 1)
          throw new Error(`Bad confidence: ${p.confidence}`);
        if (p.source_type !== "interface_usage" && p.source_type !== "relationship_discovery") {
          throw new Error(`Unexpected source_type: ${p.source_type}`);
        }
      }
      return { count: points.length };
    });

    // ---------- Group B: Embedding Properties ----------

    await this.runTest("Generate Project Embedding", "ML", async () => {
      const code = "function calculateTotal(items) { return items.reduce((a, b) => a + b, 0); }";
      const embedding = await this.projectEmbeddingEngine.generateProjectEmbedding(
        code,
        "function_signature",
      );

      if (!embedding) throw new Error("Failed to generate embedding");
      if (!embedding.embedding || embedding.embedding.length === 0)
        throw new Error("Empty embedding vector");

      return {
        vectorLength: embedding.embedding.length,
        confidence: embedding.confidence,
      };
    });

    await this.runTest("Embedding shape and finiteness", "ML-Embeddings", async () => {
      const mm = this.similarityEngine.getModelManager();
      const [vec] = await mm.generateEmbeddings(["test string for embedding shape verification"]);
      if (!vec || vec.length !== 512) throw new Error(`Expected 512-d vector, got ${vec?.length}`);
      let nonZero = 0;
      let normSq = 0;
      for (const v of vec) {
        if (!Number.isFinite(v)) throw new Error("Non-finite value in embedding");
        if (v !== 0) nonZero++;
        normSq += v * v;
      }
      if (normSq === 0) throw new Error("Zero-norm embedding");
      if (nonZero < 256)
        throw new Error(`Suspiciously sparse embedding: only ${nonZero}/512 non-zero`);
      return { dim: vec.length, nonZero, norm: Math.sqrt(normSq) };
    });

    await this.runTest(
      "Embedding determinism (same text -> same vector)",
      "ML-Embeddings",
      async () => {
        const mm = this.similarityEngine.getModelManager();
        const text = "deterministic embedding test for the universal sentence encoder";
        const [a] = await mm.generateEmbeddings([text]);
        const [b] = await mm.generateEmbeddings([text]);
        if (a.length !== b.length) throw new Error("Length mismatch");
        let maxDelta = 0;
        for (let i = 0; i < a.length; i++) {
          const d = Math.abs(a[i] - b[i]);
          if (d > maxDelta) maxDelta = d;
        }
        // USE is deterministic in TF.js; allow tiny float drift.
        if (maxDelta > 1e-5) throw new Error(`Embedding drifted by ${maxDelta}`);
        return { maxDelta };
      },
    );

    await this.runTest("Embedding cache hit on repeated input", "ML-Embeddings", async () => {
      const before = this.projectEmbeddingEngine.getStatistics();
      const text = "cached embedding lookup test";
      await this.projectEmbeddingEngine.generateProjectEmbedding(text, "documentation");
      await this.projectEmbeddingEngine.generateProjectEmbedding(text, "documentation");
      const after = this.projectEmbeddingEngine.getStatistics();
      // The second call should have come from cache - hit rate must
      // not have decreased, and total embeddings generated should
      // have grown by at most 1 (just the first call).
      const newGens = after.total_embeddings_generated - before.total_embeddings_generated;
      if (newGens > 1) throw new Error(`Cache miss on repeat: ${newGens} new embeddings`);
      return {
        newEmbeddings: newGens,
        cacheHitRate: after.cache_hit_rate,
      };
    });

    // ---------- Group C: Cosine / Semantic Properties ----------

    await this.runTest("Cosine self-similarity ~1.0", "ML-Semantic", async () => {
      const e = createTestEntity("SelfSim", "test", ["user authentication and login flow"]);
      const sim = await this.similarityEngine.calculateSimilarity(e, e);
      if (sim < 0.99) throw new Error(`Self-sim too low: ${sim}`);
      return { similarity: sim };
    });

    await this.runTest("Cosine similarity is symmetric", "ML-Semantic", async () => {
      const a = createTestEntity("A", "test", ["REST API endpoint design with pagination"]);
      const b = createTestEntity("B", "test", [
        "GraphQL schema definitions and resolver functions",
      ]);
      const ab = await this.similarityEngine.calculateSimilarity(a, b);
      const ba = await this.similarityEngine.calculateSimilarity(b, a);
      if (Math.abs(ab - ba) > 1e-3) throw new Error(`Asymmetric: ${ab} vs ${ba}`);
      return { ab, ba };
    });

    await this.runTest("Semantic ordering on baseline domains", "ML-Semantic", async () => {
      // Pick three pairs from the seed: each concept's first related
      // term should score higher than a concept from an unrelated
      // domain. We require the related score to beat the unrelated
      // score by a clear margin to ensure the embedding space has
      // sensible structure for the domains we ship a baseline for.
      const pairs = getSeedConceptPairs();
      const findByDomain = (d: string) => pairs.find((p) => p.domain === d)!;
      const auth = findByDomain("auth");
      const infra = findByDomain("infra");
      const ui = findByDomain("ui");

      const sim = async (x: string, y: string) =>
        this.similarityEngine.calculateSimilarity(
          createTestEntity("X", "t", [x]),
          createTestEntity("Y", "t", [y]),
        );

      const authVsRelated = await sim(auth.concept, auth.related[0]);
      const authVsInfra = await sim(auth.concept, infra.related[0]);
      const uiVsRelated = await sim(ui.concept, ui.related[0]);
      const uiVsInfra = await sim(ui.concept, infra.related[0]);

      // Relaxed margins: USE is solid but not perfect. We assert
      // related > unrelated by at least 0.05 absolute.
      const margin1 = authVsRelated - authVsInfra;
      const margin2 = uiVsRelated - uiVsInfra;
      if (margin1 < 0.05 || margin2 < 0.05) {
        throw new Error(
          `Insufficient semantic margin: auth=${margin1.toFixed(3)}, ui=${margin2.toFixed(3)}`,
        );
      }
      return {
        auth_related: authVsRelated,
        auth_infra: authVsInfra,
        ui_related: uiVsRelated,
        ui_infra: uiVsInfra,
        margins: [margin1, margin2],
      };
    });

    await this.runTest("Seed corpus covers C, C++, and Go", "ML-Language", async () => {
      const langs = new Set(getSeedLanguages());
      const required = ["c", "cpp", "go"];
      const missing = required.filter((l) => !langs.has(l as any));
      if (missing.length > 0) {
        throw new Error(`Missing seed coverage for: ${missing.join(", ")}`);
      }

      // Each per-language slice must have a meaningful number of
      // concepts so we are not just fooling ourselves with one
      // token per language.
      const counts: Record<string, number> = {};
      for (const lang of required) {
        counts[lang] = getSeedConceptsByLanguage(lang as any).length;
        if (counts[lang] < 10) {
          throw new Error(`Too few seeds for ${lang}: ${counts[lang]} (need >= 10)`);
        }
      }
      return { languages: Array.from(langs), counts };
    });

    await this.runTest(
      "Language tag prefix routes related concepts within language",
      "ML-Language",
      async () => {
        // For each of C, C++, Go: a concept and its first related
        // term *with the matching language prefix* must be more
        // similar than that same concept paired with an unrelated
        // concept from a *different* language. This is the headline
        // 'do not segfault on the wrong language' assertion.
        const sim = async (x: string, y: string) =>
          this.similarityEngine.calculateSimilarity(
            createTestEntity("X", "t", [x]),
            createTestEntity("Y", "t", [y]),
          );

        const targets: Array<{ self: any; other: any; label: string }> = [
          {
            self: getSeedConceptsByLanguage("cpp")[0],
            other: getSeedConceptsByLanguage("go")[0],
            label: "cpp_vs_go",
          },
          {
            self: getSeedConceptsByLanguage("c")[0],
            other:
              getSeedConceptsByLanguage("typescript")[0] ??
              getSeedConceptPairs().find((s) => s.language === "typescript"),
            label: "c_vs_typescript",
          },
          {
            self: getSeedConceptsByLanguage("go")[0],
            other: getSeedConceptsByLanguage("cpp")[0],
            label: "go_vs_cpp",
          },
        ];

        const results: Record<string, any> = {};
        for (const { self, other, label } of targets) {
          if (!self || !other) {
            throw new Error(`Missing seed for ${label}`);
          }
          const selfTag = languageTag(self.language);
          const otherTag = languageTag(other.language);

          const within = await sim(`${selfTag} ${self.concept}`, `${selfTag} ${self.related[0]}`);
          const across = await sim(`${selfTag} ${self.concept}`, `${otherTag} ${other.concept}`);

          // Cross-language similarity must be strictly lower than
          // same-language similarity. We require at least a 0.03
          // margin -- USE puts a lot of weight on lexical overlap
          // so we cannot demand huge gaps without fine-tuning, but
          // the language tag must move the needle in the right
          // direction.
          const margin = within - across;
          if (margin < 0.03) {
            throw new Error(
              `Language priority too weak for ${label}: within=${within.toFixed(
                3,
              )} across=${across.toFixed(3)} margin=${margin.toFixed(3)}`,
            );
          }
          results[label] = { within, across, margin };
        }

        return results;
      },
    );

    // ---------- Group D: Adaptive Trainer Behavior ----------

    await this.runTest(
      "Enhanced embedding falls back to base when no trained model",
      "ML-Trainer",
      async () => {
        // No training has run yet; activeModel is null. The trainer
        // must transparently return base USE embeddings.
        const mm = this.similarityEngine.getModelManager();
        const text = "fallback embedding sanity check before any training run";
        const [base] = await mm.generateEmbeddings([text]);
        const enhanced = await this.adaptiveModelTrainer.generateEnhancedEmbedding(text);
        if (!enhanced) throw new Error("Enhanced embedding returned null");
        if (enhanced.length !== base.length)
          throw new Error("Length mismatch between base and enhanced");
        let maxDelta = 0;
        for (let i = 0; i < base.length; i++) {
          const d = Math.abs(enhanced[i] - base[i]);
          if (d > maxDelta) maxDelta = d;
        }
        if (maxDelta > 1e-5)
          throw new Error(`Fallback should match base exactly, max delta=${maxDelta}`);
        return { maxDelta };
      },
    );

    await this.runTest("Add training data: low-confidence rejected", "ML-Trainer", async () => {
      const before = this.adaptiveModelTrainer.getTrainingStatistics().total_data_points;
      await this.adaptiveModelTrainer.addTrainingData({
        id: "low-conf-test",
        input_text: "test data",
        context: "test",
        source_type: "user_feedback",
        confidence: 0.1, // below 0.3 cutoff
        timestamp: new Date(),
      });
      const after = this.adaptiveModelTrainer.getTrainingStatistics().total_data_points;
      if (after !== before)
        throw new Error(`Low-confidence point was accepted: before=${before} after=${after}`);
      return { rejected: true, before, after };
    });

    await this.runTest("Add training data: normal point accepted", "ML-Trainer", async () => {
      const before = this.adaptiveModelTrainer.getTrainingStatistics().total_data_points;
      await this.adaptiveModelTrainer.addTrainingData({
        id: "good-conf-test",
        input_text: "real training input",
        context: "test",
        source_type: "user_feedback",
        confidence: 0.8,
        timestamp: new Date(),
      });
      const after = this.adaptiveModelTrainer.getTrainingStatistics().total_data_points;
      if (after !== before + 1)
        throw new Error(`Expected count to grow by 1: before=${before} after=${after}`);
      return { accepted: true, before, after };
    });

    await this.runTest("startTraining rejects insufficient data", "ML-Trainer", async () => {
      // Spin up an empty isolated trainer and try to train it.
      const isolatedDir = path.join(TEST_CONFIG.testMemoryPath, "empty-trainer");
      const prev = process.env.DISABLE_BASELINE_SEED;
      process.env.DISABLE_BASELINE_SEED = "1";
      try {
        const empty = new AdaptiveModelTrainer(
          this.similarityEngine.getModelManager(),
          isolatedDir,
        );
        await empty.ready();
        let threw = false;
        try {
          await empty.startTraining({ epochs: 1 });
        } catch (err: any) {
          threw = true;
          if (!/Insufficient/.test(err.message || ""))
            throw new Error(`Wrong error: ${err.message}`);
        }
        empty.dispose();
        if (!threw) throw new Error("Expected startTraining to throw");
        return { handled: true };
      } finally {
        if (prev === undefined) delete process.env.DISABLE_BASELINE_SEED;
        else process.env.DISABLE_BASELINE_SEED = prev;
      }
    });

    // ---------- Group E: End-to-End Mini Training ----------

    await this.runTest("End-to-end training run on baseline seed", "ML-Training", async () => {
      // Use the live trainer (already seeded). One epoch, small
      // batch, low validation split so we don't starve training.
      const text = "user authentication and login flow"; // matches seed
      const mm = this.similarityEngine.getModelManager();
      const [baseBefore] = await mm.generateEmbeddings([text]);

      const session = await this.adaptiveModelTrainer.startTraining({
        epochs: 1,
        batch_size: 32,
        validation_split: 0.1,
        learning_rate: 0.001,
        early_stopping_patience: 1,
        model_save_frequency: 1,
      });

      if (session.status !== "completed")
        throw new Error(`Training did not complete: ${session.status}`);
      if ((session.epochs_completed || 0) < 1) throw new Error("No epochs completed");

      const stats = this.adaptiveModelTrainer.getTrainingStatistics();
      if (!stats.active_version) throw new Error("No active model version after training");

      // Verify the saved model directory actually exists with files.
      const versionDir = path.join(TEST_CONFIG.testTrainerCachePath, stats.active_version);
      if (!fs.existsSync(path.join(versionDir, "metadata.json")))
        throw new Error(`metadata.json missing in ${versionDir}`);
      if (!fs.existsSync(path.join(versionDir, "model", "model.json")))
        throw new Error(`model.json missing in ${versionDir}`);

      // Enhanced embedding should now go through the trained
      // network and differ from the base USE output.
      const enhanced = await this.adaptiveModelTrainer.generateEnhancedEmbedding(text);
      if (!enhanced) throw new Error("Enhanced embedding null after train");
      let maxDelta = 0;
      for (let i = 0; i < baseBefore.length; i++) {
        const d = Math.abs(enhanced[i] - baseBefore[i]);
        if (d > maxDelta) maxDelta = d;
      }
      if (maxDelta < 1e-4)
        throw new Error(`Enhanced embedding identical to base after training (delta=${maxDelta})`);

      return {
        version: stats.active_version,
        loss: session.current_loss,
        epochs: session.epochs_completed,
        enhancedDelta: maxDelta,
      };
    });

    // ---------- Group F: Training Data Collector ----------

    await this.runTest(
      "Collector emits trainingDataGenerated for search interactions",
      "ML-Collector",
      async () => {
        const collector = new TrainingDataCollector();
        const received: any[] = [];
        collector.on("trainingDataGenerated", (p) => received.push(p));

        await collector.recordSearchResultSelection(
          "user authentication flow",
          [
            createTestEntity("AuthService", "service", ["Handles login and token issuance"]),
            createTestEntity("UnusedThing", "test", ["irrelevant"]),
          ],
          ["AuthService"],
          "semantic",
          "test-session",
          120,
          5,
        );

        if (received.length === 0) throw new Error("No training events emitted");
        const evt = received[0];
        if (evt.source_type !== "search_success")
          throw new Error(`Unexpected source_type: ${evt.source_type}`);
        if (evt.confidence < 0.3) throw new Error(`Low confidence: ${evt.confidence}`);
        return { events: received.length, source: evt.source_type };
      },
    );

    await this.runTest(
      "Collector emits event for confirmed relationship",
      "ML-Collector",
      async () => {
        const collector = new TrainingDataCollector();
        const received: any[] = [];
        collector.on("trainingDataGenerated", (p) => received.push(p));

        await collector.recordSuccessfulEntityRelationship(
          createTestEntity("Controller", "controller", ["handles requests"]),
          createTestEntity("Service", "service", ["business logic"]),
          "uses",
          0.85,
          "test-session",
        );

        if (received.length !== 1) throw new Error(`Expected 1 event, got ${received.length}`);
        if (received[0].source_type !== "relationship_discovery")
          throw new Error(`Unexpected source_type: ${received[0].source_type}`);
        return { events: received.length };
      },
    );

    await this.runTest(
      "Collector statistics reflect recorded interactions",
      "ML-Collector",
      async () => {
        const collector = new TrainingDataCollector();
        await collector.recordSuccessfulEntityRelationship(
          createTestEntity("X", "type1", ["foo"]),
          createTestEntity("Y", "type2", ["bar"]),
          "depends_on",
          0.9,
          "stat-session",
        );
        await collector.recordContextFeedback({
          query: "what is auth",
          retrieved_context: ["AuthService observation"],
          user_rating: 5,
          session_id: "stat-session",
          timestamp: new Date(),
        });
        const stats = collector.getStatistics();
        if (stats.total_interactions < 2)
          throw new Error(`Total interactions ${stats.total_interactions} < 2`);
        if (stats.interactions_by_type.relationship_creation !== 1)
          throw new Error("Relationship count mismatch");
        if (stats.interactions_by_type.context_retrieval !== 1)
          throw new Error("Context retrieval count mismatch");
        return {
          total: stats.total_interactions,
          byType: stats.interactions_by_type,
        };
      },
    );

    // ---------- Existing interface storage / search tests ----------

    await this.runTest("Store Interface with Embedding", "ML", async () => {
      // Create a dummy file record first
      const fileRecord = await this.projectAnalysisOps.storeOrUpdateProjectFile(
        {
          filePath: "/test/math-utils.ts",
          relativePath: "math-utils.ts",
          fileType: {
            extension: ".ts",
            language: "typescript",
            category: "source",
            hasImports: false,
            hasExports: true,
            canDefineInterfaces: true,
          },
          size: 100,
          lastModified: new Date(),
          imports: [],
          exports: [],
          interfaces: [],
          dependencies: [],
          isEntryPoint: false,
          analysisMetadata: {
            lineCount: 10,
            hasTests: true,
            complexity: "low",
            documentation: 0.8,
          },
        },
        1,
      );

      if (!fileRecord || !fileRecord.id) throw new Error("Failed to create file record");

      // Generate embedding for interface
      const interfaceCode = "interface MathOperation { execute(a: number, b: number): number; }";
      const embedding = await this.projectEmbeddingEngine.generateProjectEmbedding(
        interfaceCode,
        "interface_definition",
      );

      if (!embedding) throw new Error("Failed to generate interface embedding");

      // Store interface
      const interfaceRecord = await this.projectAnalysisOps.storeCodeInterface(
        fileRecord.id,
        {
          name: "MathOperation",
          properties: ["execute"],
          extends: [],
          line: 5,
          isExported: true,
        },
        embedding.embedding,
      );

      if (!interfaceRecord) throw new Error("Failed to store interface record");

      return { interfaceId: interfaceRecord.id };
    });

    await this.runTest("Semantic Code Search", "ML", async () => {
      // Search for something semantically similar to "MathOperation"
      const query = "calculate numbers operation";
      const queryEmbedding = await this.projectEmbeddingEngine.generateProjectEmbedding(
        query,
        "business_logic",
      );

      if (!queryEmbedding) throw new Error("Failed to generate query embedding");

      const results = await this.projectAnalysisOps.findSimilarInterfaces(
        queryEmbedding.embedding,
        5,
      );

      // We expect to find the MathOperation interface we just added
      const match = results.find((r) => r.interface.name === "MathOperation");

      if (!match) {
        throw new Error(
          `MathOperation not found in semantic code search results. Top result: ${
            results[0]?.interface.name || "none"
          }`,
        );
      }

      return {
        found: true,
        similarity: match.similarity,
        name: match.interface.name,
      };
    });

    await this.runTest("Stored interface embedding round-trips through SQLite", "ML", async () => {
      // Round-trip test: read the embedding back from the DB and
      // confirm it matches what we stored above. This is the part
      // the old "Vector Store Persistence" stub was supposed to
      // verify. We pull the row directly via the connection.
      const rows = await this.sqliteConnection.runQuery(
        "SELECT id, name, embedding FROM code_interfaces WHERE name = ? AND embedding IS NOT NULL LIMIT 1",
        ["MathOperation"],
      );
      if (!rows || rows.length === 0)
        throw new Error("MathOperation row not found or has no embedding");
      const buf = rows[0].embedding as Buffer;
      if (!buf || buf.length === 0) throw new Error("Empty embedding buffer in DB");
      // Float32 -> 4 bytes per element. USE is 512-d.
      if (buf.length !== 512 * 4)
        throw new Error(`Embedding buffer size ${buf.length} != 2048 (512 floats)`);
      const view = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
      let nonZero = 0;
      for (const v of view) if (v !== 0) nonZero++;
      if (nonZero < 256)
        throw new Error(`Round-tripped embedding too sparse: ${nonZero}/512 non-zero`);
      return { rowId: rows[0].id, dim: view.length, nonZero };
    });
  }

  // ============================================
  // ML HANDLER TESTS
  // ============================================

  async runMLHandlerTests(): Promise<void> {
    await runMLHandlerSuite(this);
  }

  // ============================================
  // REPORT GENERATION
  // ============================================

  generateReport(): void {
    console.log("\n" + "=".repeat(60));
    console.log("📊 TEST REPORT");
    console.log("=".repeat(60));

    const categories = [...new Set(this.results.map((r) => r.category))];

    for (const category of categories) {
      const categoryResults = this.results.filter((r) => r.category === category);
      const passed = categoryResults.filter((r) => r.passed).length;
      const total = categoryResults.length;

      console.log(`\n${category}: ${passed}/${total} passed`);

      for (const result of categoryResults) {
        const status = result.passed ? "✅" : "❌";
        console.log(`  ${status} ${result.name} (${result.duration}ms)`);
        if (!result.passed && result.error) {
          console.log(`     Error: ${result.error}`);
        }
        if (result.details && category === "Performance") {
          console.log(`     Details: ${JSON.stringify(result.details)}`);
        }
      }
    }

    const totalPassed = this.results.filter((r) => r.passed).length;
    const totalTests = this.results.length;
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

    console.log("\n" + "=".repeat(60));
    console.log(`TOTAL: ${totalPassed}/${totalTests} tests passed`);
    console.log(`Total duration: ${totalDuration}ms`);
    console.log("=".repeat(60));

    if (totalPassed < totalTests) {
      console.log("\n⚠️  Some tests failed. Review the errors above.");
      process.exitCode = 1;
    } else {
      console.log("\n🎉 All tests passed!");
    }
  }

  // ============================================
  // MAIN RUNNER
  // ============================================

  async runAllTests(): Promise<void> {
    this.startTime = Date.now();

    console.log("🚀 Starting Comprehensive Test Suite\n");
    console.log("=".repeat(60));

    await this.setup();

    try {
      await this.runEntityTests();
      await this.runMLTests();
      await this.runMLHandlerTests();
      await this.runSimilarityTests();
      await this.runSearchTests();
      await this.runBranchTests();
      await this.runRelationTests();
      await this.runWorkingContextTests();
      await this.runAuditFixTests();
      await this.runPerformanceTests();
      await this.runConcurrencyTests();
    } catch (error) {
      console.error("\n❌ Test suite crashed:", error);
    }

    await this.teardown();

    this.generateReport();

    const totalDuration = Date.now() - this.startTime;
    console.log(`\nTotal test suite duration: ${totalDuration}ms`);
  }
}

// Run tests
const runner = new TestRunner();
runner.runAllTests().catch((error) => {
  console.error("Failed to run tests:", error);
  process.exit(1);
});
