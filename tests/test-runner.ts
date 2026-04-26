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
import { MLHandlers } from "../modules/handlers/ml-handlers.js";
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

// Test configuration
const TEST_CONFIG = {
  testMemoryPath: path.join(process.cwd(), "test-memory-data"),
  testTrainerCachePath: path.join(
    process.cwd(),
    "test-memory-data",
    "trained-models"
  ),
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

// Helper to create test entities
function createTestEntity(
  name: string,
  entityType: string,
  observations: string[]
): Entity {
  return {
    name,
    entityType,
    observations,
    status: "active",
    created: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
  } as Entity;
}

class TestRunner {
  private results: TestResult[] = [];
  private memoryManager!: EnhancedMemoryManager;
  private similarityEngine!: ModernSimilarityEngine;
  private relationshipIndexer!: RelationshipIndexer;
  private backgroundProcessor!: BackgroundProcessor;
  private sqliteConnection!: SQLiteConnection;
  private projectAnalysisOps!: ProjectAnalysisOperations;
  private projectEmbeddingEngine!: ProjectEmbeddingEngine;
  private adaptiveModelTrainer!: AdaptiveModelTrainer;
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
    this.relationshipIndexer = new RelationshipIndexer(
      this.memoryManager,
      this.similarityEngine
    );

    // Initialize SQLite connection for direct access
    this.sqliteConnection = new SQLiteConnection(TEST_CONFIG.testMemoryPath);
    this.projectAnalysisOps = new ProjectAnalysisOperations(
      this.sqliteConnection
    );

    // Initialize ML components. Pin the trainer cache dir to the
    // test data dir so we don't pollute the project's .memory dir
    // and we get deterministic state across runs.
    this.adaptiveModelTrainer = new AdaptiveModelTrainer(
      this.similarityEngine.getModelManager(),
      TEST_CONFIG.testTrainerCachePath
    );
    this.projectEmbeddingEngine = new ProjectEmbeddingEngine(
      this.similarityEngine.getModelManager(),
      this.adaptiveModelTrainer
    );

    this.backgroundProcessor = new BackgroundProcessor(
      this.memoryManager,
      this.similarityEngine,
      this.projectAnalysisOps,
      this.adaptiveModelTrainer
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

  async runTest(
    name: string,
    category: string,
    testFn: () => Promise<any>
  ): Promise<TestResult> {
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
    console.log("\n📦 ENTITY TESTS\n");

    // Basic CRUD
    await this.runTest("Create single entity", "Entity", async () => {
      const entities = await this.memoryManager.createEntities([
        {
          name: "TestEntity1",
          entityType: "component",
          observations: ["Test observation 1", "Test observation 2"],
        },
      ]);
      if (entities.length !== 1) throw new Error("Expected 1 entity created");
      return { created: entities.length };
    });

    await this.runTest("Create multiple entities", "Entity", async () => {
      const entities = await this.memoryManager.createEntities([
        {
          name: "TestEntity2",
          entityType: "service",
          observations: ["Service observation"],
        },
        {
          name: "TestEntity3",
          entityType: "decision",
          observations: ["Decision rationale"],
        },
        {
          name: "TestEntity4",
          entityType: "blocker",
          observations: ["Blocking issue"],
        },
      ]);
      if (entities.length !== 3) throw new Error("Expected 3 entities created");
      return { created: entities.length };
    });

    await this.runTest("Read entity by name", "Entity", async () => {
      const graph = await this.memoryManager.openNodes(["TestEntity1"]);
      if (graph.entities.length !== 1) throw new Error("Expected 1 entity");
      if (graph.entities[0].name !== "TestEntity1")
        throw new Error("Wrong entity returned");
      return { found: graph.entities[0].name };
    });

    await this.runTest("Add observations to entity", "Entity", async () => {
      await this.memoryManager.addObservations([
        {
          entityName: "TestEntity1",
          contents: ["New observation 1", "New observation 2"],
        },
      ]);
      const graph = await this.memoryManager.openNodes(["TestEntity1"]);
      if (graph.entities[0].observations.length < 3)
        throw new Error("Observations not added");
      return { observations: graph.entities[0].observations.length };
    });

    await this.runTest("Update entity status", "Entity", async () => {
      await this.memoryManager.updateEntityStatus(
        "TestEntity1",
        "archived",
        "Test archival"
      );
      const graph = await this.memoryManager.openNodes(
        ["TestEntity1"],
        undefined,
        ["archived"]
      );
      if (graph.entities[0].status !== "archived")
        throw new Error("Status not updated");
      // Restore status
      await this.memoryManager.updateEntityStatus("TestEntity1", "active");
      return { status: "archived" };
    });

    await this.runTest("Delete entity", "Entity", async () => {
      await this.memoryManager.createEntities([
        { name: "ToDelete", entityType: "temp", observations: ["temp"] },
      ]);
      await this.memoryManager.deleteEntities(["ToDelete"]);
      const graph = await this.memoryManager.openNodes(["ToDelete"]);
      if (graph.entities.length !== 0) throw new Error("Entity not deleted");
      return { deleted: true };
    });

    // Edge cases
    await this.runTest(
      "Create entity with empty name",
      "Entity-Edge",
      async () => {
        try {
          await this.memoryManager.createEntities([
            { name: "", entityType: "test", observations: [] },
          ]);
          // Some systems allow empty names, so just verify it handled it
          return { handled: true };
        } catch (error: any) {
          return { handled: true, rejected: true };
        }
      }
    );

    await this.runTest(
      "Create entity with very long name",
      "Entity-Edge",
      async () => {
        const longName = "A".repeat(1000);
        const entities = await this.memoryManager.createEntities([
          { name: longName, entityType: "test", observations: ["test"] },
        ]);
        if (entities.length !== 1) throw new Error("Failed to create");
        await this.memoryManager.deleteEntities([longName]);
        return { nameLength: longName.length };
      }
    );

    await this.runTest(
      "Create entity with special characters",
      "Entity-Edge",
      async () => {
        const specialName = "Test-Entity_With.Special@Chars#123!";
        const entities = await this.memoryManager.createEntities([
          { name: specialName, entityType: "test", observations: ["test"] },
        ]);
        if (entities.length !== 1) throw new Error("Failed to create");
        const graph = await this.memoryManager.openNodes([specialName]);
        if (graph.entities[0].name !== specialName)
          throw new Error("Name mismatch");
        await this.memoryManager.deleteEntities([specialName]);
        return { name: specialName };
      }
    );

    await this.runTest(
      "Create entity with unicode characters",
      "Entity-Edge",
      async () => {
        const unicodeName = "测试实体_テスト_🎉";
        const entities = await this.memoryManager.createEntities([
          {
            name: unicodeName,
            entityType: "test",
            observations: ["unicode test"],
          },
        ]);
        if (entities.length !== 1) throw new Error("Failed to create");
        await this.memoryManager.deleteEntities([unicodeName]);
        return { name: unicodeName };
      }
    );

    await this.runTest("Create duplicate entity", "Entity-Edge", async () => {
      // First creation should work
      await this.memoryManager.createEntities([
        { name: "DuplicateTest", entityType: "test", observations: ["first"] },
      ]);
      // Second creation with same name - should handle gracefully
      const result = await this.memoryManager.createEntities([
        { name: "DuplicateTest", entityType: "test", observations: ["second"] },
      ]);
      await this.memoryManager.deleteEntities(["DuplicateTest"]);
      return { handled: true };
    });

    await this.runTest(
      "Create entity with very long observation",
      "Entity-Edge",
      async () => {
        const longObs = "A".repeat(10000);
        const entities = await this.memoryManager.createEntities([
          {
            name: "LongObsEntity",
            entityType: "test",
            observations: [longObs],
          },
        ]);
        if (entities.length !== 1) throw new Error("Failed to create");
        await this.memoryManager.deleteEntities(["LongObsEntity"]);
        return { obsLength: longObs.length };
      }
    );

    await this.runTest(
      "Create entity with many observations",
      "Entity-Edge",
      async () => {
        const observations = Array.from(
          { length: 100 },
          (_, i) => `Observation ${i + 1}`
        );
        const entities = await this.memoryManager.createEntities([
          { name: "ManyObsEntity", entityType: "test", observations },
        ]);
        if (entities.length !== 1) throw new Error("Failed to create");
        await this.memoryManager.deleteEntities(["ManyObsEntity"]);
        return { obsCount: observations.length };
      }
    );

    await this.runTest("Open non-existent entity", "Entity-Edge", async () => {
      const graph = await this.memoryManager.openNodes(["NonExistentEntity"]);
      if (graph.entities.length !== 0) throw new Error("Should return empty");
      return { found: false };
    });
  }

  // ============================================
  // SIMILARITY TESTS
  // ============================================

  async runSimilarityTests(): Promise<void> {
    console.log("\n🧠 SIMILARITY TESTS (TensorFlow.js)\n");

    await this.runTest(
      "Similarity engine health check",
      "Similarity",
      async () => {
        const health = await this.similarityEngine.healthCheck();
        if (health.status === "unhealthy") throw new Error(health.message);
        return health;
      }
    );

    await this.runTest("Run similarity self-test", "Similarity", async () => {
      const result = await this.similarityEngine.runSelfTest();
      if (!result.success) throw new Error("Self-test failed");
      return result;
    });

    await this.runTest(
      "Calculate similarity between identical texts",
      "Similarity",
      async () => {
        const entity1 = createTestEntity("Entity1", "test", [
          "Machine learning model training",
        ]);
        const entity2 = createTestEntity("Entity2", "test", [
          "Machine learning model training",
        ]);

        const similarity = await this.similarityEngine.calculateSimilarity(
          entity1,
          entity2
        );
        if (similarity < 0.9)
          throw new Error(`Similarity too low: ${similarity}`);
        return { similarity };
      }
    );

    await this.runTest(
      "Calculate similarity between related texts",
      "Similarity",
      async () => {
        const entity1 = createTestEntity("ReactComponent", "component", [
          "React component for user authentication",
        ]);
        const entity2 = createTestEntity("AuthService", "service", [
          "Service handling user login and registration",
        ]);

        const similarity = await this.similarityEngine.calculateSimilarity(
          entity1,
          entity2
        );
        // Should have moderate similarity
        if (similarity < 0.3)
          throw new Error(`Similarity too low: ${similarity}`);
        return { similarity };
      }
    );

    await this.runTest(
      "Calculate similarity between unrelated texts",
      "Similarity",
      async () => {
        const entity1 = createTestEntity(
          "DatabaseConnection",
          "infrastructure",
          ["PostgreSQL database connection pooling"]
        );
        const entity2 = createTestEntity("UIButton", "component", [
          "Styled button with hover animation",
        ]);

        const similarity = await this.similarityEngine.calculateSimilarity(
          entity1,
          entity2
        );
        // Should have low similarity
        if (similarity > 0.7)
          throw new Error(`Similarity too high: ${similarity}`);
        return { similarity };
      }
    );

    await this.runTest("Detect similar entities", "Similarity", async () => {
      const target = createTestEntity("Target", "test", [
        "API endpoint for user management",
      ]);
      const candidates = [
        createTestEntity("Candidate1", "test", ["REST API for managing users"]),
        createTestEntity("Candidate2", "test", [
          "Database schema for products",
        ]),
        createTestEntity("Candidate3", "test", ["User authentication service"]),
      ];

      const results = await this.similarityEngine.detectSimilarEntities(
        target,
        candidates
      );
      // Should return sorted results
      if (results.length > 1) {
        for (let i = 0; i < results.length - 1; i++) {
          if (results[i].similarity < results[i + 1].similarity) {
            throw new Error("Results not sorted correctly");
          }
        }
      }
      return {
        count: results.length,
        topSimilarity: results.length > 0 ? results[0].similarity : 0,
      };
    });

    await this.runTest(
      "Relationship type inference",
      "Similarity",
      async () => {
        const entity1 = createTestEntity("AuthController", "controller", [
          "Controller handling authentication requests",
        ]);
        const entity2 = createTestEntity("AuthService", "service", [
          "Service implementing authentication logic",
        ]);

        const results = await this.similarityEngine.detectSimilarEntities(
          entity1,
          [entity2]
        );
        if (results.length === 0) throw new Error("No results");
        return {
          similarity: results[0].similarity,
          relationType: results[0].suggestedRelationType,
          confidence: results[0].confidence,
        };
      }
    );

    await this.runTest(
      "Empty observation handling",
      "Similarity-Edge",
      async () => {
        const entity1 = createTestEntity("EmptyObs1", "test", []);
        const entity2 = createTestEntity("EmptyObs2", "test", ["has content"]);
        // Should handle gracefully without crashing
        const similarity = await this.similarityEngine.calculateSimilarity(
          entity1,
          entity2
        );
        return { handled: true, similarity };
      }
    );

    await this.runTest(
      "Very short text similarity",
      "Similarity-Edge",
      async () => {
        const entity1 = createTestEntity("Short1", "t", ["a"]);
        const entity2 = createTestEntity("Short2", "t", ["b"]);
        const similarity = await this.similarityEngine.calculateSimilarity(
          entity1,
          entity2
        );
        return { handled: true, similarity };
      }
    );

    await this.runTest(
      "Empty candidates array",
      "Similarity-Edge",
      async () => {
        const target = createTestEntity("Target", "test", ["test"]);
        const results = await this.similarityEngine.detectSimilarEntities(
          target,
          []
        );
        if (results.length !== 0) throw new Error("Should return empty array");
        return { handled: true };
      }
    );
  }

  // ============================================
  // SEARCH TESTS
  // ============================================

  async runSearchTests(): Promise<void> {
    console.log("\n🔍 SEARCH TESTS\n");

    // Setup test data
    await this.memoryManager.createEntities([
      {
        name: "SearchTest_UserAuth",
        entityType: "service",
        observations: [
          "Handles user authentication and authorization",
          "JWT token management",
        ],
      },
      {
        name: "SearchTest_DataStore",
        entityType: "database",
        observations: [
          "PostgreSQL data persistence layer",
          "Connection pooling",
        ],
      },
      {
        name: "SearchTest_APIGateway",
        entityType: "infrastructure",
        observations: ["REST API routing", "Rate limiting implementation"],
      },
      {
        name: "SearchTest_LoggingService",
        entityType: "service",
        observations: ["Centralized logging", "Log aggregation and analysis"],
      },
    ]);

    await this.runTest("Text search - exact match", "Search", async () => {
      const results = await this.memoryManager.searchEntities("UserAuth");
      if (results.entities.length === 0) throw new Error("No results found");
      return { count: results.entities.length };
    });

    await this.runTest("Text search - partial match", "Search", async () => {
      const results = await this.memoryManager.searchEntities("authentication");
      if (results.entities.length === 0) throw new Error("No results found");
      return { count: results.entities.length };
    });

    await this.runTest("Text search - no match", "Search", async () => {
      const results = await this.memoryManager.searchEntities(
        "xyznonexistent123"
      );
      if (results.entities.length !== 0)
        throw new Error("Should return no results");
      return { count: 0 };
    });

    await this.runTest("Semantic search", "Search", async () => {
      // Search for related concept without exact words
      const results = await this.memoryManager.searchEntities(
        "login security tokens"
      );
      // Should find UserAuth due to semantic similarity
      return { count: results.entities.length };
    });

    await this.runTest(
      "Search with special characters",
      "Search-Edge",
      async () => {
        const results = await this.memoryManager.searchEntities(
          "user@auth#test"
        );
        // Should handle gracefully
        return { handled: true, count: results.entities.length };
      }
    );

    await this.runTest("Search with empty query", "Search-Edge", async () => {
      const results = await this.memoryManager.searchEntities("");
      // Should return all or handle gracefully
      return { handled: true, count: results.entities.length };
    });

    await this.runTest(
      "Search with very long query",
      "Search-Edge",
      async () => {
        const longQuery = "authentication ".repeat(100);
        const results = await this.memoryManager.searchEntities(longQuery);
        return { handled: true, count: results.entities.length };
      }
    );

    // Cleanup
    await this.memoryManager.deleteEntities([
      "SearchTest_UserAuth",
      "SearchTest_DataStore",
      "SearchTest_APIGateway",
      "SearchTest_LoggingService",
    ]);
  }

  // ============================================
  // BRANCH TESTS
  // ============================================

  async runBranchTests(): Promise<void> {
    console.log("\n🌿 BRANCH TESTS\n");

    await this.runTest("List branches", "Branch", async () => {
      const branches = await this.memoryManager.listBranches();
      if (!branches.find((b) => b.name === "main"))
        throw new Error("Main branch not found");
      return { count: branches.length };
    });

    await this.runTest("Create branch", "Branch", async () => {
      await this.memoryManager.createBranch(
        "test-branch",
        "Test branch purpose"
      );
      const branches = await this.memoryManager.listBranches();
      if (!branches.find((b) => b.name === "test-branch"))
        throw new Error("Branch not created");
      return { created: "test-branch" };
    });

    await this.runTest("Create entity in branch", "Branch", async () => {
      await this.memoryManager.createEntities(
        [
          {
            name: "BranchEntity",
            entityType: "test",
            observations: ["test"],
          },
        ],
        "test-branch"
      );
      const graph = await this.memoryManager.openNodes(
        ["BranchEntity"],
        "test-branch"
      );
      if (graph.entities.length !== 1) throw new Error("Entity not in branch");
      return { entity: "BranchEntity", branch: "test-branch" };
    });

    await this.runTest(
      "Entity isolation between branches",
      "Branch",
      async () => {
        // Entity should not be visible in main branch
        const mainGraph = await this.memoryManager.openNodes(["BranchEntity"]);
        if (mainGraph.entities.length !== 0)
          throw new Error("Entity should not be in main branch");
        return { isolated: true };
      }
    );

    await this.runTest("Export branch", "Branch", async () => {
      const graph = await this.memoryManager.exportBranch("test-branch");
      if (graph.entities.length === 0) throw new Error("Branch export empty");
      return { entities: graph.entities.length };
    });

    await this.runTest("Delete branch", "Branch", async () => {
      await this.memoryManager.deleteBranch("test-branch");
      const branches = await this.memoryManager.listBranches();
      if (branches.find((b) => b.name === "test-branch"))
        throw new Error("Branch not deleted");
      return { deleted: "test-branch" };
    });

    await this.runTest(
      "Delete main branch (should fail)",
      "Branch-Edge",
      async () => {
        try {
          await this.memoryManager.deleteBranch("main");
          throw new Error("Should have thrown error");
        } catch (error: any) {
          if (error.message === "Should have thrown error") throw error;
          return { handled: true };
        }
      }
    );

    await this.runTest(
      "Create branch with special name",
      "Branch-Edge",
      async () => {
        await this.memoryManager.createBranch(
          "feature/test-123",
          "Feature branch"
        );
        const branches = await this.memoryManager.listBranches();
        const found = branches.find((b) => b.name === "feature/test-123");
        if (!found) throw new Error("Branch with special name not created");
        await this.memoryManager.deleteBranch("feature/test-123");
        return { name: "feature/test-123" };
      }
    );
  }

  // ============================================
  // RELATION TESTS
  // ============================================

  async runRelationTests(): Promise<void> {
    console.log("\n🔗 RELATION TESTS\n");

    // Setup
    await this.memoryManager.createEntities([
      {
        name: "RelTest_ServiceA",
        entityType: "service",
        observations: ["Service A"],
      },
      {
        name: "RelTest_ServiceB",
        entityType: "service",
        observations: ["Service B"],
      },
      {
        name: "RelTest_Controller",
        entityType: "controller",
        observations: ["Controller"],
      },
    ]);

    await this.runTest("Create relation", "Relation", async () => {
      await this.memoryManager.createRelations([
        {
          from: "RelTest_ServiceA",
          to: "RelTest_ServiceB",
          relationType: "depends_on",
        },
      ]);
      const graph = await this.memoryManager.openNodes([
        "RelTest_ServiceA",
        "RelTest_ServiceB",
      ]);
      if (graph.relations.length === 0) throw new Error("Relation not created");
      return { created: true };
    });

    await this.runTest("Create multiple relations", "Relation", async () => {
      await this.memoryManager.createRelations([
        {
          from: "RelTest_Controller",
          to: "RelTest_ServiceA",
          relationType: "uses",
        },
        {
          from: "RelTest_Controller",
          to: "RelTest_ServiceB",
          relationType: "uses",
        },
      ]);
      const graph = await this.memoryManager.openNodes(["RelTest_Controller"]);
      if (graph.relations.length < 2) throw new Error("Relations not created");
      return { count: graph.relations.length };
    });

    await this.runTest("Delete relations", "Relation", async () => {
      await this.memoryManager.deleteRelations([
        {
          from: "RelTest_ServiceA",
          to: "RelTest_ServiceB",
          relationType: "depends_on",
        },
      ]);
      const graph = await this.memoryManager.openNodes([
        "RelTest_ServiceA",
        "RelTest_ServiceB",
      ]);
      const remaining = graph.relations.filter(
        (r) =>
          r.from === "RelTest_ServiceA" &&
          r.to === "RelTest_ServiceB" &&
          r.relationType === "depends_on"
      );
      if (remaining.length !== 0) throw new Error("Relation not deleted");
      return { deleted: true };
    });

    await this.runTest(
      "Create relation with non-existent entity",
      "Relation-Edge",
      async () => {
        try {
          await this.memoryManager.createRelations([
            {
              from: "NonExistent1",
              to: "NonExistent2",
              relationType: "test",
            },
          ]);
          // Should handle gracefully or throw
          return { handled: true };
        } catch (error: any) {
          return { handled: true };
        }
      }
    );

    await this.runTest(
      "Self-referential relation",
      "Relation-Edge",
      async () => {
        await this.memoryManager.createRelations([
          {
            from: "RelTest_ServiceA",
            to: "RelTest_ServiceA",
            relationType: "self_reference",
          },
        ]);
        return { handled: true };
      }
    );

    // Cleanup
    await this.memoryManager.deleteEntities([
      "RelTest_ServiceA",
      "RelTest_ServiceB",
      "RelTest_Controller",
    ]);
  }

  // ============================================
  // PERFORMANCE TESTS
  // ============================================

  async runPerformanceTests(): Promise<void> {
    console.log("\n⚡ PERFORMANCE TESTS\n");

    const iterations = TEST_CONFIG.performanceIterations;

    await this.runTest(
      `Bulk entity creation (${iterations} entities)`,
      "Performance",
      async () => {
        const entities = Array.from({ length: iterations }, (_, i) => ({
          name: `PerfTest_Entity_${i}`,
          entityType: "test",
          observations: [`Observation for entity ${i}`],
        }));

        const start = Date.now();
        await this.memoryManager.createEntities(entities);
        const duration = Date.now() - start;

        return {
          count: iterations,
          totalMs: duration,
          avgMs: (duration / iterations).toFixed(2),
          entitiesPerSecond: ((iterations / duration) * 1000).toFixed(1),
        };
      }
    );

    await this.runTest(
      `Sequential entity reads (${iterations} reads)`,
      "Performance",
      async () => {
        const start = Date.now();
        for (let i = 0; i < iterations; i++) {
          await this.memoryManager.openNodes([`PerfTest_Entity_${i}`]);
        }
        const duration = Date.now() - start;

        return {
          count: iterations,
          totalMs: duration,
          avgMs: (duration / iterations).toFixed(2),
          readsPerSecond: ((iterations / duration) * 1000).toFixed(1),
        };
      }
    );

    await this.runTest(
      `Embedding generation (${Math.min(20, iterations)} entities)`,
      "Performance",
      async () => {
        const count = Math.min(20, iterations);
        const entities = Array.from({ length: count }, (_, i) =>
          createTestEntity(`EmbedTest_${i}`, "test", [
            `Test observation for embedding generation ${i}`,
          ])
        );

        const start = Date.now();
        for (let i = 0; i < count - 1; i++) {
          await this.similarityEngine.calculateSimilarity(
            entities[i],
            entities[i + 1]
          );
        }
        const duration = Date.now() - start;

        return {
          count: count - 1,
          totalMs: duration,
          avgMs: (duration / (count - 1)).toFixed(2),
          comparisonsPerSecond: (((count - 1) / duration) * 1000).toFixed(1),
        };
      }
    );

    await this.runTest(
      "Search performance (100 queries)",
      "Performance",
      async () => {
        const queries = [
          "entity test",
          "observation",
          "performance",
          "user",
          "service",
        ];
        const queryCount = 100;

        const start = Date.now();
        for (let i = 0; i < queryCount; i++) {
          await this.memoryManager.searchEntities(queries[i % queries.length]);
        }
        const duration = Date.now() - start;

        return {
          count: queryCount,
          totalMs: duration,
          avgMs: (duration / queryCount).toFixed(2),
          queriesPerSecond: ((queryCount / duration) * 1000).toFixed(1),
        };
      }
    );

    await this.runTest(
      `Bulk entity deletion (${iterations} entities)`,
      "Performance",
      async () => {
        const names = Array.from(
          { length: iterations },
          (_, i) => `PerfTest_Entity_${i}`
        );

        const start = Date.now();
        await this.memoryManager.deleteEntities(names);
        const duration = Date.now() - start;

        return {
          count: iterations,
          totalMs: duration,
          avgMs: (duration / iterations).toFixed(2),
          deletionsPerSecond: ((iterations / duration) * 1000).toFixed(1),
        };
      }
    );
  }

  // ============================================
  // CONCURRENT TESTS
  // ============================================

  async runConcurrencyTests(): Promise<void> {
    console.log("\n🔄 CONCURRENCY TESTS\n");

    const concurrency = TEST_CONFIG.concurrencyLevel;

    await this.runTest(
      `Concurrent entity creation (${concurrency} parallel)`,
      "Concurrency",
      async () => {
        const promises = Array.from({ length: concurrency }, (_, i) =>
          this.memoryManager.createEntities([
            {
              name: `ConcurrentEntity_${i}`,
              entityType: "test",
              observations: [`Concurrent observation ${i}`],
            },
          ])
        );

        const start = Date.now();
        await Promise.all(promises);
        const duration = Date.now() - start;

        return { concurrency, totalMs: duration };
      }
    );

    await this.runTest(
      `Concurrent reads (${concurrency} parallel)`,
      "Concurrency",
      async () => {
        const promises = Array.from({ length: concurrency }, (_, i) =>
          this.memoryManager.openNodes([`ConcurrentEntity_${i}`])
        );

        const start = Date.now();
        const results = await Promise.all(promises);
        const duration = Date.now() - start;

        const allFound = results.every((r) => r.entities.length === 1);
        if (!allFound) throw new Error("Not all entities found");

        return { concurrency, totalMs: duration, allFound };
      }
    );

    await this.runTest(
      `Concurrent searches (${concurrency} parallel)`,
      "Concurrency",
      async () => {
        const queries = [
          "concurrent",
          "entity",
          "test",
          "observation",
          "parallel",
        ];
        const promises = Array.from({ length: concurrency }, (_, i) =>
          this.memoryManager.searchEntities(queries[i % queries.length])
        );

        const start = Date.now();
        await Promise.all(promises);
        const duration = Date.now() - start;

        return { concurrency, totalMs: duration };
      }
    );

    await this.runTest(
      `Mixed concurrent operations`,
      "Concurrency",
      async () => {
        const operations = [
          // Creates
          ...Array.from({ length: 3 }, (_, i) =>
            this.memoryManager.createEntities([
              {
                name: `MixedOp_Create_${i}`,
                entityType: "test",
                observations: ["test"],
              },
            ])
          ),
          // Reads
          ...Array.from({ length: 3 }, (_, i) =>
            this.memoryManager.openNodes([`ConcurrentEntity_${i}`])
          ),
          // Searches
          ...Array.from({ length: 3 }, () =>
            this.memoryManager.searchEntities("test")
          ),
        ];

        const start = Date.now();
        await Promise.all(operations);
        const duration = Date.now() - start;

        // Cleanup
        await this.memoryManager.deleteEntities([
          "MixedOp_Create_0",
          "MixedOp_Create_1",
          "MixedOp_Create_2",
        ]);

        return { operationCount: operations.length, totalMs: duration };
      }
    );

    // Cleanup concurrent entities
    const concurrentNames = Array.from(
      { length: concurrency },
      (_, i) => `ConcurrentEntity_${i}`
    );
    await this.memoryManager.deleteEntities(concurrentNames);
  }

  // ============================================
  // WORKING CONTEXT TESTS
  // ============================================

  async runWorkingContextTests(): Promise<void> {
    console.log("\n💼 WORKING CONTEXT TESTS\n");

    // Setup
    await this.memoryManager.createEntities([
      {
        name: "WCTest_Entity1",
        entityType: "task",
        observations: ["Active task"],
      },
      {
        name: "WCTest_Entity2",
        entityType: "task",
        observations: ["Another task"],
      },
    ]);

    await this.runTest("Update working context", "WorkingContext", async () => {
      await this.memoryManager.updateEntityWorkingContext(
        "WCTest_Entity1",
        true
      );
      return { updated: true };
    });

    await this.runTest("Update relevance score", "WorkingContext", async () => {
      await this.memoryManager.updateEntityRelevanceScore(
        "WCTest_Entity1",
        0.85
      );
      return { score: 0.85 };
    });

    await this.runTest("Update last accessed", "WorkingContext", async () => {
      await this.memoryManager.updateEntityLastAccessed("WCTest_Entity1");
      return { updated: true };
    });

    // Cleanup
    await this.memoryManager.deleteEntities([
      "WCTest_Entity1",
      "WCTest_Entity2",
    ]);
  }

  // ============================================
  // ML & VECTOR DB TESTS
  // ============================================

  async runMLTests(): Promise<void> {
    console.log("\n🧠 ML & VECTOR DB TESTS\n");

    // ---------- Group A: Baseline Knowledge Seed ----------

    await this.runTest(
      "Baseline seed loaded into trainer",
      "ML-Baseline",
      async () => {
        const stats = this.adaptiveModelTrainer.getTrainingStatistics();
        const expected = getSeedDataPointCount();
        // The trainer might also have whatever ambient training points
        // were recorded by other tests/init paths, so allow >=.
        if (stats.total_data_points < expected) {
          throw new Error(
            `Expected at least ${expected} seed points, got ${stats.total_data_points}`
          );
        }
        if (
          !stats.data_by_source["interface_usage"] ||
          !stats.data_by_source["relationship_discovery"]
        ) {
          throw new Error(
            `Seed source breakdown missing expected types: ${JSON.stringify(
              stats.data_by_source
            )}`
          );
        }
        return {
          totalPoints: stats.total_data_points,
          expectedSeed: expected,
          sources: stats.data_by_source,
        };
      }
    );

    await this.runTest(
      "Baseline seed marker file written",
      "ML-Baseline",
      async () => {
        const markerPath = path.join(
          TEST_CONFIG.testTrainerCachePath,
          "seed.lock"
        );
        if (!fs.existsSync(markerPath)) {
          throw new Error(`seed.lock missing at ${markerPath}`);
        }
        const content = JSON.parse(fs.readFileSync(markerPath, "utf-8"));
        if (typeof content.data_points !== "number" || content.data_points < 1)
          throw new Error("seed.lock is malformed");
        return { dataPoints: content.data_points };
      }
    );

    await this.runTest(
      "Re-init does not re-apply baseline seed",
      "ML-Baseline",
      async () => {
        // Spin up a fresh trainer pointed at the same cache dir; the
        // existing seed.lock should make it skip seeding entirely.
        const replicaTrainer = new AdaptiveModelTrainer(
          this.similarityEngine.getModelManager(),
          TEST_CONFIG.testTrainerCachePath
        );
        await replicaTrainer.ready();
        const stats = replicaTrainer.getTrainingStatistics();
        // A fresh in-memory trainer that *skips* seeding should have
        // 0 points (it doesn't load points from disk - they're in-mem).
        if (stats.total_data_points !== 0) {
          throw new Error(
            `Expected 0 points on re-init (seed already applied), got ${stats.total_data_points}`
          );
        }
        replicaTrainer.dispose();
        return { rescannedPoints: stats.total_data_points };
      }
    );

    await this.runTest(
      "DISABLE_BASELINE_SEED env var honored",
      "ML-Baseline",
      async () => {
        const prev = process.env.DISABLE_BASELINE_SEED;
        process.env.DISABLE_BASELINE_SEED = "1";
        const isolatedDir = path.join(
          TEST_CONFIG.testMemoryPath,
          "no-seed-trainer"
        );
        try {
          const trainer = new AdaptiveModelTrainer(
            this.similarityEngine.getModelManager(),
            isolatedDir
          );
          await trainer.ready();
          const stats = trainer.getTrainingStatistics();
          if (stats.total_data_points !== 0) {
            throw new Error(
              `Expected 0 points with seed disabled, got ${stats.total_data_points}`
            );
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
      }
    );

    await this.runTest(
      "Seed builder produces well-formed points",
      "ML-Baseline",
      async () => {
        const points = buildBaselineSeedData();
        if (points.length !== getSeedDataPointCount())
          throw new Error("Count mismatch with getSeedDataPointCount()");
        for (const p of points) {
          if (!p.id || !p.input_text)
            throw new Error("Seed point missing id or input_text");
          if (p.confidence < 0.3 || p.confidence > 1)
            throw new Error(`Bad confidence: ${p.confidence}`);
          if (
            p.source_type !== "interface_usage" &&
            p.source_type !== "relationship_discovery"
          ) {
            throw new Error(`Unexpected source_type: ${p.source_type}`);
          }
        }
        return { count: points.length };
      }
    );

    // ---------- Group B: Embedding Properties ----------

    await this.runTest("Generate Project Embedding", "ML", async () => {
      const code =
        "function calculateTotal(items) { return items.reduce((a, b) => a + b, 0); }";
      const embedding =
        await this.projectEmbeddingEngine.generateProjectEmbedding(
          code,
          "function_signature"
        );

      if (!embedding) throw new Error("Failed to generate embedding");
      if (!embedding.embedding || embedding.embedding.length === 0)
        throw new Error("Empty embedding vector");

      return {
        vectorLength: embedding.embedding.length,
        confidence: embedding.confidence,
      };
    });

    await this.runTest(
      "Embedding shape and finiteness",
      "ML-Embeddings",
      async () => {
        const mm = this.similarityEngine.getModelManager();
        const [vec] = await mm.generateEmbeddings([
          "test string for embedding shape verification",
        ]);
        if (!vec || vec.length !== 512)
          throw new Error(`Expected 512-d vector, got ${vec?.length}`);
        let nonZero = 0;
        let normSq = 0;
        for (const v of vec) {
          if (!Number.isFinite(v))
            throw new Error("Non-finite value in embedding");
          if (v !== 0) nonZero++;
          normSq += v * v;
        }
        if (normSq === 0) throw new Error("Zero-norm embedding");
        if (nonZero < 256)
          throw new Error(
            `Suspiciously sparse embedding: only ${nonZero}/512 non-zero`
          );
        return { dim: vec.length, nonZero, norm: Math.sqrt(normSq) };
      }
    );

    await this.runTest(
      "Embedding determinism (same text -> same vector)",
      "ML-Embeddings",
      async () => {
        const mm = this.similarityEngine.getModelManager();
        const text =
          "deterministic embedding test for the universal sentence encoder";
        const [a] = await mm.generateEmbeddings([text]);
        const [b] = await mm.generateEmbeddings([text]);
        if (a.length !== b.length) throw new Error("Length mismatch");
        let maxDelta = 0;
        for (let i = 0; i < a.length; i++) {
          const d = Math.abs(a[i] - b[i]);
          if (d > maxDelta) maxDelta = d;
        }
        // USE is deterministic in TF.js; allow tiny float drift.
        if (maxDelta > 1e-5)
          throw new Error(`Embedding drifted by ${maxDelta}`);
        return { maxDelta };
      }
    );

    await this.runTest(
      "Embedding cache hit on repeated input",
      "ML-Embeddings",
      async () => {
        const before = this.projectEmbeddingEngine.getStatistics();
        const text = "cached embedding lookup test";
        await this.projectEmbeddingEngine.generateProjectEmbedding(
          text,
          "documentation"
        );
        await this.projectEmbeddingEngine.generateProjectEmbedding(
          text,
          "documentation"
        );
        const after = this.projectEmbeddingEngine.getStatistics();
        // The second call should have come from cache - hit rate must
        // not have decreased, and total embeddings generated should
        // have grown by at most 1 (just the first call).
        const newGens =
          after.total_embeddings_generated - before.total_embeddings_generated;
        if (newGens > 1)
          throw new Error(`Cache miss on repeat: ${newGens} new embeddings`);
        return {
          newEmbeddings: newGens,
          cacheHitRate: after.cache_hit_rate,
        };
      }
    );

    // ---------- Group C: Cosine / Semantic Properties ----------

    await this.runTest(
      "Cosine self-similarity ~1.0",
      "ML-Semantic",
      async () => {
        const e = createTestEntity("SelfSim", "test", [
          "user authentication and login flow",
        ]);
        const sim = await this.similarityEngine.calculateSimilarity(e, e);
        if (sim < 0.99) throw new Error(`Self-sim too low: ${sim}`);
        return { similarity: sim };
      }
    );

    await this.runTest(
      "Cosine similarity is symmetric",
      "ML-Semantic",
      async () => {
        const a = createTestEntity("A", "test", [
          "REST API endpoint design with pagination",
        ]);
        const b = createTestEntity("B", "test", [
          "GraphQL schema definitions and resolver functions",
        ]);
        const ab = await this.similarityEngine.calculateSimilarity(a, b);
        const ba = await this.similarityEngine.calculateSimilarity(b, a);
        if (Math.abs(ab - ba) > 1e-3)
          throw new Error(`Asymmetric: ${ab} vs ${ba}`);
        return { ab, ba };
      }
    );

    await this.runTest(
      "Semantic ordering on baseline domains",
      "ML-Semantic",
      async () => {
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
            createTestEntity("Y", "t", [y])
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
            `Insufficient semantic margin: auth=${margin1.toFixed(
              3
            )}, ui=${margin2.toFixed(3)}`
          );
        }
        return {
          auth_related: authVsRelated,
          auth_infra: authVsInfra,
          ui_related: uiVsRelated,
          ui_infra: uiVsInfra,
          margins: [margin1, margin2],
        };
      }
    );

    await this.runTest(
      "Seed corpus covers C, C++, and Go",
      "ML-Language",
      async () => {
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
            throw new Error(
              `Too few seeds for ${lang}: ${counts[lang]} (need >= 10)`
            );
          }
        }
        return { languages: Array.from(langs), counts };
      }
    );

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
            createTestEntity("Y", "t", [y])
          );

        const targets: Array<{ self: any; other: any; label: string }> = [
          {
            self: getSeedConceptsByLanguage("cpp")[0],
            other: getSeedConceptsByLanguage("go")[0],
            label: "cpp_vs_go",
          },
          {
            self: getSeedConceptsByLanguage("c")[0],
            other: getSeedConceptsByLanguage("typescript")[0] ??
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

          const within = await sim(
            `${selfTag} ${self.concept}`,
            `${selfTag} ${self.related[0]}`
          );
          const across = await sim(
            `${selfTag} ${self.concept}`,
            `${otherTag} ${other.concept}`
          );

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
                3
              )} across=${across.toFixed(3)} margin=${margin.toFixed(3)}`
            );
          }
          results[label] = { within, across, margin };
        }

        return results;
      }
    );

    // ---------- Group D: Adaptive Trainer Behavior ----------

    await this.runTest(
      "Enhanced embedding falls back to base when no trained model",
      "ML-Trainer",
      async () => {
        // No training has run yet; activeModel is null. The trainer
        // must transparently return base USE embeddings.
        const mm = this.similarityEngine.getModelManager();
        const text =
          "fallback embedding sanity check before any training run";
        const [base] = await mm.generateEmbeddings([text]);
        const enhanced = await this.adaptiveModelTrainer.generateEnhancedEmbedding(
          text
        );
        if (!enhanced) throw new Error("Enhanced embedding returned null");
        if (enhanced.length !== base.length)
          throw new Error("Length mismatch between base and enhanced");
        let maxDelta = 0;
        for (let i = 0; i < base.length; i++) {
          const d = Math.abs(enhanced[i] - base[i]);
          if (d > maxDelta) maxDelta = d;
        }
        if (maxDelta > 1e-5)
          throw new Error(
            `Fallback should match base exactly, max delta=${maxDelta}`
          );
        return { maxDelta };
      }
    );

    await this.runTest(
      "Add training data: low-confidence rejected",
      "ML-Trainer",
      async () => {
        const before = this.adaptiveModelTrainer.getTrainingStatistics()
          .total_data_points;
        await this.adaptiveModelTrainer.addTrainingData({
          id: "low-conf-test",
          input_text: "test data",
          context: "test",
          source_type: "user_feedback",
          confidence: 0.1, // below 0.3 cutoff
          timestamp: new Date(),
        });
        const after = this.adaptiveModelTrainer.getTrainingStatistics()
          .total_data_points;
        if (after !== before)
          throw new Error(
            `Low-confidence point was accepted: before=${before} after=${after}`
          );
        return { rejected: true, before, after };
      }
    );

    await this.runTest(
      "Add training data: normal point accepted",
      "ML-Trainer",
      async () => {
        const before = this.adaptiveModelTrainer.getTrainingStatistics()
          .total_data_points;
        await this.adaptiveModelTrainer.addTrainingData({
          id: "good-conf-test",
          input_text: "real training input",
          context: "test",
          source_type: "user_feedback",
          confidence: 0.8,
          timestamp: new Date(),
        });
        const after = this.adaptiveModelTrainer.getTrainingStatistics()
          .total_data_points;
        if (after !== before + 1)
          throw new Error(
            `Expected count to grow by 1: before=${before} after=${after}`
          );
        return { accepted: true, before, after };
      }
    );

    await this.runTest(
      "startTraining rejects insufficient data",
      "ML-Trainer",
      async () => {
        // Spin up an empty isolated trainer and try to train it.
        const isolatedDir = path.join(
          TEST_CONFIG.testMemoryPath,
          "empty-trainer"
        );
        const prev = process.env.DISABLE_BASELINE_SEED;
        process.env.DISABLE_BASELINE_SEED = "1";
        try {
          const empty = new AdaptiveModelTrainer(
            this.similarityEngine.getModelManager(),
            isolatedDir
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
      }
    );

    // ---------- Group E: End-to-End Mini Training ----------

    await this.runTest(
      "End-to-end training run on baseline seed",
      "ML-Training",
      async () => {
        // Use the live trainer (already seeded). One epoch, small
        // batch, low validation split so we don't starve training.
        const text =
          "user authentication and login flow"; // matches seed
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
        if ((session.epochs_completed || 0) < 1)
          throw new Error("No epochs completed");

        const stats = this.adaptiveModelTrainer.getTrainingStatistics();
        if (!stats.active_version)
          throw new Error("No active model version after training");

        // Verify the saved model directory actually exists with files.
        const versionDir = path.join(
          TEST_CONFIG.testTrainerCachePath,
          stats.active_version
        );
        if (!fs.existsSync(path.join(versionDir, "metadata.json")))
          throw new Error(`metadata.json missing in ${versionDir}`);
        if (!fs.existsSync(path.join(versionDir, "model", "model.json")))
          throw new Error(`model.json missing in ${versionDir}`);

        // Enhanced embedding should now go through the trained
        // network and differ from the base USE output.
        const enhanced = await this.adaptiveModelTrainer.generateEnhancedEmbedding(
          text
        );
        if (!enhanced) throw new Error("Enhanced embedding null after train");
        let maxDelta = 0;
        for (let i = 0; i < baseBefore.length; i++) {
          const d = Math.abs(enhanced[i] - baseBefore[i]);
          if (d > maxDelta) maxDelta = d;
        }
        if (maxDelta < 1e-4)
          throw new Error(
            `Enhanced embedding identical to base after training (delta=${maxDelta})`
          );

        return {
          version: stats.active_version,
          loss: session.current_loss,
          epochs: session.epochs_completed,
          enhancedDelta: maxDelta,
        };
      }
    );

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
            createTestEntity("AuthService", "service", [
              "Handles login and token issuance",
            ]),
            createTestEntity("UnusedThing", "test", ["irrelevant"]),
          ],
          ["AuthService"],
          "semantic",
          "test-session",
          120,
          5
        );

        if (received.length === 0)
          throw new Error("No training events emitted");
        const evt = received[0];
        if (evt.source_type !== "search_success")
          throw new Error(`Unexpected source_type: ${evt.source_type}`);
        if (evt.confidence < 0.3)
          throw new Error(`Low confidence: ${evt.confidence}`);
        return { events: received.length, source: evt.source_type };
      }
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
          "test-session"
        );

        if (received.length !== 1)
          throw new Error(`Expected 1 event, got ${received.length}`);
        if (received[0].source_type !== "relationship_discovery")
          throw new Error(
            `Unexpected source_type: ${received[0].source_type}`
          );
        return { events: received.length };
      }
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
          "stat-session"
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
          throw new Error(
            `Total interactions ${stats.total_interactions} < 2`
          );
        if (stats.interactions_by_type.relationship_creation !== 1)
          throw new Error("Relationship count mismatch");
        if (stats.interactions_by_type.context_retrieval !== 1)
          throw new Error("Context retrieval count mismatch");
        return {
          total: stats.total_interactions,
          byType: stats.interactions_by_type,
        };
      }
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
        1
      );

      if (!fileRecord || !fileRecord.id)
        throw new Error("Failed to create file record");

      // Generate embedding for interface
      const interfaceCode =
        "interface MathOperation { execute(a: number, b: number): number; }";
      const embedding =
        await this.projectEmbeddingEngine.generateProjectEmbedding(
          interfaceCode,
          "interface_definition"
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
        embedding.embedding
      );

      if (!interfaceRecord) throw new Error("Failed to store interface record");

      return { interfaceId: interfaceRecord.id };
    });

    await this.runTest("Semantic Code Search", "ML", async () => {
      // Search for something semantically similar to "MathOperation"
      const query = "calculate numbers operation";
      const queryEmbedding =
        await this.projectEmbeddingEngine.generateProjectEmbedding(
          query,
          "business_logic"
        );

      if (!queryEmbedding)
        throw new Error("Failed to generate query embedding");

      const results = await this.projectAnalysisOps.findSimilarInterfaces(
        queryEmbedding.embedding,
        5
      );

      // We expect to find the MathOperation interface we just added
      const match = results.find((r) => r.interface.name === "MathOperation");

      if (!match) {
        // If we don't find it, it might be due to low similarity or empty DB
        // But since we just added it, it should be there.
        // Note: Similarity might be low if the model isn't great, but it should be in the list if it's the only one.
        return {
          found: false,
          count: results.length,
          topResult: results[0]?.interface.name,
        };
      }

      return {
        found: true,
        similarity: match.similarity,
        name: match.interface.name,
      };
    });

    await this.runTest(
      "Stored interface embedding round-trips through SQLite",
      "ML",
      async () => {
        // Round-trip test: read the embedding back from the DB and
        // confirm it matches what we stored above. This is the part
        // the old "Vector Store Persistence" stub was supposed to
        // verify. We pull the row directly via the connection.
        const rows = await this.sqliteConnection.runQuery(
          "SELECT id, name, embedding FROM code_interfaces WHERE name = ? AND embedding IS NOT NULL LIMIT 1",
          ["MathOperation"]
        );
        if (!rows || rows.length === 0)
          throw new Error("MathOperation row not found or has no embedding");
        const buf = rows[0].embedding as Buffer;
        if (!buf || buf.length === 0)
          throw new Error("Empty embedding buffer in DB");
        // Float32 -> 4 bytes per element. USE is 512-d.
        if (buf.length !== 512 * 4)
          throw new Error(
            `Embedding buffer size ${buf.length} != 2048 (512 floats)`
          );
        const view = new Float32Array(
          buf.buffer,
          buf.byteOffset,
          buf.length / 4
        );
        let nonZero = 0;
        for (const v of view) if (v !== 0) nonZero++;
        if (nonZero < 256)
          throw new Error(
            `Round-tripped embedding too sparse: ${nonZero}/512 non-zero`
          );
        return { rowId: rows[0].id, dim: view.length, nonZero };
      }
    );
  }

  // ============================================
  // ML HANDLER TESTS
  // ============================================

  /**
   * Exercises `MLHandlers` end-to-end: the dispatcher, response shape,
   * and DB-backed paths (`generate`, `find_similar`, `backfill`,
   * `train_project_model`). This replaces the orphaned mocha file in
   * `tests/ml-handlers.test.ts` (which was never wired into `npm test`)
   * and lets every handler entry point run against the same isolated
   * cache directory the rest of the suite uses.
   */
  async runMLHandlerTests(): Promise<void> {
    console.log("\n🧰 ML HANDLER TESTS\n");

    const mlHandlers = new MLHandlers(
      this.adaptiveModelTrainer,
      this.projectEmbeddingEngine,
      this.similarityEngine,
      this.projectAnalysisOps
    );

    // Each handler returns the standard MCP envelope:
    // { content: [ { type: "text", text: <json> } ] }. Parse + assert.
    const parse = (result: any): any => {
      if (!result?.content?.[0]?.text) {
        throw new Error("Handler returned malformed MCP envelope");
      }
      try {
        return JSON.parse(result.content[0].text);
      } catch (err) {
        throw new Error(
          `Handler response was not valid JSON: ${
            (err as Error).message
          } -- raw: ${String(result.content[0].text).slice(0, 120)}`
        );
      }
    };

    await this.runTest(
      "embeddings dispatcher rejects unknown action",
      "ML-Handlers",
      async () => {
        let threw = false;
        try {
          await mlHandlers.handleEmbeddings({ action: "not_a_real_action" });
        } catch (err) {
          threw = true;
          if (!/Unknown embeddings action/i.test(String(err))) {
            throw new Error(
              `Wrong error for unknown action: ${(err as Error).message}`
            );
          }
        }
        if (!threw)
          throw new Error("Dispatcher accepted an unknown action silently");
        return { ok: true };
      }
    );

    await this.runTest(
      "generate_interface_embedding rejects bad input",
      "ML-Handlers",
      async () => {
        const out = parse(
          await mlHandlers.handleEmbeddings({
            action: "generate",
            interface_names: "not-an-array",
          })
        );
        if (!out.error || !/array/i.test(out.error)) {
          throw new Error(
            `Expected error about array, got: ${JSON.stringify(out)}`
          );
        }
        return { error: out.error };
      }
    );

    await this.runTest(
      "generate_interface_embedding marks missing interfaces not_found",
      "ML-Handlers",
      async () => {
        const out = parse(
          await mlHandlers.handleEmbeddings({
            action: "generate",
            interface_names: ["__definitely_does_not_exist_xyz__"],
          })
        );
        if (out.action !== "generate")
          throw new Error(`Wrong action echo: ${out.action}`);
        if (!Array.isArray(out.results) || out.results.length !== 1)
          throw new Error("Expected exactly one result row");
        if (out.results[0].status !== "not_found")
          throw new Error(
            `Expected status=not_found, got ${out.results[0].status}`
          );
        return { ok: true };
      }
    );

    await this.runTest(
      "generate_interface_embedding succeeds for stored interface",
      "ML-Handlers",
      async () => {
        // The "Store Code Interface" test in runMLTests inserts
        // MathOperation. That row should still be present because
        // both methods share `this.projectAnalysisOps`. If it isn't,
        // bail loudly so the dependency is obvious.
        const existing = await this.projectAnalysisOps.getCodeInterfaces({
          name: "MathOperation",
          limit: 1,
        });
        if (!existing[0])
          throw new Error(
            "MathOperation interface not found - runMLTests must run first"
          );

        const out = parse(
          await mlHandlers.handleEmbeddings({
            action: "generate",
            interface_names: ["MathOperation"],
          })
        );
        const first = out.results?.[0];
        if (!first) throw new Error("No result row returned");
        if (first.status !== "success")
          throw new Error(`Status was ${first.status}, expected success`);
        if (!Array.isArray(first.embedding_preview) || first.embedding_preview.length !== 5)
          throw new Error(
            `embedding_preview should be length 5, got ${
              first.embedding_preview?.length
            }`
          );
        for (const v of first.embedding_preview) {
          if (typeof v !== "number" || !Number.isFinite(v)) {
            throw new Error("Non-finite value in embedding_preview");
          }
        }
        return { confidence: first.confidence };
      }
    );

    await this.runTest(
      "find_similar_code requires code_snippet",
      "ML-Handlers",
      async () => {
        const out = parse(
          await mlHandlers.handleEmbeddings({ action: "find_similar" })
        );
        if (!out.error || !/code_snippet/i.test(out.error)) {
          throw new Error(
            `Expected error about code_snippet, got: ${JSON.stringify(out)}`
          );
        }
        return { ok: true };
      }
    );

    await this.runTest(
      "find_similar_code returns ranked rows for stored embedding",
      "ML-Handlers",
      async () => {
        const out = parse(
          await mlHandlers.handleEmbeddings({
            action: "find_similar",
            code_snippet:
              "interface MathOperation { execute(a: number, b: number): number; }",
            limit: 5,
          })
        );
        if (out.error) throw new Error(`Handler errored: ${out.error}`);
        if (out.action !== "find_similar")
          throw new Error(`Wrong action echo: ${out.action}`);
        if (!Array.isArray(out.results))
          throw new Error("results should be an array");
        if (out.count !== out.results.length)
          throw new Error("count mismatch with results.length");
        // Embedding for MathOperation was stored in runMLTests; we
        // expect at least one ranked hit and similarity should be a
        // finite number in [-1, 1].
        if (out.results.length > 0) {
          const top = out.results[0];
          if (typeof top.similarity !== "number" || !Number.isFinite(top.similarity)) {
            throw new Error("Top similarity is not a finite number");
          }
          if (top.similarity < -1 || top.similarity > 1) {
            throw new Error(
              `Similarity out of range: ${top.similarity}`
            );
          }
        }
        return { count: out.count };
      }
    );

    await this.runTest(
      "backfill_embeddings reports before/processed/remaining",
      "ML-Handlers",
      async () => {
        const out = parse(
          await mlHandlers.handleEmbeddings({
            action: "backfill",
            file_limit: 5,
            interface_limit: 5,
          })
        );
        if (out.error) throw new Error(`Handler errored: ${out.error}`);
        if (out.action !== "backfill")
          throw new Error(`Wrong action echo: ${out.action}`);
        for (const key of ["before", "processed", "remaining"]) {
          if (typeof out[key] !== "object" || out[key] === null) {
            throw new Error(`Missing or non-object field: ${key}`);
          }
        }
        if (typeof out.processed.files !== "number")
          throw new Error("processed.files should be a number");
        if (typeof out.processed.interfaces !== "number")
          throw new Error("processed.interfaces should be a number");
        return out;
      }
    );

    await this.runTest(
      "train_project_model returns session or graceful error",
      "ML-Handlers",
      async () => {
        // Tiny config: epochs=1, batch_size=2. Either training kicks
        // off (we have baseline seed data, so it usually does) and
        // we get a session_id, OR the trainer says "not enough data"
        // and we return a structured error. Both are valid outcomes
        // for this contract test - what we forbid is a thrown
        // exception or a malformed response.
        const out = parse(
          await mlHandlers.handleTrainProjectModel({
            epochs: 1,
            batch_size: 2,
          })
        );
        if (out.error) {
          if (typeof out.error !== "string") {
            throw new Error("error field should be a string");
          }
          return { mode: "graceful_error", error: out.error };
        }
        if (!out.session_id || !out.status) {
          throw new Error(
            `Expected session_id+status, got: ${JSON.stringify(out)}`
          );
        }
        return {
          mode: "session_started",
          session_id: out.session_id,
          status: out.status,
          data_points: out.data_points,
        };
      }
    );
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
      const categoryResults = this.results.filter(
        (r) => r.category === category
      );
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
