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
});
