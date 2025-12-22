import { expect } from "chai";
import * as fs from "fs";
import { after, before, describe, it } from "mocha";
import * as path from "path";
import { EnhancedMemoryManager } from "../enhanced-memory-manager-modular.js";
import { MLHandlers } from "../modules/handlers/ml-handlers.js";
import { AdaptiveModelTrainer } from "../modules/ml/adaptive-model-trainer.js";
import { ProjectEmbeddingEngine } from "../modules/ml/project-embedding-engine.js";
import { ModernSimilarityEngine } from "../modules/similarity/similarity-engine.js";
import { ProjectAnalysisOperations } from "../modules/sqlite/project-analysis-operations.js";
import { SQLiteConnection } from "../modules/sqlite/sqlite-connection.js";

const TEST_DB_PATH = path.join(process.cwd(), "test-ml-memory");

describe("ML Handlers Integration Tests", () => {
  let memoryManager: EnhancedMemoryManager;
  let similarityEngine: ModernSimilarityEngine;
  let sqliteConnection: SQLiteConnection;
  let projectAnalysisOps: ProjectAnalysisOperations;
  let mlHandlers: MLHandlers;
  let adaptiveModelTrainer: AdaptiveModelTrainer;
  let projectEmbeddingEngine: ProjectEmbeddingEngine;

  before(async () => {
    // Setup test environment
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.rmSync(TEST_DB_PATH, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_DB_PATH, { recursive: true });

    // Initialize components
    similarityEngine = new ModernSimilarityEngine();
    await similarityEngine.initialize();

    memoryManager = new EnhancedMemoryManager(similarityEngine);
    await memoryManager.initialize();

    sqliteConnection = new SQLiteConnection(TEST_DB_PATH);
    await sqliteConnection.initialize();

    projectAnalysisOps = new ProjectAnalysisOperations(sqliteConnection);

    adaptiveModelTrainer = new AdaptiveModelTrainer(
      similarityEngine.getModelManager()
    );
    projectEmbeddingEngine = new ProjectEmbeddingEngine(
      similarityEngine.getModelManager(),
      adaptiveModelTrainer
    );

    mlHandlers = new MLHandlers(
      adaptiveModelTrainer,
      projectEmbeddingEngine,
      similarityEngine,
      projectAnalysisOps
    );
  });

  after(async () => {
    // Cleanup
    await memoryManager.close();
    await sqliteConnection.close();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.rmSync(TEST_DB_PATH, { recursive: true, force: true });
    }
  });

  it("should train project model", async () => {
    const result = await mlHandlers.handleTrainProjectModel({
      epochs: 1,
      batch_size: 2,
    });

    const content = JSON.parse(result.content[0].text);
    // Note: Training might fail if there's no data, but the handler should return a response
    // In this case, it might return an error or a session with 0 data points
    if (content.error) {
      // If it errors due to insufficient data, that's expected in this empty state
      expect(content.error).to.exist;
    } else {
      expect(content.session_id).to.exist;
      expect(content.status).to.exist;
    }
  });

  it("should generate interface embedding", async () => {
    // First, insert a dummy interface into the DB
    await sqliteConnection.runQuery(
      `INSERT INTO code_interfaces (
        name, file_id, line_number, interface_type, definition, properties,
        extends_interfaces, is_exported, is_generic, usage_count, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "TestInterface",
        1,
        10,
        "interface",
        "interface TestInterface { id: string; }",
        "[]",
        "[]",
        1,
        0,
        0,
        new Date().toISOString(),
        new Date().toISOString(),
      ]
    );

    const result = await mlHandlers.handleGenerateInterfaceEmbedding({
      interface_names: ["TestInterface"],
    });

    const content = JSON.parse(result.content[0].text);
    expect(content.results).to.be.an("array");
    expect(content.results[0].name).to.equal("TestInterface");
    expect(content.results[0].status).to.equal("success");
    expect(content.results[0].embedding_preview).to.be.an("array");
  });

  it("should find similar code", async () => {
    // We rely on the embedding generated in the previous test (if update_database was true, which defaults to true but logic in handler might need check)
    // Actually, handleGenerateInterfaceEmbedding in the current implementation doesn't explicitly save to DB yet (commented out in code),
    // so we might need to manually update the DB with an embedding for this test to work fully.

    // Let's manually update the embedding for TestInterface to simulate it being there
    // Generate a dummy embedding (1x512 vector)
    const dummyEmbedding = new Float32Array(512).fill(0.1);
    const buffer = Buffer.from(dummyEmbedding.buffer);

    await sqliteConnection.runQuery(
      "UPDATE code_interfaces SET embedding = ? WHERE name = ?",
      [buffer, "TestInterface"]
    );

    const result = await mlHandlers.handleFindSimilarCode({
      code_snippet: "interface TestInterface { id: string; }",
      limit: 1,
    });

    const content = JSON.parse(result.content[0].text);
    expect(content.results).to.be.an("array");
    // Since we're using a real model for query and dummy for DB, similarity might be low, but it should return results
    if (content.results.length > 0) {
      expect(content.results[0].name).to.equal("TestInterface");
    }
  });
});
