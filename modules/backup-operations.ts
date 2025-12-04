import { promises as fs } from "fs";
import path from "path";
import { KnowledgeGraph } from "../memory-types.js";
import { logger } from "./logger.js";
import { MigrationUtils } from "./migration-utils.js";

/**
 * Backup and Export Operations
 * Handles JSON exports, backups, and data preservation
 */
export class BackupOperations {
  private backupPath: string;
  private migrationUtils: MigrationUtils;

  constructor(basePath: string) {
    this.backupPath = path.join(basePath, ".memory", "backups");
    this.migrationUtils = new MigrationUtils(basePath);
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.backupPath, { recursive: true });
  }

  /**
   * Create automatic backup in JSON format
   */
  async createBackup(
    graph: KnowledgeGraph,
    branchName?: string
  ): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = path.join(
      this.backupPath,
      `${branchName || "main"}_${timestamp}.json`
    );

    const jsonContent = this.migrationUtils.graphToJsonLines(graph);
    await fs.writeFile(backupFile, jsonContent);

    logger.info(`Backup created: ${backupFile}`);
    return backupFile;
  }

  /**
   * Create human-readable JSON export
   */
  async exportToReadableJson(
    graph: KnowledgeGraph,
    branchName?: string
  ): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const exportFile = path.join(
      this.backupPath,
      `export_${branchName || "main"}_${timestamp}.json`
    );

    // Pretty-printed JSON for human reading
    const readable = {
      branch: branchName || "main",
      exportedAt: new Date().toISOString(),
      stats: {
        entityCount: graph.entities.length,
        relationCount: graph.relations.length,
      },
      entities: graph.entities.map((e) => {
        // Remove optimization metadata for cleaner export
        const { _optimizationData, ...cleanEntity } = e as any;
        return cleanEntity;
      }),
      relations: graph.relations,
    };

    await fs.writeFile(exportFile, JSON.stringify(readable, null, 2));
    logger.info(`Human-readable export created: ${exportFile}`);

    return exportFile;
  }

  /**
   * Clean up old backups (keep last N backups)
   */
  async cleanupBackups(keepCount: number = 5): Promise<void> {
    try {
      const files = await fs.readdir(this.backupPath);
      const backupFiles = files
        .filter((f) => f.endsWith(".json"))
        .map((f) => ({
          name: f,
          path: path.join(this.backupPath, f),
          stat: null as any,
        }));

      // Get file stats for sorting by date
      for (const file of backupFiles) {
        file.stat = await fs.stat(file.path);
      }

      // Sort by modification time, newest first
      backupFiles.sort(
        (a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime()
      );

      // Delete old backups
      if (backupFiles.length > keepCount) {
        const toDelete = backupFiles.slice(keepCount);
        for (const file of toDelete) {
          await fs.unlink(file.path);
          logger.info(`Deleted old backup: ${file.name}`);
        }
      }
    } catch (error) {
      logger.error("Failed to cleanup backups:", error);
    }
  }

  /**
   * Get backup statistics
   */
  async getBackupStats(): Promise<{
    count: number;
    totalSize: number;
    oldestBackup?: string;
    newestBackup?: string;
  }> {
    try {
      const files = await fs.readdir(this.backupPath);
      const backupFiles = files.filter((f) => f.endsWith(".json"));

      if (backupFiles.length === 0) {
        return { count: 0, totalSize: 0 };
      }

      let totalSize = 0;
      let oldestTime = Date.now();
      let newestTime = 0;
      let oldestBackup = "";
      let newestBackup = "";

      for (const file of backupFiles) {
        const filePath = path.join(this.backupPath, file);
        const stat = await fs.stat(filePath);
        totalSize += stat.size;

        if (stat.mtime.getTime() < oldestTime) {
          oldestTime = stat.mtime.getTime();
          oldestBackup = file;
        }

        if (stat.mtime.getTime() > newestTime) {
          newestTime = stat.mtime.getTime();
          newestBackup = file;
        }
      }

      return {
        count: backupFiles.length,
        totalSize,
        oldestBackup,
        newestBackup,
      };
    } catch (error) {
      logger.error("Failed to get backup stats:", error);
      return { count: 0, totalSize: 0 };
    }
  }
}
