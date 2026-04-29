import { EnhancedMemoryManager } from "../../enhanced-memory-manager-modular.js";
import { Entity, EntityStatus, Relation } from "../../memory-types.js";
import { logger } from "../logger.js";
import { RelationshipIndexer } from "../relationship-indexer.js";
import { THRESHOLDS } from "../similarity/similarity-config.js";
import { ModernSimilarityEngine } from "../similarity/similarity-engine.js";
import { jsonResponse, sanitizeEntities } from "./response-utils.js";

/**
 * Entity Management Handlers.
 *
 * Note on similarity / auto-relations:
 * The default path is now NON-blocking. Newly created entities are
 * registered with the RelationshipIndexer which computes similarity
 * and stores suggested relations in the background. This keeps the
 * `create_entities` request fast (a previous version loaded the
 * entire branch graph and ran TF.js similarity inline against every
 * existing entity, which was O(N) and slow for large branches).
 *
 * If a caller explicitly opts in via `auto_create_relations: true`
 * AND `sync: true`, we still run synchronous similarity, but with a
 * candidate filter (same entity_type or recently-accessed) instead
 * of scanning every entity in the branch.
 */
export class EntityHandlers {
  private memoryManager: EnhancedMemoryManager;
  private modernSimilarity: ModernSimilarityEngine;
  private relationshipIndexer?: RelationshipIndexer;

  constructor(
    memoryManager: EnhancedMemoryManager,
    modernSimilarity: ModernSimilarityEngine,
    relationshipIndexer?: RelationshipIndexer,
  ) {
    this.memoryManager = memoryManager;
    this.modernSimilarity = modernSimilarity;
    this.relationshipIndexer = relationshipIndexer;
  }

  async handleCreateEntities(args: any): Promise<any> {
    let createBranch = args.branch_name as string;
    if (!createBranch && args.entities && (args.entities as any[]).length > 0) {
      const firstEntity = (args.entities as any[])[0];
      createBranch = await this.memoryManager.suggestBranch(
        firstEntity.entityType,
        firstEntity.observations?.join(" "),
      );
    }

    const createdEntities = await this.memoryManager.createEntities(
      args.entities as Entity[],
      createBranch,
    );

    const autoRelations = args.auto_create_relations !== false;
    const syncMode = args.sync_relations === true;
    let syncResult: any = null;

    if (autoRelations) {
      if (syncMode) {
        syncResult = await this.detectRelationsSync(createdEntities, createBranch);
      } else if (this.relationshipIndexer) {
        for (const entity of createdEntities) {
          this.relationshipIndexer.onEntityCreated(entity.name, createBranch);
        }
      }
    }

    return jsonResponse({
      created_count: createdEntities.length,
      branch: createBranch || "main",
      entities: sanitizeEntities(createdEntities, { maxObservations: 5 }),
      relations_mode: autoRelations ? (syncMode ? "synchronous" : "deferred-to-indexer") : "off",
      ...(syncResult ? { sync_relations: syncResult } : {}),
    });
  }

  /**
   * Synchronous relation detection. Only used when caller explicitly
   * sets `sync_relations: true`. Filters candidates by:
   *   1) same entity_type, or
   *   2) accessed in the last 7 days,
   * which keeps the comparison O(k) instead of O(N).
   */
  private async detectRelationsSync(
    createdEntities: Entity[],
    branch?: string,
  ): Promise<{
    candidates_considered: number;
    relations_created: number;
    relations: Relation[];
  }> {
    try {
      const branchGraph = await this.memoryManager.readGraph(branch, ["active", "draft"], false);
      const allExisting = branchGraph.entities;
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

      const created: Relation[] = [];
      const newNames = new Set(createdEntities.map((e) => e.name));

      for (const newEntity of createdEntities) {
        const candidates = allExisting.filter((e: Entity) => {
          if (newNames.has(e.name)) return false;
          if (e.entityType === newEntity.entityType) return true;
          if (e.lastAccessed && new Date(e.lastAccessed).getTime() > sevenDaysAgo) {
            return true;
          }
          return false;
        });

        if (candidates.length === 0) continue;

        const matches = await this.modernSimilarity.detectSimilarEntities(newEntity, candidates);

        const toCreate: Relation[] = matches
          .filter((m) => m.confidence === "high" || m.similarity > THRESHOLDS.minimum)
          .map((m) => ({
            from: newEntity.name,
            to: m.entity.name,
            relationType: m.suggestedRelationType,
          }));

        if (toCreate.length > 0) {
          await this.memoryManager.createRelations(toCreate, branch);
          created.push(...toCreate);
        }
      }

      // Still notify indexer so it can index the embeddings.
      if (this.relationshipIndexer) {
        for (const e of createdEntities) {
          this.relationshipIndexer.onEntityCreated(e.name, branch);
        }
      }

      return {
        candidates_considered: allExisting.length,
        relations_created: created.length,
        relations: created,
      };
    } catch (err) {
      logger.error("Synchronous relation detection failed:", err);
      return {
        candidates_considered: 0,
        relations_created: 0,
        relations: [],
      };
    }
  }

  async handleAddObservations(args: any): Promise<any> {
    if (!args.observations) {
      throw new Error("observations array is required");
    }
    const results = await this.memoryManager.addObservations(
      args.observations,
      args.branch_name as string,
    );
    return jsonResponse({
      branch: args.branch_name || "main",
      updated_count: Array.isArray(results) ? results.length : 0,
      results,
    });
  }

  async handleUpdateEntityStatus(args: any): Promise<any> {
    if (!args.entity_name || !args.status) {
      throw new Error("entity_name and status are required");
    }
    await this.memoryManager.updateEntityStatus(
      args.entity_name as string,
      args.status as EntityStatus,
      args.status_reason as string,
      args.branch_name as string,
    );
    return jsonResponse({
      updated: true,
      entity_name: args.entity_name,
      new_status: args.status,
      status_reason: args.status_reason,
      branch: args.branch_name || "main",
    });
  }

  async handleDeleteEntities(args: any): Promise<any> {
    if (!args.entity_names) {
      throw new Error("entity_names array is required");
    }
    await this.memoryManager.deleteEntities(
      args.entity_names as string[],
      args.branch_name as string,
    );
    return jsonResponse({
      deleted: true,
      deleted_count: (args.entity_names as string[]).length,
      deleted_entities: args.entity_names,
      branch: args.branch_name || "main",
    });
  }
}
