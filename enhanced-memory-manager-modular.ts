/**
 * Modular Enhanced Memory Manager
 * Lightweight orchestrator using SQLite storage with optimization
 *
 * Modular architecture where each module has a single responsibility.
 */

import {
  Entity,
  EntityStatus,
  KnowledgeGraph,
  MemoryBranchInfo,
  Relation,
} from "./memory-types.js";
import { HybridMemoryManager } from "./modules/hybrid-memory-manager.js";
import { ModernSimilarityEngine } from "./modules/similarity/similarity-engine.js";
import { SQLiteConnection } from "./modules/sqlite/sqlite-connection.js";

/**
 * Enhanced Memory Manager - Thin wrapper around the SQLite memory manager
 * Maintains API compatibility while providing cleaner internal architecture
 */
export class EnhancedMemoryManager {
  private sqliteManager: HybridMemoryManager;

  constructor(
    similarityEngine?: ModernSimilarityEngine,
    sharedConnection?: SQLiteConnection,
  ) {
    this.sqliteManager = new HybridMemoryManager(
      undefined,
      similarityEngine,
      sharedConnection,
    );
  }

  // Core operations - simple delegation
  async initialize(): Promise<void> {
    return await this.sqliteManager.initialize();
  }

  async close(): Promise<void> {
    return await this.sqliteManager.close();
  }

  // Entity operations
  async createEntities(
    entities: Entity[],
    branchName?: string,
  ): Promise<Entity[]> {
    return await this.sqliteManager.createEntities(entities, branchName);
  }

  async updateEntity(entity: Entity, branchName?: string): Promise<Entity> {
    return await this.sqliteManager.updateEntity(entity, branchName);
  }

  async deleteEntities(
    entityNames: string[],
    branchName?: string,
  ): Promise<void> {
    return await this.sqliteManager.deleteEntities(entityNames, branchName);
  }

  // Relation operations
  async createRelations(
    relations: Relation[],
    branchName?: string,
  ): Promise<Relation[]> {
    return await this.sqliteManager.createRelations(relations, branchName);
  }

  async deleteRelations(
    relations: Relation[],
    branchName?: string,
  ): Promise<void> {
    return await this.sqliteManager.deleteRelations(relations, branchName);
  }

  // Search operations
  async searchEntities(
    query: string,
    branchName?: string,
    includeStatuses?: EntityStatus[],
    options?: {
      includeContext?: boolean;
      workingContextOnly?: boolean;
      includeConfidenceScores?: boolean;
    },
  ): Promise<KnowledgeGraph & { confidence_scores?: any[] }> {
    return await this.sqliteManager.searchEntities(
      query,
      branchName,
      includeStatuses,
      options,
    );
  }

  async findEntityByName(
    name: string,
    branchName?: string,
  ): Promise<Entity | null> {
    return await this.sqliteManager.findEntityByName(name, branchName);
  }

  // Branch operations
  async createBranch(
    branchName: string,
    purpose?: string,
  ): Promise<MemoryBranchInfo> {
    return await this.sqliteManager.createBranch(branchName, purpose);
  }

  async deleteBranch(branchName: string): Promise<void> {
    return await this.sqliteManager.deleteBranch(branchName);
  }

  async listBranches(): Promise<MemoryBranchInfo[]> {
    return await this.sqliteManager.listBranches();
  }

  // Export/Import
  async exportBranch(branchName?: string): Promise<KnowledgeGraph> {
    return await this.sqliteManager.exportBranch(branchName);
  }

  async importData(data: KnowledgeGraph, branchName?: string): Promise<void> {
    return await this.sqliteManager.importData(data, branchName);
  }

  // Utility methods
  async suggestBranch(entityType?: string, content?: string): Promise<string> {
    return await this.sqliteManager.suggestBranch(entityType, content);
  }

  // Legacy compatibility methods (maintain exact API)
  async readGraph(
    branchName?: string,
    includeStatuses?: EntityStatus[],
    autoCrossContext: boolean = true,
  ): Promise<KnowledgeGraph> {
    return await this.sqliteManager.readGraph(
      branchName,
      includeStatuses,
      autoCrossContext,
    );
  }

  async searchNodes(
    query: string,
    branchName?: string,
    includeStatuses?: EntityStatus[],
    autoCrossContext: boolean = true,
  ): Promise<KnowledgeGraph> {
    return await this.sqliteManager.searchNodes(
      query,
      branchName,
      includeStatuses,
      autoCrossContext,
    );
  }

  async openNodes(
    names: string[],
    branchName?: string,
    includeStatuses?: EntityStatus[],
    autoCrossContext: boolean = true,
  ): Promise<KnowledgeGraph> {
    return await this.sqliteManager.openNodes(
      names,
      branchName,
      includeStatuses,
      autoCrossContext,
    );
  }

  async addObservations(
    observations: { entityName: string; contents: string[] }[],
    branchName?: string,
  ): Promise<{ entityName: string; addedObservations: string[] }[]> {
    return await this.sqliteManager.addObservations(observations, branchName);
  }

  async updateEntityStatus(
    entityName: string,
    newStatus: EntityStatus,
    statusReason?: string,
    branchName?: string,
  ): Promise<void> {
    return await this.sqliteManager.updateEntityStatus(
      entityName,
      newStatus,
      statusReason,
      branchName,
    );
  }

  async deleteObservations(
    deletions: { entityName: string; observations: string[] }[],
    branchName?: string,
  ): Promise<void> {
    return await this.sqliteManager.deleteObservations(deletions, branchName);
  }

  async createCrossReference(
    entityName: string,
    targetBranch: string,
    targetEntityNames: string[],
    sourceBranch?: string,
  ): Promise<void> {
    return await this.sqliteManager.createCrossReference(
      entityName,
      targetBranch,
      targetEntityNames,
      sourceBranch,
    );
  }

  async getCrossContext(
    entityNames: string[],
    sourceBranch?: string,
  ): Promise<KnowledgeGraph> {
    return await this.sqliteManager.getCrossContext(entityNames, sourceBranch);
  }

  // AI Enhancement Methods - for background processor and relevance scoring
  async updateEntityRelevanceScore(
    entityName: string,
    score: number,
    branchName?: string,
  ): Promise<void> {
    return await this.sqliteManager.updateEntityRelevanceScore(
      entityName,
      score,
      branchName,
    );
  }

  async updateEntityWorkingContext(
    entityName: string,
    isWorkingContext: boolean,
    branchName?: string,
  ): Promise<void> {
    return await this.sqliteManager.updateEntityWorkingContext(
      entityName,
      isWorkingContext,
      branchName,
    );
  }

  async updateEntityLastAccessed(
    entityName: string,
    branchName?: string,
  ): Promise<void> {
    return await this.sqliteManager.updateEntityLastAccessed(
      entityName,
      branchName,
    );
  }
}
