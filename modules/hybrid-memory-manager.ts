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
import { logger } from "./logger.js";
import { IMemoryOperations } from "./memory-core.js";
import { ModernSimilarityEngine } from "./similarity/similarity-engine.js";
import { ModularSQLiteOperations } from "./sqlite/index.js";

/**
 * SQLite Memory Manager - Lightweight SQLite-only storage
 * Focused on SQLite operations with text optimization
 */
export class HybridMemoryManager implements IMemoryOperations {
  private sqliteOps: ModularSQLiteOperations;
  private optimizer: MemoryOptimizer;

  constructor(basePath?: string, similarityEngine?: ModernSimilarityEngine) {
    // MEMORY_PATH should point to your project root
    // The .memory folder will be created inside it
    const memoryPath = basePath || process.env.MEMORY_PATH || process.cwd();

    this.sqliteOps = new ModularSQLiteOperations(memoryPath, similarityEngine);
    this.optimizer = new MemoryOptimizer({
      compressionLevel: "aggressive", // Use aggressive for maximum compression
      extractKeywords: true,
      extractEntities: true,
    });
  }

  async initialize(): Promise<void> {
    // Initialize SQLite
    await this.sqliteOps.initialize();
    logger.info(
      "SQLite Memory Manager initialized with text optimization and keyword extraction"
    );
  }

  // SQLite storage operations with optimization
  async createEntities(
    entities: Entity[],
    branchName?: string
  ): Promise<Entity[]> {
    logger.debug(`Creating entities in SQLite`);

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

    return await this.sqliteOps.createEntities(optimizedEntities, branchName);
  }

  async updateEntity(entity: Entity, branchName?: string): Promise<Entity> {
    return await this.sqliteOps.updateEntity(entity, branchName);
  }

  async deleteEntities(
    entityNames: string[],
    branchName?: string
  ): Promise<void> {
    return await this.sqliteOps.deleteEntities(entityNames, branchName);
  }

  async createRelations(
    relations: Relation[],
    branchName?: string
  ): Promise<Relation[]> {
    return await this.sqliteOps.createRelations(relations, branchName);
  }

  async deleteRelations(
    relations: Relation[],
    branchName?: string
  ): Promise<void> {
    return await this.sqliteOps.deleteRelations(relations, branchName);
  }

  async searchEntities(
    query: string,
    branchName?: string,
    includeStatuses?: EntityStatus[]
  ): Promise<KnowledgeGraph> {
    return await this.sqliteOps.searchEntities(
      query,
      branchName,
      includeStatuses
    );
  }

  async findEntityByName(
    name: string,
    branchName?: string
  ): Promise<Entity | null> {
    return await this.sqliteOps.findEntityByName(name, branchName);
  }

  async createBranch(
    branchName: string,
    purpose?: string
  ): Promise<MemoryBranchInfo> {
    return await this.sqliteOps.createBranch(branchName, purpose);
  }

  async deleteBranch(branchName: string): Promise<void> {
    return await this.sqliteOps.deleteBranch(branchName);
  }

  async listBranches(): Promise<MemoryBranchInfo[]> {
    return await this.sqliteOps.listBranches();
  }

  async exportBranch(branchName?: string): Promise<KnowledgeGraph> {
    return await this.sqliteOps.exportBranch(branchName);
  }

  async importData(data: KnowledgeGraph, branchName?: string): Promise<void> {
    return await this.sqliteOps.importData(data, branchName);
  }

  async close(): Promise<void> {
    await this.sqliteOps.close();
    logger.info("SQLite Memory Manager closed");
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
    return await this.sqliteOps.addObservations(observations, branchName);
  }

  async deleteObservations(
    deletions: { entityName: string; observations: string[] }[],
    branchName?: string
  ): Promise<void> {
    return await this.sqliteOps.deleteObservations(deletions, branchName);
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
    return await this.sqliteOps.createCrossReference(
      entityName,
      targetBranch,
      targetEntityNames,
      sourceBranch
    );
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
