/**
 * Modular Enhanced Memory Manager
 * Lightweight orchestrator that delegates to focused modules
 *
 * modular architecture where each module has a single responsibility.
 */

import {
  Entity,
  EntityStatus,
  KnowledgeGraph,
  MemoryBranchInfo,
  Relation,
} from "./memory-types.js";
import { HybridMemoryManager } from "./modules/hybrid-memory-manager.js";

/**
 * Enhanced Memory Manager - Now just a thin wrapper around the hybrid manager
 * Maintains API compatibility while providing cleaner internal architecture
 */
export class EnhancedMemoryManager {
  private hybridManager: HybridMemoryManager;

  constructor() {
    this.hybridManager = new HybridMemoryManager();
  }

  // Core operations - simple delegation
  async initialize(): Promise<void> {
    return await this.hybridManager.initialize();
  }

  async close(): Promise<void> {
    return await this.hybridManager.close();
  }

  // Entity operations
  async createEntities(
    entities: Entity[],
    branchName?: string
  ): Promise<Entity[]> {
    return await this.hybridManager.createEntities(entities, branchName);
  }

  async updateEntity(entity: Entity, branchName?: string): Promise<Entity> {
    return await this.hybridManager.updateEntity(entity, branchName);
  }

  async deleteEntities(
    entityNames: string[],
    branchName?: string
  ): Promise<void> {
    return await this.hybridManager.deleteEntities(entityNames, branchName);
  }

  // Relation operations
  async createRelations(
    relations: Relation[],
    branchName?: string
  ): Promise<Relation[]> {
    return await this.hybridManager.createRelations(relations, branchName);
  }

  async deleteRelations(
    relations: Relation[],
    branchName?: string
  ): Promise<void> {
    return await this.hybridManager.deleteRelations(relations, branchName);
  }

  // Search operations
  async searchEntities(
    query: string,
    branchName?: string,
    includeStatuses?: EntityStatus[]
  ): Promise<KnowledgeGraph> {
    return await this.hybridManager.searchEntities(
      query,
      branchName,
      includeStatuses
    );
  }

  async findEntityByName(
    name: string,
    branchName?: string
  ): Promise<Entity | null> {
    return await this.hybridManager.findEntityByName(name, branchName);
  }

  // Branch operations
  async createBranch(
    branchName: string,
    purpose?: string
  ): Promise<MemoryBranchInfo> {
    return await this.hybridManager.createBranch(branchName, purpose);
  }

  async deleteBranch(branchName: string): Promise<void> {
    return await this.hybridManager.deleteBranch(branchName);
  }

  async listBranches(): Promise<MemoryBranchInfo[]> {
    return await this.hybridManager.listBranches();
  }

  // Export/Import
  async exportBranch(branchName?: string): Promise<KnowledgeGraph> {
    return await this.hybridManager.exportBranch(branchName);
  }

  async importData(data: KnowledgeGraph, branchName?: string): Promise<void> {
    return await this.hybridManager.importData(data, branchName);
  }

  // Utility methods
  async suggestBranch(entityType?: string, content?: string): Promise<string> {
    return await this.hybridManager.suggestBranch(entityType, content);
  }

  // Legacy compatibility methods (maintain exact API)
  async readGraph(
    branchName?: string,
    includeStatuses?: EntityStatus[],
    autoCrossContext: boolean = true
  ): Promise<KnowledgeGraph> {
    return await this.hybridManager.readGraph(
      branchName,
      includeStatuses,
      autoCrossContext
    );
  }

  async searchNodes(
    query: string,
    branchName?: string,
    includeStatuses?: EntityStatus[],
    autoCrossContext: boolean = true
  ): Promise<KnowledgeGraph> {
    return await this.hybridManager.searchNodes(
      query,
      branchName,
      includeStatuses,
      autoCrossContext
    );
  }

  async openNodes(
    names: string[],
    branchName?: string,
    includeStatuses?: EntityStatus[],
    autoCrossContext: boolean = true
  ): Promise<KnowledgeGraph> {
    return await this.hybridManager.openNodes(
      names,
      branchName,
      includeStatuses,
      autoCrossContext
    );
  }

  async addObservations(
    observations: { entityName: string; contents: string[] }[],
    branchName?: string
  ): Promise<{ entityName: string; addedObservations: string[] }[]> {
    return await this.hybridManager.addObservations(observations, branchName);
  }

  async updateEntityStatus(
    entityName: string,
    newStatus: EntityStatus,
    statusReason?: string,
    branchName?: string
  ): Promise<void> {
    return await this.hybridManager.updateEntityStatus(
      entityName,
      newStatus,
      statusReason,
      branchName
    );
  }

  async deleteObservations(
    deletions: { entityName: string; observations: string[] }[],
    branchName?: string
  ): Promise<void> {
    return await this.hybridManager.deleteObservations(deletions, branchName);
  }

  async createCrossReference(
    entityName: string,
    targetBranch: string,
    targetEntityNames: string[],
    sourceBranch?: string
  ): Promise<void> {
    return await this.hybridManager.createCrossReference(
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
    return await this.hybridManager.getCrossContext(entityNames, sourceBranch);
  }
}
