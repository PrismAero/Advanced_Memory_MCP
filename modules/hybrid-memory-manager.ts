import { MemoryOptimizer } from "../memory-optimizer.js";
import {
  Entity,
  EntityStatus,
  KnowledgeGraph,
  MemoryBranchInfo,
  OPTIMIZATION_METADATA_SYMBOL,
  OptimizationMetadata,
  Relation,
} from "../memory-types.js";
import { BackupOperations } from "./backup-operations.js";
import { JSONOperations } from "./json-operations.js";
import { logger } from "./logger.js";
import { IMemoryOperations } from "./memory-core.js";
import { MigrationUtils } from "./migration-utils.js";
import { ModularSQLiteOperations } from "./sqlite/index.js";

/**
 * Hybrid Memory Manager - Lightweight Orchestrator
 * Coordinates SQLite, JSON, optimization, and backup operations
 * Much smaller and focused on delegation rather than implementation
 */
export class HybridMemoryManager implements IMemoryOperations {
  private sqliteOps: ModularSQLiteOperations;
  private jsonOps: JSONOperations;
  private migrationUtils: MigrationUtils;
  private backupOps: BackupOperations;
  private optimizer: MemoryOptimizer;
  private useSQLite: boolean = true;
  private migrationInProgress: boolean = false;

  constructor(basePath?: string) {
    // MEMORY_PATH should point to your project root
    // The .memory folder will be created inside it
    const memoryPath =
      basePath || process.env.MEMORY_PATH || process.cwd();

    this.sqliteOps = new ModularSQLiteOperations(memoryPath);
    this.jsonOps = new JSONOperations(memoryPath);
    this.migrationUtils = new MigrationUtils(memoryPath);
    this.backupOps = new BackupOperations(memoryPath);
    this.optimizer = new MemoryOptimizer({
      compressionLevel: "aggressive", // Use aggressive for maximum compression
      extractKeywords: true,
      extractEntities: true,
    });
  }

  async initialize(): Promise<void> {
    // Initialize backup system
    await this.backupOps.initialize();

    if (this.useSQLite) {
      // Initialize SQLite
      await this.sqliteOps.initialize();
      logger.info(
        "Enhanced Memory Manager initialized with SQLite, text optimization, and keyword extraction"
      );

      // Perform migration if needed
      await this.performMigration();
    } else {
      // Initialize JSON
      await this.jsonOps.initialize();
      logger.info(
        "Enhanced Memory Manager initialized with JSON, text optimization, and keyword extraction"
      );
    }
  }

  private async performMigration(): Promise<void> {
    this.migrationInProgress = true;

    try {
      const memoryFiles = await this.migrationUtils.discoverMemoryFiles();

      if (memoryFiles.length === 0) {
        logger.info("No existing memory files found - starting fresh");
        this.migrationInProgress = false;
        return;
      }

      logger.info(`Found ${memoryFiles.length} memory files to migrate`);

      for (const { path: filePath, branch } of memoryFiles) {
        logger.info(`Migrating ${branch} branch from ${filePath}...`);

        // Parse JSON file
        const graph = await this.migrationUtils.parseJsonMemoryFile(filePath);

        if (graph.entities.length > 0 || graph.relations.length > 0) {
          // Import to SQLite
          await this.sqliteOps.importData(graph, branch);
          logger.info(
            `Migrated ${graph.entities.length} entities and ${graph.relations.length} relations to SQLite`
          );

          // Create backup before cleanup
          await this.migrationUtils.createMigrationBackup(filePath, branch);
        }
      }

      logger.info("Migration completed successfully");
    } catch (error) {
      logger.error("Migration failed:", error);
    } finally {
      this.migrationInProgress = false;
    }
  }

  // Delegate to appropriate storage backend
  async createEntities(
    entities: Entity[],
    branchName?: string
  ): Promise<Entity[]> {
    // Don't use SQLite during migration to avoid recursion
    if (this.useSQLite && !this.migrationInProgress) {
      logger.debug(`Using SQLite for entity creation`);

      // Apply optimization before storing
      const optimizedEntities = entities.map((entity) => {
        // Optimize each observation individually for better results
        const optimizedObservations = (entity.observations || []).map((obs) => {
          const optimization = this.optimizer.optimize(obs);
          return optimization.optimized;
        });

        // Also optimize the overall entity content for keyword extraction
        const content = JSON.stringify({
          name: entity.name,
          entityType: entity.entityType,
          observations: entity.observations,
        });

        const optimization = this.optimizer.optimize(content);
        logger.debug(
          `Entity "${entity.name}" optimized: ${
            optimization.originalTokenCount
          } → ${optimization.tokenCount} tokens (${Math.round(
            optimization.compressionRatio * 100
          )}%)`
        );
        logger.debug(`Keywords: ${optimization.keywords.join(", ")}`);

        const optimizationMetadata: OptimizationMetadata = {
          optimizedObservations,
          optimizedContent: optimization.optimized,
          keywords: optimization.keywords,
          entities: optimization.entities,
          compressionRatio: optimization.compressionRatio,
          tokenCount: optimization.tokenCount,
          originalTokenCount: optimization.originalTokenCount,
        };

        return {
          ...entity,
          observations: entity.observations || [],
          status: entity.status || "active",
          lastUpdated: new Date().toISOString(),
          [OPTIMIZATION_METADATA_SYMBOL]: optimizationMetadata,
          _keywordData: {
            keywords: optimization.keywords,
            entities: optimization.entities,
            compressionRatio: optimization.compressionRatio,
          },
        };
      });

      const result = await this.sqliteOps.createEntities(
        optimizedEntities,
        branchName
      );

      // Create backup
      const graph = await this.sqliteOps.exportBranch(branchName);
      await this.backupOps.createBackup(graph, branchName);

      return result;
    } else {
      logger.warn(
        `Using JSON fallback (migration: ${this.migrationInProgress})`
      );
      return await this.jsonOps.createEntities(entities, branchName);
    }
  }

  async updateEntity(entity: Entity, branchName?: string): Promise<Entity> {
    if (this.useSQLite && !this.migrationInProgress) {
      return await this.sqliteOps.updateEntity(entity, branchName);
    } else {
      return await this.jsonOps.updateEntity(entity, branchName);
    }
  }

  async deleteEntities(
    entityNames: string[],
    branchName?: string
  ): Promise<void> {
    if (this.useSQLite && !this.migrationInProgress) {
      return await this.sqliteOps.deleteEntities(entityNames, branchName);
    } else {
      return await this.jsonOps.deleteEntities(entityNames, branchName);
    }
  }

  async createRelations(
    relations: Relation[],
    branchName?: string
  ): Promise<Relation[]> {
    if (this.useSQLite && !this.migrationInProgress) {
      return await this.sqliteOps.createRelations(relations, branchName);
    } else {
      return await this.jsonOps.createRelations(relations, branchName);
    }
  }

  async deleteRelations(
    relations: Relation[],
    branchName?: string
  ): Promise<void> {
    if (this.useSQLite && !this.migrationInProgress) {
      return await this.sqliteOps.deleteRelations(relations, branchName);
    } else {
      return await this.jsonOps.deleteRelations(relations, branchName);
    }
  }

  async searchEntities(
    query: string,
    branchName?: string,
    includeStatuses?: EntityStatus[]
  ): Promise<KnowledgeGraph> {
    if (this.useSQLite && !this.migrationInProgress) {
      return await this.sqliteOps.searchEntities(
        query,
        branchName,
        includeStatuses
      );
    } else {
      return await this.jsonOps.searchEntities(
        query,
        branchName,
        includeStatuses
      );
    }
  }

  async findEntityByName(
    name: string,
    branchName?: string
  ): Promise<Entity | null> {
    if (this.useSQLite && !this.migrationInProgress) {
      return await this.sqliteOps.findEntityByName(name, branchName);
    } else {
      return await this.jsonOps.findEntityByName(name, branchName);
    }
  }

  async createBranch(
    branchName: string,
    purpose?: string
  ): Promise<MemoryBranchInfo> {
    if (this.useSQLite && !this.migrationInProgress) {
      return await this.sqliteOps.createBranch(branchName, purpose);
    } else {
      return await this.jsonOps.createBranch(branchName, purpose);
    }
  }

  async deleteBranch(branchName: string): Promise<void> {
    if (this.useSQLite && !this.migrationInProgress) {
      return await this.sqliteOps.deleteBranch(branchName);
    } else {
      return await this.jsonOps.deleteBranch(branchName);
    }
  }

  async listBranches(): Promise<MemoryBranchInfo[]> {
    if (this.useSQLite && !this.migrationInProgress) {
      return await this.sqliteOps.listBranches();
    } else {
      return await this.jsonOps.listBranches();
    }
  }

  async exportBranch(branchName?: string): Promise<KnowledgeGraph> {
    if (this.useSQLite && !this.migrationInProgress) {
      return await this.sqliteOps.exportBranch(branchName);
    } else {
      return await this.jsonOps.exportBranch(branchName);
    }
  }

  async importData(data: KnowledgeGraph, branchName?: string): Promise<void> {
    if (this.useSQLite && !this.migrationInProgress) {
      return await this.sqliteOps.importData(data, branchName);
    } else {
      return await this.jsonOps.importData(data, branchName);
    }
  }

  async close(): Promise<void> {
    // Clean up old backups before closing
    await this.backupOps.cleanupBackups(5);

    if (this.useSQLite) {
      await this.sqliteOps.close();
    }
    await this.jsonOps.close();

    logger.info("Hybrid Memory Manager closed");
  }

  // Utility methods
  async suggestBranch(entityType?: string, content?: string): Promise<string> {
    return await this.sqliteOps.suggestBranch(entityType, content);
  }

  // Legacy compatibility methods for existing API
  async readGraph(
    branchName?: string,
    includeStatuses?: EntityStatus[],
    autoCrossContext: boolean = true
  ): Promise<KnowledgeGraph> {
    return await this.exportBranch(branchName);
  }

  async searchNodes(
    query: string,
    branchName?: string,
    includeStatuses?: EntityStatus[],
    autoCrossContext: boolean = true
  ): Promise<KnowledgeGraph> {
    return await this.searchEntities(query, branchName, includeStatuses);
  }

  async openNodes(
    names: string[],
    branchName?: string,
    includeStatuses?: EntityStatus[],
    autoCrossContext: boolean = true
  ): Promise<KnowledgeGraph> {
    // Use direct entity lookup instead of search
    const foundEntities: Entity[] = [];
    const allRelations: Relation[] = [];

    for (const name of names) {
      // Use findEntityByName for exact lookup
      const entity = await this.findEntityByName(name, branchName);

      if (entity) {
        // Check status filter if provided
        if (
          !includeStatuses ||
          includeStatuses.includes(entity.status as EntityStatus)
        ) {
          foundEntities.push(entity);

          // Get all relations involving this entity from the full branch
          const branchGraph = await this.exportBranch(branchName);
          const entityRelations = branchGraph.relations.filter(
            (r) => r.from === name || r.to === name
          );
          allRelations.push(...entityRelations);
        }
      }
    }

    // Remove duplicate relations
    const uniqueRelations = allRelations.filter(
      (relation, index, arr) =>
        arr.findIndex(
          (r) =>
            r.from === relation.from &&
            r.to === relation.to &&
            r.relationType === relation.relationType
        ) === index
    );

    return { entities: foundEntities, relations: uniqueRelations };
  }

  // Additional compatibility methods
  async addObservations(
    observations: { entityName: string; contents: string[] }[],
    branchName?: string
  ): Promise<{ entityName: string; addedObservations: string[] }[]> {
    if (this.useSQLite && !this.migrationInProgress) {
      return await this.sqliteOps.addObservations(observations, branchName);
    } else {
      return await this.jsonOps.addObservations(observations, branchName);
    }
  }

  async deleteObservations(
    deletions: { entityName: string; observations: string[] }[],
    branchName?: string
  ): Promise<void> {
    if (this.useSQLite && !this.migrationInProgress) {
      return await this.sqliteOps.deleteObservations(deletions, branchName);
    } else {
      return await this.jsonOps.deleteObservations(deletions, branchName);
    }
  }

  async updateEntityStatus(
    entityName: string,
    newStatus: EntityStatus,
    statusReason?: string,
    branchName?: string
  ): Promise<void> {
    const entity = await this.findEntityByName(entityName, branchName);
    if (!entity) {
      throw new Error(`Entity "${entityName}" not found`);
    }

    const updatedEntity = {
      ...entity,
      status: newStatus,
      statusReason,
      lastUpdated: new Date().toISOString(),
    };

    await this.updateEntity(updatedEntity, branchName);
  }

  async createCrossReference(
    entityName: string,
    targetBranch: string,
    targetEntityNames: string[],
    sourceBranch?: string
  ): Promise<void> {
    if (this.useSQLite && !this.migrationInProgress) {
      return await this.sqliteOps.createCrossReference(
        entityName,
        targetBranch,
        targetEntityNames,
        sourceBranch
      );
    } else {
      return await this.jsonOps.createCrossReference(
        entityName,
        targetBranch,
        targetEntityNames,
        sourceBranch
      );
    }
  }

  async getCrossContext(
    entityNames: string[],
    sourceBranch?: string
  ): Promise<KnowledgeGraph> {
    if (entityNames.length > 0) {
      return await this.searchEntities(entityNames.join(" "), sourceBranch);
    } else {
      return await this.exportBranch(sourceBranch);
    }
  }
}
