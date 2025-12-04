import path from "path";
import {
  Entity,
  EntityStatus,
  KnowledgeGraph,
  MemoryBranchInfo,
  Relation,
} from "../memory-types.js";

/**
 * Core Memory Interface - defines the contract for all memory operations
 */
export interface IMemoryOperations {
  // Entity operations
  createEntities(entities: Entity[], branchName?: string): Promise<Entity[]>;
  updateEntity(entity: Entity, branchName?: string): Promise<Entity>;
  deleteEntities(entityNames: string[], branchName?: string): Promise<void>;

  // Relation operations
  createRelations(
    relations: Relation[],
    branchName?: string
  ): Promise<Relation[]>;
  deleteRelations(relations: Relation[], branchName?: string): Promise<void>;

  // Search operations
  searchEntities(
    query: string,
    branchName?: string,
    includeStatuses?: EntityStatus[]
  ): Promise<KnowledgeGraph>;
  findEntityByName(name: string, branchName?: string): Promise<Entity | null>;

  // Branch operations
  createBranch(branchName: string, purpose?: string): Promise<MemoryBranchInfo>;
  deleteBranch(branchName: string): Promise<void>;
  listBranches(): Promise<MemoryBranchInfo[]>;

  // Export/Import
  exportBranch(branchName?: string): Promise<KnowledgeGraph>;
  importData(data: KnowledgeGraph, branchName?: string): Promise<void>;

  // Lifecycle
  initialize(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Base Memory Manager - common functionality
 */
export abstract class BaseMemoryManager implements IMemoryOperations {
  protected basePath: string;
  protected branchesPath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
    this.branchesPath = path.join(this.basePath, ".memory");
  }

  // Branch path resolution
  protected getBranchPath(branchName?: string): string {
    if (!branchName || branchName === "main") {
      return path.join(this.branchesPath, "memory.json");
    }
    return path.join(this.branchesPath, `${branchName}.json`);
  }

  // Smart branch suggestion
  suggestBranch(entityType?: string, content?: string): string {
    if (!entityType && !content) return "main";

    const lower = `${entityType || ""} ${content || ""}`.toLowerCase();

    if (
      lower.includes("api") ||
      lower.includes("documentation") ||
      lower.includes("guide") ||
      lower.includes("tutorial") ||
      lower.includes("example") ||
      lower.includes("code") ||
      lower.includes("technical") ||
      lower.includes("spec") ||
      lower.includes("readme")
    ) {
      return "docs";
    }

    if (
      lower.includes("marketing") ||
      lower.includes("campaign") ||
      lower.includes("user story") ||
      lower.includes("feature") ||
      lower.includes("product") ||
      lower.includes("customer") ||
      lower.includes("business") ||
      lower.includes("brand") ||
      lower.includes("copy")
    ) {
      return "marketing";
    }

    if (
      lower.includes("ui") ||
      lower.includes("component") ||
      lower.includes("frontend") ||
      lower.includes("react") ||
      lower.includes("vue") ||
      lower.includes("angular") ||
      lower.includes("css") ||
      lower.includes("html")
    ) {
      return "frontend";
    }

    if (
      lower.includes("api") ||
      lower.includes("backend") ||
      lower.includes("server") ||
      lower.includes("database") ||
      lower.includes("service") ||
      lower.includes("endpoint")
    ) {
      return "backend";
    }

    return "main";
  }

  // Abstract methods to be implemented by concrete classes
  abstract createEntities(
    entities: Entity[],
    branchName?: string
  ): Promise<Entity[]>;
  abstract updateEntity(entity: Entity, branchName?: string): Promise<Entity>;
  abstract deleteEntities(
    entityNames: string[],
    branchName?: string
  ): Promise<void>;
  abstract createRelations(
    relations: Relation[],
    branchName?: string
  ): Promise<Relation[]>;
  abstract deleteRelations(
    relations: Relation[],
    branchName?: string
  ): Promise<void>;
  abstract searchEntities(
    query: string,
    branchName?: string,
    includeStatuses?: EntityStatus[]
  ): Promise<KnowledgeGraph>;
  abstract findEntityByName(
    name: string,
    branchName?: string
  ): Promise<Entity | null>;
  abstract createBranch(
    branchName: string,
    purpose?: string
  ): Promise<MemoryBranchInfo>;
  abstract deleteBranch(branchName: string): Promise<void>;
  abstract listBranches(): Promise<MemoryBranchInfo[]>;
  abstract exportBranch(branchName?: string): Promise<KnowledgeGraph>;
  abstract importData(data: KnowledgeGraph, branchName?: string): Promise<void>;
  abstract initialize(): Promise<void>;
  abstract close(): Promise<void>;
}
