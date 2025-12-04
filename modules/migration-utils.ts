import { promises as fs } from "fs";
import path from "path";
import { Entity, KnowledgeGraph, Relation } from "../memory-types.js";
import { logger } from "./logger.js";

/**
 * Migration utilities for converting between storage formats
 * Handles JSON to SQLite migration and data format conversions
 */
export class MigrationUtils {
  private basePath: string;
  private branchesPath: string;
  private backupPath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
    this.branchesPath = path.join(basePath, ".memory");
    this.backupPath = path.join(basePath, ".memory", "backups");
  }

  /**
   * Check if file exists
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parse JSON memory file to KnowledgeGraph
   */
  async parseJsonMemoryFile(filePath: string): Promise<KnowledgeGraph> {
    try {
      const data = await fs.readFile(filePath, "utf-8");
      const lines = data.split("\n").filter((line) => line.trim() !== "");

      const graph: KnowledgeGraph = { entities: [], relations: [] };

      lines.forEach((line) => {
        try {
          const item = JSON.parse(line);
          if (item.type === "entity") {
            const { type, ...entity } = item;
            graph.entities.push(entity as Entity);
          } else if (item.type === "relation") {
            const { type, ...relation } = item;
            graph.relations.push(relation as Relation);
          }
        } catch (e) {
          logger.warn(`Failed to parse line in ${filePath}:`, line, e);
        }
      });

      return graph;
    } catch (error) {
      logger.error(`Failed to parse ${filePath}:`, error);
      return { entities: [], relations: [] };
    }
  }

  /**
   * Convert KnowledgeGraph to line-delimited JSON format
   */
  graphToJsonLines(graph: KnowledgeGraph): string {
    const lines = [
      ...graph.entities.map((e) => {
        // Remove optimization metadata from exports
        const { _optimizationData, ...cleanEntity } = e as any;
        return JSON.stringify({ type: "entity", ...cleanEntity });
      }),
      ...graph.relations.map((r) => JSON.stringify({ type: "relation", ...r })),
    ];
    return lines.join("\n");
  }

  /**
   * Create backup of file before migration
   */
  async createMigrationBackup(
    filePath: string,
    branchName: string
  ): Promise<string> {
    await fs.mkdir(this.backupPath, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = path.join(
      this.backupPath,
      `migration_${branchName}_${timestamp}.json`
    );

    try {
      await fs.copyFile(filePath, backupFile);
      logger.info(`Migration backup created: ${backupFile}`);
      return backupFile;
    } catch (error) {
      logger.error(`Failed to create backup of ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Discover all JSON memory files for migration
   */
  async discoverMemoryFiles(): Promise<
    Array<{ path: string; branch: string }>
  > {
    const files: Array<{ path: string; branch: string }> = [];

    // Check for old main memory file in root
    const oldMainPath = path.join(this.basePath, "memory.json");
    if (await this.fileExists(oldMainPath)) {
      files.push({ path: oldMainPath, branch: "main" });
    }

    // Check for current main memory file in .memory
    const currentMainPath = path.join(this.branchesPath, "memory.json");
    if (await this.fileExists(currentMainPath)) {
      files.push({ path: currentMainPath, branch: "main" });
    }

    // Check for branch files
    if (await this.fileExists(this.branchesPath)) {
      const dirFiles = await fs.readdir(this.branchesPath);
      for (const file of dirFiles) {
        if (
          file.endsWith(".json") &&
          !file.startsWith(".thinking") &&
          file !== "memory.json"
        ) {
          const branchName = file.replace(".json", "");
          const filePath = path.join(this.branchesPath, file);
          files.push({ path: filePath, branch: branchName });
        }
      }
    }

    return files;
  }

  /**
   * Clean up old JSON files after successful migration
   */
  async cleanupAfterMigration(
    filePath: string,
    branchName: string
  ): Promise<void> {
    try {
      // Move to backup instead of deleting
      const backupFile = await this.createMigrationBackup(
        filePath,
        `post_migration_${branchName}`
      );
      await fs.unlink(filePath);
      logger.info(`Moved migrated file ${filePath} to backup: ${backupFile}`);
    } catch (error) {
      logger.error(`Failed to cleanup ${filePath}:`, error);
    }
  }

  /**
   * Validate entity data structure
   */
  validateEntity(entity: any): Entity | null {
    if (!entity.name || !entity.entityType) {
      logger.warn("Invalid entity: missing name or entityType", entity);
      return null;
    }

    // Ensure entityType is not null or empty
    const validEntityType = entity.entityType || "Unknown";

    // Ensure name is not empty or just whitespace
    const validName = (entity.name || "").toString().trim() || "Unnamed Entity";

    return {
      name: validName,
      entityType: validEntityType,
      observations: entity.observations || [],
      status: entity.status || "active",
      statusReason: entity.statusReason,
      lastUpdated: entity.lastUpdated || new Date().toISOString(),
      crossRefs: entity.crossRefs,
    };
  }

  /**
   * Validate relation data structure
   */
  validateRelation(relation: any): Relation | null {
    if (!relation.from || !relation.to || !relation.relationType) {
      logger.warn("Invalid relation: missing required fields", relation);
      return null;
    }

    return {
      from: relation.from,
      to: relation.to,
      relationType: relation.relationType,
    };
  }
}
