import { afterEach, describe, expect, it } from "vitest";

import { SQLiteConnection } from "../../modules/sqlite/sqlite-connection.js";
import {
  cleanupTempRoot,
  createTempMemoryRoot,
} from "../utils/mcp-test-utils.js";

describe("SQLite schema migrations", () => {
  let root: string | undefined;
  let connection: SQLiteConnection | undefined;

  afterEach(async () => {
    await connection?.close();
    if (root) await cleanupTempRoot(root);
    root = undefined;
    connection = undefined;
  });

  it("migrates existing project-analysis tables before creating indexes on new columns", async () => {
    root = createTempMemoryRoot("advanced-memory-schema-legacy-");
    connection = new SQLiteConnection(root);
    await connection.initialize();

    await connection.runQuery("PRAGMA foreign_keys = OFF");
    for (const table of [
      "interface_relationships",
      "project_dependencies",
      "workspace_context",
      "code_interfaces",
      "project_files",
    ]) {
      await connection.execute(`DROP TABLE IF EXISTS ${table}`);
    }

    await connection.execute(
      `CREATE TABLE project_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL UNIQUE
      )`,
    );
    await connection.execute(
      `CREATE TABLE code_interfaces (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        file_id INTEGER NOT NULL,
        line_number INTEGER NOT NULL,
        interface_type TEXT NOT NULL,
        definition TEXT NOT NULL,
        properties TEXT,
        extends_interfaces TEXT
      )`,
    );
    await connection.execute(
      `CREATE TABLE project_dependencies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_file_id INTEGER NOT NULL,
        dependency_type TEXT NOT NULL,
        source_identifier TEXT NOT NULL,
        line_number INTEGER NOT NULL
      )`,
    );
    await connection.execute(
      `CREATE TABLE workspace_context (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_name TEXT NOT NULL,
        workspace_path TEXT NOT NULL,
        project_type TEXT NOT NULL,
        package_manager TEXT NOT NULL,
        root_path TEXT NOT NULL
      )`,
    );
    await connection.execute(
      `CREATE TABLE interface_relationships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_interface_id INTEGER NOT NULL,
        to_interface_id INTEGER NOT NULL,
        relationship_type TEXT NOT NULL
      )`,
    );
    await connection.runQuery("PRAGMA foreign_keys = ON");
    await connection.close();

    connection = new SQLiteConnection(root);
    await expect(connection.initialize()).resolves.toBeUndefined();

    await expectColumns("project_files", [
      "language",
      "category",
      "last_modified",
      "branch_id",
      "is_entry_point",
      "embedding",
    ]);
    await expectColumns("code_interfaces", [
      "language",
      "qualified_name",
      "kind",
      "stable_id",
      "is_exported",
      "usage_count",
      "embedding",
    ]);
    await expectColumns("project_dependencies", [
      "to_file_id",
      "external_package",
      "resolution_status",
    ]);
    await expectColumns("workspace_context", [
      "languages",
      "indexing_status",
      "branch_id",
    ]);
    await expectColumns("interface_relationships", [
      "confidence_score",
      "semantic_similarity",
      "usage_frequency",
    ]);

    await expectIndexes("project_files", [
      "idx_project_files_language",
      "idx_project_files_branch",
    ]);
    await expectIndexes("code_interfaces", [
      "idx_code_interfaces_language",
      "idx_code_interfaces_stable",
    ]);
    await expectIndexes("workspace_context", [
      "idx_workspace_context_branch",
      "idx_workspace_context_status",
    ]);
  });

  async function expectColumns(table: string, expected: string[]): Promise<void> {
    const columns = await connection!.runQuery(`PRAGMA table_info(${table})`);
    expect(columns.map((column: any) => column.name)).toEqual(
      expect.arrayContaining(expected),
    );
  }

  async function expectIndexes(table: string, expected: string[]): Promise<void> {
    const indexes = await connection!.runQuery(`PRAGMA index_list(${table})`);
    expect(indexes.map((index: any) => index.name)).toEqual(
      expect.arrayContaining(expected),
    );
  }
});
