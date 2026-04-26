import * as fs from "fs";
import * as path from "path";
import { resolveOwnedPath } from "../../modules/path-boundary.js";
import { ProjectIndexer } from "../../modules/project-analysis/project-indexer.js";
import { ProjectAnalysisOperations } from "../../modules/sqlite/project-analysis-operations.js";
import { SQLiteConnection } from "../../modules/sqlite/sqlite-connection.js";

export interface AuditFixTestRunner {
  projectAnalysisOps: ProjectAnalysisOperations;
  sqliteConnection: SQLiteConnection;
  runTest(
    name: string,
    category: string,
    testFn: () => Promise<any>,
  ): Promise<any>;
}

export async function runAuditFixTests(
  runner: AuditFixTestRunner,
  testMemoryPath: string,
): Promise<void> {
  console.log("\n🛠️ AUDIT FIX TESTS\n");

  await runner.runTest(
    ".memoryignore is created and honored by project scans",
    "Audit-Fixes",
    async () => {
      const fixtureRoot = path.join(testMemoryPath, "ignore-fixture");
      fs.mkdirSync(path.join(fixtureRoot, "src"), { recursive: true });
      fs.mkdirSync(path.join(fixtureRoot, "ignored"), { recursive: true });
      fs.writeFileSync(
        path.join(fixtureRoot, "src", "kept.ts"),
        "export interface Kept { id: string }\n",
      );
      fs.writeFileSync(
        path.join(fixtureRoot, "ignored", "skip.ts"),
        "export interface Skipped { id: string }\n",
      );

      const indexer = new ProjectIndexer();
      const files = await indexer.scanProjectFiles(fixtureRoot, ["ignored/**"]);
      const relativePaths = files.map((file) =>
        file.relativePath.replace(/\\/g, "/"),
      );
      const memoryIgnorePath = path.join(fixtureRoot, ".memory", ".memoryignore");

      if (!fs.existsSync(memoryIgnorePath)) {
        throw new Error(".memory/.memoryignore was not created");
      }
      if (!relativePaths.includes("src/kept.ts")) {
        throw new Error("Expected kept file to be indexed");
      }
      if (relativePaths.includes("ignored/skip.ts")) {
        throw new Error("Ignored file was indexed");
      }

      return { files: relativePaths };
    },
  );

  await runner.runTest(
    "Ignored/deleted cleanup removes owned rows and vectors",
    "Audit-Fixes",
    async () => {
      const embedding = Array.from({ length: 512 }, (_, i) => (i % 7) / 10);
      const retainedFile =
        await runner.projectAnalysisOps.storeOrUpdateProjectFile(
          {
            filePath: path.join(testMemoryPath, "retained.ts"),
            relativePath: "retained.ts",
            fileType: {
              extension: ".ts",
              language: "typescript",
              category: "source",
              hasImports: false,
              hasExports: true,
              canDefineInterfaces: true,
            },
            size: 10,
            lastModified: new Date(),
            imports: [],
            exports: [],
            interfaces: [],
            dependencies: [],
            isEntryPoint: false,
            analysisMetadata: {
              lineCount: 1,
              hasTests: false,
              complexity: "low",
              documentation: 0,
            },
          },
          1,
        );
      const staleFile = await runner.projectAnalysisOps.storeOrUpdateProjectFile(
        {
          filePath: path.join(testMemoryPath, "ignored.ts"),
          relativePath: "ignored.ts",
          fileType: {
            extension: ".ts",
            language: "typescript",
            category: "source",
            hasImports: false,
            hasExports: true,
            canDefineInterfaces: true,
          },
          size: 10,
          lastModified: new Date(),
          imports: [],
          exports: [],
          interfaces: [],
          dependencies: [],
          isEntryPoint: false,
          embedding,
          analysisMetadata: {
            lineCount: 1,
            hasTests: false,
            complexity: "low",
            documentation: 0,
          },
        },
        1,
      );

      if (!retainedFile?.id || !staleFile?.id) {
        throw new Error("Failed to set up project file records");
      }

      const iface = await runner.projectAnalysisOps.storeCodeInterface(
        staleFile.id,
        {
          name: "IgnoredInterface",
          properties: [],
          extends: [],
          line: 1,
          isExported: true,
        },
        embedding,
      );
      if (!iface?.id) throw new Error("Failed to set up interface record");

      const deleted = await runner.projectAnalysisOps.cleanupIgnoredOrDeletedFiles([
        retainedFile.file_path,
      ]);
      if (deleted < 1) throw new Error("Expected at least one stale file cleanup");

      const staleRows = await runner.sqliteConnection.runQuery(
        "SELECT id FROM project_files WHERE id = ?",
        [staleFile.id],
      );
      const vectorRows = await runner.sqliteConnection.runQuery(
        "SELECT id FROM vectors WHERE id IN (?, ?)",
        [`file_${staleFile.id}`, `interface_${iface.id}`],
      );

      if (staleRows.length > 0) throw new Error("Stale project file row remains");
      if (vectorRows.length > 0) {
        throw new Error("Owned vectors remain after cleanup");
      }

      return { deleted };
    },
  );

  await runner.runTest(
    "Path boundary rejects out-of-root workspace paths",
    "Audit-Fixes",
    async () => {
      const outside = path.dirname(testMemoryPath);
      let rejected = false;
      try {
        resolveOwnedPath(outside, "workspace_path", testMemoryPath);
      } catch {
        rejected = true;
      }
      if (!rejected) throw new Error("Out-of-root path was accepted");
      return { rejected };
    },
  );
}
