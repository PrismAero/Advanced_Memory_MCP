import { Entity, EntityStatus, Relation } from "../../memory-types.js";
import { logger } from "../logger.js";
import { ModernSimilarityEngine } from "../similarity/similarity-engine.js";
import { jsonResponse, sanitizeEntities } from "./response-utils.js";

/**
 * Search and Query Handlers
 * Handles intelligent search with similarity enhancement
 */
export class SearchHandlers {
  private memoryManager: any;
  private modernSimilarity: ModernSimilarityEngine;

  constructor(memoryManager: any, modernSimilarity: ModernSimilarityEngine) {
    this.memoryManager = memoryManager;
    this.modernSimilarity = modernSimilarity;
  }

  async handleSmartSearch(args: any): Promise<any> {
    if (!args.query) {
      throw new Error("query is required");
    }

    if (!args.branch_name) {
      throw new Error(
        "branch_name is required. Use '*' to search all branches.",
      );
    }

    const searchAllBranches = args.branch_name === "*";
    const branchToSearch = searchAllBranches
      ? undefined
      : (args.branch_name as string);

    // AI-optimized search options
    const includeContext = args.include_context === true;
    const workingContextOnly = args.working_context_only === true;
    const includeConfidenceScores = args.include_confidence_scores === true;
    const expandSimilar = args.expand_similar === true;
    const maxResults =
      typeof args.max_results === "number"
        ? clampInteger(args.max_results, 1, 50, 10)
        : 10;
    const maxRelations =
      typeof args.max_relations === "number"
        ? clampInteger(args.max_relations, 0, 100, 20)
        : 20;

    logger.info(
      `AI-optimized smart search ${
        searchAllBranches
          ? "across all branches"
          : `isolated to branch: "${args.branch_name}"`
      } (context: ${includeContext}, working_only: ${workingContextOnly})`,
    );

    // AI-optimized search with enhanced context awareness
    const searchResults = await this.memoryManager.searchEntities(
      args.query as string,
      branchToSearch,
      args.include_statuses as EntityStatus[],
      {
        includeContext,
        workingContextOnly,
        includeConfidenceScores,
        maxResults,
      },
    );

    // Enhance with similarity engine for related entity detection
    // Disabled by default: broad semantic expansion can swamp precise lookups.
    if (!searchAllBranches && expandSimilar && searchResults.entities.length > 0) {
      logger.info(
        `Smart search enhancing results with similarity detection...`,
      );

      try {
        // If we found entities, use similarity engine to find additional related entities
        const allBranchEntities = await this.memoryManager.readGraph(
          args.branch_name as string,
          args.include_statuses as EntityStatus[],
          false, // Don't include cross-context for similarity processing
        );

        const additionalEntities = new Set<string>();

        // For each found entity, find similar ones that weren't in the original search
        for (const foundEntity of searchResults.entities) {
          const similarEntities =
            await this.modernSimilarity.detectSimilarEntities(
              foundEntity,
              allBranchEntities.entities.filter(
                (e: Entity) =>
                  e.name !== foundEntity.name &&
                  !searchResults.entities.some(
                    (se: Entity) => se.name === e.name,
                  ),
              ),
            );

          // Add medium and high confidence similar entities to context
          for (const match of similarEntities) {
            if (match.confidence === "high" || match.confidence === "medium") {
              additionalEntities.add(match.entity.name);
            }
          }
        }

        // Fetch additional entities and their relations
        if (additionalEntities.size > 0) {
          const additionalResults = await this.memoryManager.openNodes(
            Array.from(additionalEntities),
            args.branch_name as string,
            args.include_statuses as EntityStatus[],
            true,
          );

          // Merge additional entities into search results
          const entityNames = new Set(
            searchResults.entities.map((e: Entity) => e.name),
          );
          const newEntities = additionalResults.entities.filter(
            (e: Entity) => !entityNames.has(e.name),
          );
          const newRelations = additionalResults.relations.filter(
            (r: Relation) =>
              !searchResults.relations.some(
                (sr: Relation) =>
                  sr.from === r.from &&
                  sr.to === r.to &&
                  sr.relationType === r.relationType,
              ),
          );

          const remainingSlots = Math.max(
            0,
            maxResults - searchResults.entities.length,
          );
          searchResults.entities.push(...newEntities.slice(0, remainingSlots));
          searchResults.relations.push(...newRelations);

          logger.info(
            `Smart search added ${newEntities.length} similar entities via similarity engine`,
          );
        }
      } catch (error) {
        logger.warn(
          "Similarity enhancement failed, using standard search results:",
          error,
        );
      }
    }

    const maxObservations =
      typeof args.max_observations === "number"
        ? clampInteger(args.max_observations, 0, 100, 5)
        : 5;

    const returnedEntities = searchResults.entities.slice(0, maxResults);
    const returnedRelations = filterRelationsToReturnedEntities(
      searchResults.relations,
      returnedEntities,
    ).slice(0, maxRelations);

    return jsonResponse({
      entities: sanitizeEntities(returnedEntities, {
        maxObservations,
        keepSearchMeta: includeConfidenceScores,
        compactSearch: true,
      }),
      counts: {
        entities: returnedEntities.length,
        relations: returnedRelations.length,
        total_entities_matched: searchResults.entities.length,
        total_relations_matched: searchResults.relations.length,
      },
      query: args.query,
      branch: args.branch_name,
      relations: returnedRelations,
    });
  }
}

function filterRelationsToReturnedEntities(
  relations: Relation[],
  entities: Entity[],
): Relation[] {
  const names = new Set(entities.map((entity) => entity.name));
  const seen = new Set<string>();
  return (relations || []).filter((relation) => {
    if (!names.has(relation.from) || !names.has(relation.to)) return false;
    const key = `${relation.from}\0${relation.relationType}\0${relation.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function clampInteger(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(numeric)));
}
