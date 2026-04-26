import { createTestEntity } from "./entity-tests.js";

export interface SimilaritySearchTestRunner {
  memoryManager: any;
  similarityEngine: any;
  runTest(
    name: string,
    category: string,
    testFn: () => Promise<any>,
  ): Promise<any>;
}

export async function runSimilarityTests(
  runner: SimilaritySearchTestRunner,
): Promise<void> {
  console.log("\n🧠 SIMILARITY TESTS (TensorFlow.js)\n");

  await runner.runTest("Similarity engine health check", "Similarity", async () => {
    const health = await runner.similarityEngine.healthCheck();
    if (health.status === "unhealthy") throw new Error(health.message);
    return health;
  });

  await runner.runTest("Run similarity self-test", "Similarity", async () => {
    const result = await runner.similarityEngine.runSelfTest();
    if (!result.success) throw new Error("Self-test failed");
    return result;
  });

  await runner.runTest("Calculate similarity between identical texts", "Similarity", async () => {
    const entity1 = createTestEntity("Entity1", "test", [
      "Machine learning model training",
    ]);
    const entity2 = createTestEntity("Entity2", "test", [
      "Machine learning model training",
    ]);
    const similarity = await runner.similarityEngine.calculateSimilarity(
      entity1,
      entity2,
    );
    if (similarity < 0.9) throw new Error(`Similarity too low: ${similarity}`);
    return { similarity };
  });

  await runner.runTest("Calculate similarity between related texts", "Similarity", async () => {
    const entity1 = createTestEntity("ReactComponent", "component", [
      "React component for user authentication",
    ]);
    const entity2 = createTestEntity("AuthService", "service", [
      "Service handling user login and registration",
    ]);
    const similarity = await runner.similarityEngine.calculateSimilarity(
      entity1,
      entity2,
    );
    if (similarity < 0.3) throw new Error(`Similarity too low: ${similarity}`);
    return { similarity };
  });

  await runner.runTest("Calculate similarity between unrelated texts", "Similarity", async () => {
    const entity1 = createTestEntity("DatabaseConnection", "infrastructure", [
      "PostgreSQL database connection pooling",
    ]);
    const entity2 = createTestEntity("UIButton", "component", [
      "Styled button with hover animation",
    ]);
    const similarity = await runner.similarityEngine.calculateSimilarity(
      entity1,
      entity2,
    );
    if (similarity > 0.7) throw new Error(`Similarity too high: ${similarity}`);
    return { similarity };
  });

  await runner.runTest("Detect similar entities", "Similarity", async () => {
    const target = createTestEntity("Target", "test", [
      "API endpoint for user management",
    ]);
    const candidates = [
      createTestEntity("Candidate1", "test", ["REST API for managing users"]),
      createTestEntity("Candidate2", "test", ["Database schema for products"]),
      createTestEntity("Candidate3", "test", ["User authentication service"]),
    ];

    const results = await runner.similarityEngine.detectSimilarEntities(
      target,
      candidates,
    );
    for (let i = 0; i < results.length - 1; i++) {
      if (results[i].similarity < results[i + 1].similarity) {
        throw new Error("Results not sorted correctly");
      }
    }
    return {
      count: results.length,
      topSimilarity: results.length > 0 ? results[0].similarity : 0,
    };
  });

  await runner.runTest("Relationship type inference", "Similarity", async () => {
    const entity1 = createTestEntity("AuthController", "controller", [
      "Controller handling authentication requests",
    ]);
    const entity2 = createTestEntity("AuthService", "service", [
      "Service implementing authentication logic",
    ]);
    const results = await runner.similarityEngine.detectSimilarEntities(entity1, [
      entity2,
    ]);
    if (results.length === 0) throw new Error("No results");
    return {
      similarity: results[0].similarity,
      relationType: results[0].suggestedRelationType,
      confidence: results[0].confidence,
    };
  });

  await runner.runTest("Empty observation handling", "Similarity-Edge", async () => {
    const entity1 = createTestEntity("EmptyObs1", "test", []);
    const entity2 = createTestEntity("EmptyObs2", "test", ["has content"]);
    const similarity = await runner.similarityEngine.calculateSimilarity(
      entity1,
      entity2,
    );
    return { handled: true, similarity };
  });

  await runner.runTest("Very short text similarity", "Similarity-Edge", async () => {
    const entity1 = createTestEntity("Short1", "t", ["a"]);
    const entity2 = createTestEntity("Short2", "t", ["b"]);
    const similarity = await runner.similarityEngine.calculateSimilarity(
      entity1,
      entity2,
    );
    return { handled: true, similarity };
  });

  await runner.runTest("Empty candidates array", "Similarity-Edge", async () => {
    const target = createTestEntity("Target", "test", ["test"]);
    const results = await runner.similarityEngine.detectSimilarEntities(target, []);
    if (results.length !== 0) throw new Error("Should return empty array");
    return { handled: true };
  });
}

export async function runSearchTests(
  runner: SimilaritySearchTestRunner,
): Promise<void> {
  console.log("\n🔍 SEARCH TESTS\n");

  await runner.memoryManager.createEntities([
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
      observations: ["PostgreSQL data persistence layer", "Connection pooling"],
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

  await runner.runTest("Text search - exact match", "Search", async () => {
    const results = await runner.memoryManager.searchEntities("UserAuth");
    if (results.entities.length === 0) throw new Error("No results found");
    return { count: results.entities.length };
  });

  await runner.runTest("Text search - partial match", "Search", async () => {
    const results = await runner.memoryManager.searchEntities("authentication");
    if (results.entities.length === 0) throw new Error("No results found");
    return { count: results.entities.length };
  });

  await runner.runTest("Text search - no match", "Search", async () => {
    const results = await runner.memoryManager.searchEntities("xyznonexistent123");
    if (results.entities.length !== 0) throw new Error("Should return no results");
    return { count: 0 };
  });

  await runner.runTest("Semantic search", "Search", async () => {
    const results = await runner.memoryManager.searchEntities("login security tokens");
    return { count: results.entities.length };
  });

  await runner.runTest("Search with special characters", "Search-Edge", async () => {
    const results = await runner.memoryManager.searchEntities("user@auth#test");
    return { handled: true, count: results.entities.length };
  });

  await runner.runTest("Search with empty query", "Search-Edge", async () => {
    const results = await runner.memoryManager.searchEntities("");
    return { handled: true, count: results.entities.length };
  });

  await runner.runTest("Search with very long query", "Search-Edge", async () => {
    const longQuery = "authentication ".repeat(100);
    const results = await runner.memoryManager.searchEntities(longQuery);
    return { handled: true, count: results.entities.length };
  });

  await runner.memoryManager.deleteEntities([
    "SearchTest_UserAuth",
    "SearchTest_DataStore",
    "SearchTest_APIGateway",
    "SearchTest_LoggingService",
  ]);
}
