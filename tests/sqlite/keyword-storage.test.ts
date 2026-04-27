import { afterEach, describe, expect, it } from "vitest";

import { KeywordOperations } from "../../modules/sqlite/keyword-operations.js";
import { SQLiteConnection } from "../../modules/sqlite/sqlite-connection.js";
import {
  cleanupTempRoot,
  createTempMemoryRoot,
} from "../utils/mcp-test-utils.js";

describe("SQLite keyword coupling storage", () => {
  let root: string | undefined;
  let connection: SQLiteConnection | undefined;

  afterEach(async () => {
    await connection?.close();
    if (root) await cleanupTempRoot(root);
    root = undefined;
    connection = undefined;
  });

  it("dedupes structured keyword signals and cleans stale observation coupling on refresh", async () => {
    root = createTempMemoryRoot("advanced-memory-keywords-");
    connection = new SQLiteConnection(root);
    await connection.initialize();
    const branchId = await connection.getBranchId("keyword-storage");

    const entity = await connection.execute(
      `INSERT INTO entities (name, entity_type, branch_id, original_content, optimized_content)
       VALUES (?, ?, ?, ?, ?)`,
      [
        "KeywordStorage_DeviceBoot",
        "driver task",
        branchId,
        "Decision: DeviceBoot depends on DMA_RING_BUFFER",
        "Decision: DeviceBoot depends on DMA_RING_BUFFER",
      ],
    );
    const observation = await connection.execute(
      `INSERT INTO observations (entity_id, content, optimized_content, sequence_order, priority)
       VALUES (?, ?, ?, ?, ?)`,
      [
        entity.lastID,
        "Blocked by DMA_RING_BUFFER allocation failure in drivers/device_boot.cpp",
        "Blocked by DMA_RING_BUFFER allocation failure in drivers/device_boot.cpp",
        0,
        "high",
      ],
    );

    const keywordOps = new KeywordOperations(connection);
    await keywordOps.refreshEntityKeywords(entity.lastID, branchId);
    const firstCount = await connection.getQuery(
      "SELECT COUNT(*) as count FROM keywords WHERE entity_id = ?",
      [entity.lastID],
    );
    await keywordOps.refreshEntityKeywords(entity.lastID, branchId);
    const secondCount = await connection.getQuery(
      "SELECT COUNT(*) as count FROM keywords WHERE entity_id = ?",
      [entity.lastID],
    );
    expect(secondCount.count).toBe(firstCount.count);

    const sourceRows = await connection.runQuery(
      "SELECT DISTINCT source_type FROM keywords WHERE entity_id = ? ORDER BY source_type",
      [entity.lastID],
    );
    expect(sourceRows.map((row: any) => row.source_type)).toEqual(
      expect.arrayContaining(["entity_name", "entity_type", "entity_content", "observation"]),
    );

    const links = await connection.getQuery(
      "SELECT COUNT(*) as count FROM keyword_links WHERE entity_id = ?",
      [entity.lastID],
    );
    expect(links.count).toBeGreaterThan(0);

    await connection.execute("DELETE FROM observations WHERE id = ?", [
      observation.lastID,
    ]);
    await keywordOps.refreshEntityKeywords(entity.lastID, branchId);
    const staleObservationKeywords = await connection.getQuery(
      "SELECT COUNT(*) as count FROM keywords WHERE observation_id = ?",
      [observation.lastID],
    );
    expect(staleObservationKeywords.count).toBe(0);
  });

  it("migrates an existing flat keywords table before creating new keyword indexes", async () => {
    root = createTempMemoryRoot("advanced-memory-keywords-legacy-");
    connection = new SQLiteConnection(root);
    await connection.initialize();

    await connection.execute("DROP TABLE IF EXISTS keyword_links");
    await connection.execute("DROP TABLE IF EXISTS keywords");
    await connection.execute(
      `CREATE TABLE keywords (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        keyword TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        weight REAL DEFAULT 1.0,
        context TEXT,
        FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
      )`,
    );
    await connection.close();

    connection = new SQLiteConnection(root);
    await expect(connection.initialize()).resolves.toBeUndefined();

    const columns = await connection.runQuery("PRAGMA table_info(keywords)");
    expect(columns.map((column: any) => column.name)).toEqual(
      expect.arrayContaining([
        "normalized_keyword",
        "source_type",
        "source_id",
        "branch_id",
        "observation_id",
        "keyword_type",
        "confidence",
        "position",
        "phrase_length",
        "last_seen",
        "metadata",
      ]),
    );

    const indexes = await connection.runQuery("PRAGMA index_list(keywords)");
    expect(indexes.map((index: any) => index.name)).toEqual(
      expect.arrayContaining([
        "idx_keywords_normalized",
        "idx_keywords_branch",
        "idx_keywords_type",
        "idx_keywords_source",
      ]),
    );
  });
});
