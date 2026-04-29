import { promises as fs } from "fs";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { ProjectAnalysisOperations } from "../../modules/sqlite/project-analysis-operations.js";
import { SQLiteConnection } from "../../modules/sqlite/sqlite-connection.js";
import { cleanupTempRoot, createTempMemoryRoot } from "../utils/mcp-test-utils.js";

describe("project cleanup operations", () => {
  let root: string | undefined;
  let connection: SQLiteConnection | undefined;
  let projectOps: ProjectAnalysisOperations | undefined;

  afterEach(async () => {
    projectOps?.dispose();
    await connection?.close();
    if (root) await cleanupTempRoot(root);
    root = undefined;
    connection = undefined;
    projectOps = undefined;
  });

  it("removes project data, interfaces, dependencies, and vectors for newly ignored files", async () => {
    root = createTempMemoryRoot("advanced-memory-project-cleanup-");
    await fs.mkdir(path.join(root, "generated", "subfolder"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(root, "generated", "subfolder", "ignored.cpp"),
      "int ignored();\n",
    );
    await fs.writeFile(path.join(root, "kept.cpp"), "int kept();\n");
    await fs.mkdir(path.join(root, ".memory"), { recursive: true });
    await fs.writeFile(path.join(root, ".memory", ".memoryignore"), "generated\n");

    connection = new SQLiteConnection(root);
    await connection.initialize();
    projectOps = new ProjectAnalysisOperations(connection);
    await projectOps.initialize();
    const branchId = await connection.getBranchId("main");

    const ignoredFile = await connection.execute(
      `INSERT INTO project_files (
        file_path, relative_path, file_type, language, category, size_bytes,
        line_count, last_modified, last_analyzed, branch_id, is_entry_point,
        has_tests, complexity, documentation_percentage, analysis_metadata,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        path.join(root, "generated", "subfolder", "ignored.cpp"),
        "generated/subfolder/ignored.cpp",
        ".cpp",
        "cpp",
        "source",
        14,
        1,
        new Date().toISOString(),
        new Date().toISOString(),
        branchId,
        0,
        0,
        "low",
        0,
        "{}",
        new Date().toISOString(),
        new Date().toISOString(),
      ],
    );
    const keptFile = await connection.execute(
      `INSERT INTO project_files (
        file_path, relative_path, file_type, language, category, size_bytes,
        line_count, last_modified, last_analyzed, branch_id, is_entry_point,
        has_tests, complexity, documentation_percentage, analysis_metadata,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        path.join(root, "kept.cpp"),
        "kept.cpp",
        ".cpp",
        "cpp",
        "source",
        11,
        1,
        new Date().toISOString(),
        new Date().toISOString(),
        branchId,
        0,
        0,
        "low",
        0,
        "{}",
        new Date().toISOString(),
        new Date().toISOString(),
      ],
    );

    const iface = await connection.execute(
      `INSERT INTO code_interfaces (
        name, file_id, line_number, interface_type, definition, language,
        qualified_name, kind, stable_id, is_exported, is_generic, usage_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "IgnoredInterface",
        ignoredFile.lastID,
        1,
        "function",
        "int ignored();",
        "cpp",
        "IgnoredInterface",
        "function",
        "ignored-stable-id",
        0,
        0,
        0,
      ],
    );
    await connection.execute(
      `INSERT INTO project_dependencies (
        from_file_id, to_file_id, dependency_type, source_identifier,
        target_identifier, line_number
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [keptFile.lastID, ignoredFile.lastID, "import", "ignored", "ignored", 1],
    );

    const vector = Buffer.from(new Float32Array(Array.from({ length: 512 }, () => 0.1)).buffer);
    await connection.execute(
      "INSERT INTO vectors (id, vector, metadata) VALUES (?, ?, ?), (?, ?, ?)",
      [`file_${ignoredFile.lastID}`, vector, "{}", `interface_${iface.lastID}`, vector, "{}"],
    );

    const removed = await projectOps.cleanupIgnoredFiles(root);
    expect(removed).toBe(1);

    await expectCount("project_files", ignoredFile.lastID, 0);
    await expectCount("project_files", keptFile.lastID, 1);
    expect(
      (
        await connection.getQuery(
          "SELECT COUNT(*) as count FROM code_interfaces WHERE file_id = ?",
          [ignoredFile.lastID],
        )
      ).count,
    ).toBe(0);
    expect(
      (
        await connection.getQuery(
          "SELECT COUNT(*) as count FROM project_dependencies WHERE to_file_id = ? OR from_file_id = ?",
          [ignoredFile.lastID, ignoredFile.lastID],
        )
      ).count,
    ).toBe(0);
    expect(
      (
        await connection.getQuery("SELECT COUNT(*) as count FROM vectors WHERE id IN (?, ?)", [
          `file_${ignoredFile.lastID}`,
          `interface_${iface.lastID}`,
        ])
      ).count,
    ).toBe(0);
  });

  async function expectCount(table: string, id: number, expected: number): Promise<void> {
    expect(
      (await connection!.getQuery(`SELECT COUNT(*) as count FROM ${table} WHERE id = ?`, [id]))
        .count,
    ).toBe(expected);
  }
});
