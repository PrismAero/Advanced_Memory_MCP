import { Entity, EntityStatus, KnowledgeGraph } from "../../memory-types.js";
import { logger } from "../logger.js";
import { ModernSimilarityEngine } from "../similarity/similarity-engine.js";
import { KeywordOperations } from "./keyword-operations.js";
import { SQLiteConnection } from "./sqlite-connection.js";
import { SQLiteEntityOperations } from "./sqlite-entity-operations.js";
import { SQLiteRelationOperations } from "./sqlite-relation-operations.js";

/**
 * Enhanced SQLite Search Operations with TensorFlow.js Semantic Search
 * Combines traditional text search with embedding-based semantic search
 */
export class SQLiteSearchOperations {
  private keywordOps: KeywordOperations;

  constructor(
    private connection: SQLiteConnection,
    private entityOps: SQLiteEntityOperations,
    private relationOps: SQLiteRelationOperations,
    private similarityEngine?: ModernSimilarityEngine,
  ) {
    this.keywordOps = new KeywordOperations(connection);
  }

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
    const entities = await this.performSearch(
      query,
      branchName,
      includeStatuses,
      options,
    );

    // Get relations for the found entities
    let relations: any[] = [];
    if (entities.length > 0) {
      const branchId = branchName
        ? await this.connection.getBranchId(branchName)
        : undefined;
      const entityNames = entities.map((e) => e.name);
      relations = await this.relationOps.getRelationsForEntities(
        entityNames,
        branchId,
      );

      // If context expansion is requested, add related entities
      if (options?.includeContext) {
        const contextEntities = await this.getContextualEntities(
          entities,
          branchName,
        );
        entities.push(...contextEntities);

        // Get additional relations for context entities
        const contextEntityNames = contextEntities.map((e) => e.name);
        const contextRelations = await this.relationOps.getRelationsForEntities(
          contextEntityNames,
          branchId,
        );
        relations.push(...contextRelations);
      }
    }

    const result: any = { entities, relations };

    // Add confidence scores if requested
    if (options?.includeConfidenceScores && entities.length > 0) {
      result.confidence_scores = entities.map((entity) => ({
        entity_name: entity.name,
        relevance_score: entity.relevanceScore || 0.5,
        working_context: entity.workingContext || false,
        last_accessed: entity.lastAccessed,
        keyword_match_score: (entity as any).keywordMatchScore || 0,
        matched_keywords: ((entity as any).matchedKeywords || []).slice(0, 8),
        keyword_sources: ((entity as any).keywordSources || []).slice(0, 8),
      }));
    }

    return result;
  }

  private async performSearch(
    query: string,
    branchName?: string,
    includeStatuses?: EntityStatus[],
    options?: {
      includeContext?: boolean;
      workingContextOnly?: boolean;
      includeConfidenceScores?: boolean;
    },
  ): Promise<Entity[]> {
    const keywordResults = await this.performKeywordSearch(
      query,
      branchName,
      includeStatuses,
      options,
    );

    // Try semantic search first if TensorFlow.js engine is available
    if (this.similarityEngine) {
      try {
        const semanticResults = await this.performSemanticSearch(
          query,
          branchName,
          includeStatuses,
          options,
        );

        // If semantic search finds good results, combine with text search
        if (semanticResults.length > 0) {
          const textResults = await this.performTextSearch(
            query,
            branchName,
            includeStatuses,
            options,
          );

          return this.combineSearchResults(
            semanticResults,
            textResults,
            keywordResults,
          );
        }
      } catch (error) {
        logger.warn(
          "Semantic search failed, falling back to text search:",
          error,
        );
      }
    }

    // Fallback to text-based search
    const textResults = await this.performTextSearch(
      query,
      branchName,
      includeStatuses,
      options,
    );
    return this.combineSearchResults([], textResults, keywordResults);
  }

  /**
   * Perform semantic search using TensorFlow.js embeddings
   */
  private async performSemanticSearch(
    query: string,
    branchName?: string,
    includeStatuses?: EntityStatus[],
    options?: {
      includeContext?: boolean;
      workingContextOnly?: boolean;
      includeConfidenceScores?: boolean;
    },
  ): Promise<Entity[]> {
    if (!this.similarityEngine) {
      throw new Error("Similarity engine not available for semantic search");
    }

    // Get all entities in the branch to search against
    const allEntities = await this.getAllEntitiesForSemanticSearch(
      branchName,
      includeStatuses,
      options?.workingContextOnly,
    );

    if (allEntities.length === 0) {
      return [];
    }

    // Create a query entity for similarity comparison
    const queryEntity: Entity = {
      name: query,
      entityType: "query",
      observations: [query],
    };

    // Use TensorFlow.js similarity engine to find semantic matches
    const similarEntities = await this.similarityEngine.detectSimilarEntities(
      queryEntity,
      allEntities,
    );

    // Filter and sort by semantic similarity
    const semanticResults = similarEntities
      .filter((result) => result.similarity > 0.5) // Threshold for semantic relevance
      .map((result) => {
        // Enhance entity with semantic similarity score
        const entity = { ...result.entity } as any;
        entity.semanticSimilarity = result.similarity;
        entity.semanticConfidence = result.confidence;
        entity.semanticReasoning = result.reasoning;
        return entity;
      })
      .sort((a, b) => {
        // Multi-factor sorting for semantic results
        const scoreA = this.calculateEnhancedScore(a);
        const scoreB = this.calculateEnhancedScore(b);
        return scoreB - scoreA;
      });

    return semanticResults;
  }

  /**
   * Calculate enhanced score combining semantic similarity with other factors
   */
  private calculateEnhancedScore(entity: any): number {
    let score = 0;

    // Semantic similarity (primary factor)
    score += (entity.semanticSimilarity || 0) * 0.4;

    // Relevance score from database
    score += (entity.relevanceScore || 0.5) * 0.2;

    // Working context bonus
    if (entity.workingContext) {
      score += 0.2;
    }

    // Recent access bonus
    if (entity.lastAccessed) {
      const daysSinceAccess =
        (Date.now() - new Date(entity.lastAccessed).getTime()) /
        (1000 * 60 * 60 * 24);
      if (daysSinceAccess < 1) score += 0.1;
      else if (daysSinceAccess < 7) score += 0.05;
    }

    // Confidence bonus
    if (entity.semanticConfidence === "high") score += 0.1;
    else if (entity.semanticConfidence === "medium") score += 0.05;

    return score;
  }

  /**
   * Get all entities for semantic search with filtering
   */
  private async getAllEntitiesForSemanticSearch(
    branchName?: string,
    includeStatuses?: EntityStatus[],
    workingContextOnly?: boolean,
  ): Promise<Entity[]> {
    const branchId = branchName
      ? await this.connection.getBranchId(branchName)
      : null;

    let whereClause = "WHERE 1=1";
    let params: any[] = [];

    if (branchId) {
      whereClause += " AND e.branch_id = ?";
      params.push(branchId);
    }

    if (workingContextOnly) {
      whereClause += " AND e.working_context = 1";
    }

    const statuses = includeStatuses?.length ? includeStatuses : ["active"];
    whereClause += ` AND e.status IN (${statuses.map(() => "?").join(",")})`;
    params.push(...statuses);

    const results = await this.connection.runQuery(
      `
      SELECT e.*, 
             GROUP_CONCAT(o.content, '|') as observations,
             GROUP_CONCAT(o.observation_type, '|') as observation_types,
             GROUP_CONCAT(o.priority, '|') as observation_priorities
      FROM entities e
      LEFT JOIN observations o ON e.id = o.entity_id
      ${whereClause}
      GROUP BY e.id
      ORDER BY e.relevance_score DESC, e.working_context DESC
      LIMIT 200
      `,
      params,
    );

    return this.entityOps.convertRowsToEntities(results);
  }

  /**
   * Combine semantic and text search results intelligently
   */
  private combineSearchResults(
    semanticResults: Entity[],
    textResults: Entity[],
    keywordResults: Entity[] = [],
  ): Entity[] {
    const combined = new Map<string, Entity>();
    const seenNames = new Set<string>();

    // Add semantic results first (higher priority)
    semanticResults.forEach((entity) => {
      if (!seenNames.has(entity.name)) {
        combined.set(entity.name, entity);
        seenNames.add(entity.name);
      }
    });

    this.mergeSearchResults(combined, seenNames, textResults, "text");
    this.mergeSearchResults(combined, seenNames, keywordResults, "keyword");

    // Sort combined results by enhanced scoring
    return Array.from(combined.values()).sort((a, b) => {
      const scoreA = this.calculateCombinedScore(a);
      const scoreB = this.calculateCombinedScore(b);
      return scoreB - scoreA;
    });
  }

  /**
   * Calculate combined score for hybrid results
   */
  private calculateCombinedScore(entity: any): number {
    let score = this.calculateEnhancedScore(entity);

    // Bonus for hybrid matches (both semantic and text)
    if (entity.searchType === "hybrid") {
      score += 0.15;
    }

    // Bonus for text matches
    if (entity.textMatch || entity.searchType === "text") {
      score += 0.1;
    }

    if (entity.keywordMatchScore) {
      score += Math.min(0.35, entity.keywordMatchScore / 20);
    }

    return score;
  }

  private mergeSearchResults(
    combined: Map<string, Entity>,
    seenNames: Set<string>,
    incoming: Entity[],
    searchType: "text" | "keyword",
  ): void {
    incoming.forEach((entity) => {
      const enhancedEntity = entity as any;
      if (!seenNames.has(entity.name)) {
        enhancedEntity.searchType = searchType;
        combined.set(entity.name, enhancedEntity);
        seenNames.add(entity.name);
        return;
      }

      const existing = combined.get(entity.name)! as any;
      if (searchType === "text") {
        existing.textMatch = true;
      }
      if (searchType === "keyword") {
        existing.keywordMatchScore = enhancedEntity.keywordMatchScore;
        existing.matchedKeywords = enhancedEntity.matchedKeywords;
        existing.keywordSources = enhancedEntity.keywordSources;
        existing.keywordCouplings = enhancedEntity.keywordCouplings;
      }
      existing.searchType = "hybrid";
    });
  }

  private async performKeywordSearch(
    query: string,
    branchName?: string,
    includeStatuses?: EntityStatus[],
    options?: {
      includeContext?: boolean;
      workingContextOnly?: boolean;
      includeConfidenceScores?: boolean;
    },
  ): Promise<Entity[]> {
    const branchId = branchName
      ? await this.connection.getBranchId(branchName)
      : null;
    const summaries = await this.keywordOps.findEntityKeywordMatches(query, {
      branchId,
      statuses:
        includeStatuses && includeStatuses.length > 0
          ? includeStatuses
          : ["active"],
      limit: 150,
    });
    if (summaries.size === 0) return [];

    const ids = Array.from(summaries.keys()).slice(0, 50);
    let whereClause = `WHERE e.id IN (${ids.map(() => "?").join(",")})`;
    const params: any[] = [...ids];
    if (options?.workingContextOnly) {
      whereClause += " AND e.working_context = 1";
    }

    const rows = await this.connection.runQuery(
      `
      SELECT DISTINCT e.*,
             GROUP_CONCAT(o.content, '|') as observations,
             GROUP_CONCAT(o.observation_type, '|') as observation_types,
             GROUP_CONCAT(o.priority, '|') as observation_priorities
      FROM entities e
      LEFT JOIN observations o ON e.id = o.entity_id
      ${whereClause}
      GROUP BY e.id
      `,
      params,
    );
    const entityIdsByName = new Map(
      (rows || []).map((row: any) => [row.name, row.id] as const),
    );
    const entities = this.entityOps.convertRowsToEntities(rows);
    for (const entity of entities as any[]) {
      const summary = summaries.get(entityIdsByName.get(entity.name) as number);
      if (!summary) continue;
      entity.keywordMatchScore = summary.keywordMatchScore;
      entity.matchedKeywords = summary.matchedKeywords;
      entity.keywordSources = summary.keywordSources;
      entity.keywordCouplings = summary.keywordCouplings;
    }
    return entities.sort(
      (a: any, b: any) =>
        (b.keywordMatchScore || 0) - (a.keywordMatchScore || 0),
    );
  }

  /**
   * Original text-based search (now separated)
   */
  private async performTextSearch(
    query: string,
    branchName?: string,
    includeStatuses?: EntityStatus[],
    options?: {
      includeContext?: boolean;
      workingContextOnly?: boolean;
      includeConfidenceScores?: boolean;
    },
  ): Promise<Entity[]> {
    const branchId = branchName
      ? await this.connection.getBranchId(branchName)
      : null;

    const trimmedQuery = (query || "").trim();
    const hasQuery = trimmedQuery.length > 0;

    // Word boundary search for more precise matching
    // Match whole words or parts of compound words
    const escapedQuery = escapeLike(trimmedQuery);
    const searchPattern = `%${escapedQuery}%`;
    const wordBoundaryPattern = `% ${escapedQuery} %`;

    let whereClause = "WHERE 1=1";
    let params: any[] = [];

    // Empty query short-circuit: skip the seven LIKE clauses entirely.
    // This is used by context/working-context tools that just want a
    // filtered scan, not a text match.
    if (hasQuery) {
      whereClause +=
        " AND (e.name LIKE ? ESCAPE '\\' OR e.name LIKE ? ESCAPE '\\' OR e.entity_type LIKE ? ESCAPE '\\' OR e.original_content LIKE ? ESCAPE '\\' OR e.original_content LIKE ? ESCAPE '\\' OR o.content LIKE ? ESCAPE '\\' OR o.content LIKE ? ESCAPE '\\')";
      params.push(
        searchPattern,
        wordBoundaryPattern,
        searchPattern,
        searchPattern,
        wordBoundaryPattern,
        searchPattern,
        wordBoundaryPattern,
      );
    }

    if (branchId) {
      whereClause += " AND e.branch_id = ?";
      params.push(branchId);
    }

    // Add working context filtering for AI workflows
    if (options?.workingContextOnly) {
      whereClause += " AND e.working_context = 1";
    }

    // Add status filtering
    const statuses =
      includeStatuses && includeStatuses.length > 0
        ? includeStatuses
        : ["active"];
    whereClause += ` AND e.status IN (${statuses.map(() => "?").join(",")})`;
    params.push(...statuses);

    // Enhanced sorting with AI-specific scoring
    let orderClause = `ORDER BY 
      (COALESCE(e.working_context, 0) * 2) + 
      (COALESCE(e.relevance_score, 0.5)) + 
      (CASE WHEN e.last_accessed > datetime('now', '-1 day') THEN 0.5 ELSE 0 END) DESC,
      e.last_accessed DESC`;

    const results = await this.connection.runQuery(
      `
      SELECT DISTINCT e.*, 
             GROUP_CONCAT(o.content, '|') as observations,
             GROUP_CONCAT(o.observation_type, '|') as observation_types,
             GROUP_CONCAT(o.priority, '|') as observation_priorities
      FROM entities e
      LEFT JOIN observations o ON e.id = o.entity_id
      ${whereClause}
      GROUP BY e.id
      ${orderClause}
    `,
      params,
    );

    return this.entityOps.convertRowsToEntities(results);
  }

  /**
   * Get contextual entities related to the found entities
   * Includes entities that are frequently accessed together or have relationships
   */
  private async getContextualEntities(
    foundEntities: Entity[],
    branchName?: string,
  ): Promise<Entity[]> {
    if (foundEntities.length === 0) return [];

    const branchId = branchName
      ? await this.connection.getBranchId(branchName)
      : null;

    const entityNames = foundEntities.map((e) => e.name);
    let whereClause = `WHERE e.name NOT IN (${entityNames
      .map(() => "?")
      .join(",")})`;
    let params: any[] = [...entityNames];

    if (branchId) {
      whereClause += " AND e.branch_id = ?";
      params.push(branchId);
    }

    // Get entities that are related or have high relevance scores
    whereClause += ` AND (
      e.relevance_score > 0.7 OR 
      e.working_context = 1 OR
      EXISTS (
        SELECT 1 FROM relations r 
        WHERE (r.from_entity_id = e.id OR r.to_entity_id = e.id) 
        AND r.branch_id = COALESCE(?, r.branch_id)
      )
    )`;
    params.push(branchId || null);

    const contextResults = await this.connection.runQuery(
      `
      SELECT DISTINCT e.*, 
             GROUP_CONCAT(o.content, '|') as observations,
             GROUP_CONCAT(o.observation_type, '|') as observation_types,
             GROUP_CONCAT(o.priority, '|') as observation_priorities
      FROM entities e
      LEFT JOIN observations o ON e.id = o.entity_id
      ${whereClause}
      GROUP BY e.id
      ORDER BY e.relevance_score DESC, e.working_context DESC
      LIMIT 10
    `,
      params,
    );

    return this.entityOps.convertRowsToEntities(contextResults);
  }
}

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (match) => `\\${match}`);
}
