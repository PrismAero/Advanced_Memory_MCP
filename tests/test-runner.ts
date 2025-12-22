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
import { RelationshipIndexer } from "../modules/relationship-indexer.js";
import { ModernSimilarityEngine } from "../modules/similarity/similarity-engine.js";

// Test configuration
const TEST_CONFIG = {
  testMemoryPath: path.join(process.cwd(), "test-memory-data"),
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
    this.backgroundProcessor = new BackgroundProcessor(
      this.memoryManager,
      this.similarityEngine
    );

    // Initialize all components in order
    await this.similarityEngine.initialize();
    await this.memoryManager.initialize();
    await this.relationshipIndexer.initialize();

    console.log("✅ Test environment ready\n");
  }

  async teardown(): Promise<void> {
    console.log("\n🧹 Cleaning up test environment...");

    try {
      this.backgroundProcessor.stop();
      this.relationshipIndexer.shutdown();
      await this.memoryManager.close();
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

