import {
  Entity,
  EntityStatus,
  KnowledgeGraph,
  MemoryBranchInfo,
  Relation,
} from "../../memory-types.js";
import { logger } from "../logger.js";
import { IMemoryOperations } from "../memory-core.js";
import { SQLiteBranchOperations } from "./sqlite-branch-operations.js";
import { SQLiteConnection } from "./sqlite-connection.js";
import { SQLiteEntityOperations } from "./sqlite-entity-operations.js";
import { SQLiteRelationOperations } from "./sqlite-relation-operations.js";
import { SQLiteSearchOperations } from "./sqlite-search-operations.js";

/**
 * Modular SQLite Operations Orchestrator
 * Delegates work to focused operation modules
 */
export class ModularSQLiteOperations implements IMemoryOperations {
  private connection: SQLiteConnection;
  private entityOps: SQLiteEntityOperations;
  private relationOps: SQLiteRelationOperations;
  private branchOps: SQLiteBranchOperations;
  private searchOps: SQLiteSearchOperations;

  constructor(basePath: string) {
    this.connection = new SQLiteConnection(basePath);
    this.entityOps = new SQLiteEntityOperations(this.connection);
    this.relationOps = new SQLiteRelationOperations(this.connection);
    this.branchOps = new SQLiteBranchOperations(this.connection);
    this.searchOps = new SQLiteSearchOperations(
      this.connection,
      this.entityOps,
      this.relationOps
    );
  }

  async initialize(): Promise<void> {
    return await this.connection.initialize();
  }

  async close(): Promise<void> {
    return await this.connection.close();
  }

  // Entity operations - delegate to EntityOperations
  async createEntities(
    entities: Entity[],
    branchName?: string
  ): Promise<Entity[]> {
    return await this.entityOps.createEntities(entities, branchName);
  }

  async updateEntity(entity: Entity, branchName?: string): Promise<Entity> {
    return await this.entityOps.updateEntity(entity, branchName);
  }

  async deleteEntities(
    entityNames: string[],
    branchName?: string
  ): Promise<void> {
    return await this.entityOps.deleteEntities(entityNames, branchName);
  }

  async findEntityByName(
    name: string,
    branchName?: string
  ): Promise<Entity | null> {
    return await this.entityOps.findEntityByName(name, branchName);
  }

  // Relation operations - delegate to RelationOperations
  async createRelations(
    relations: Relation[],
    branchName?: string
  ): Promise<Relation[]> {
    return await this.relationOps.createRelations(relations, branchName);
  }

  async deleteRelations(
    relations: Relation[],
    branchName?: string
  ): Promise<void> {
    return await this.relationOps.deleteRelations(relations, branchName);
  }

  // Search operations - delegate to SearchOperations
  async searchEntities(
    query: string,
    branchName?: string,
    includeStatuses?: EntityStatus[]
  ): Promise<KnowledgeGraph> {
    return await this.searchOps.searchEntities(
      query,
      branchName,
      includeStatuses
    );
  }

  // Branch operations - delegate to BranchOperations
  async createBranch(
    branchName: string,
    purpose?: string
  ): Promise<MemoryBranchInfo> {
    return await this.branchOps.createBranch(branchName, purpose);
  }

  async deleteBranch(branchName: string): Promise<void> {
    return await this.branchOps.deleteBranch(branchName);
  }

  async listBranches(): Promise<MemoryBranchInfo[]> {
    return await this.branchOps.listBranches();
  }

  async suggestBranch(entityType?: string, content?: string): Promise<string> {
    return await this.branchOps.suggestBranch(entityType, content);
  }

  // Additional entity operations
  async addObservations(
    observations: { entityName: string; contents: string[] }[],
    branchName?: string
  ): Promise<{ entityName: string; addedObservations: string[] }[]> {
    return await this.entityOps.addObservations(observations, branchName);
  }

  async deleteObservations(
    deletions: { entityName: string; observations: string[] }[],
    branchName?: string
  ): Promise<void> {
    return await this.entityOps.deleteObservations(deletions, branchName);
  }

  async createCrossReference(
    entityName: string,
    targetBranch: string,
    targetEntityNames: string[],
    sourceBranch?: string
  ): Promise<void> {
    return await this.entityOps.createCrossReference(
      entityName,
      targetBranch,
      targetEntityNames,
      sourceBranch
    );
  }

  // Import/Export operations
  async exportBranch(branchName?: string): Promise<KnowledgeGraph> {
    const branchId = await this.connection.getBranchId(branchName);

    // Get entities with observations
    const entityRows = await this.connection.runQuery(
      `
      SELECT e.*, GROUP_CONCAT(o.content, '|') as observations
      FROM entities e
      LEFT JOIN observations o ON e.id = o.entity_id
      WHERE e.branch_id = ?
      GROUP BY e.id
    `,
      [branchId]
    );

    const entities = this.entityOps.convertRowsToEntities(entityRows);
    const relations = await this.relationOps.getAllRelationsForBranch(branchId);

    return { entities, relations };
  }

  async importData(data: KnowledgeGraph, branchName?: string): Promise<void> {
    if (!data) {
      logger.warn("No data provided for import");
      return;
    }

    const branchId = await this.connection.getBranchId(branchName);
    logger.info(
      `Importing data to branch ${branchName || "main"}: ${
        data.entities?.length || 0
      } entities, ${data.relations?.length || 0} relations`
    );

    // Import entities first
    if (data.entities && data.entities.length > 0) {
      await this.entityOps.createEntities(data.entities, branchName);
    }

    // Import relations after entities
    if (data.relations && data.relations.length > 0) {
      await this.relationOps.createRelations(data.relations, branchName);
    }

    // Update branch timestamp
    await this.connection.runQuery(
      "UPDATE memory_branches SET updated_at = ? WHERE id = ?",
      [new Date().toISOString(), branchId]
    );
  }
}
