import { Entity, EntityStatus, KnowledgeGraph } from "../../memory-types.js";
import { SQLiteConnection } from "./sqlite-connection.js";
import { SQLiteEntityOperations } from "./sqlite-entity-operations.js";
import { SQLiteRelationOperations } from "./sqlite-relation-operations.js";

/**
 * SQLite Search Operations
 * Handles search and query operations for entities and relations
 */
export class SQLiteSearchOperations {
  constructor(
    private connection: SQLiteConnection,
    private entityOps: SQLiteEntityOperations,
    private relationOps: SQLiteRelationOperations
  ) {}

  async searchEntities(
    query: string,
    branchName?: string,
    includeStatuses?: EntityStatus[]
  ): Promise<KnowledgeGraph> {
    const entities = await this.performSearch(
      query,
      branchName,
      includeStatuses
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
        branchId
      );
    }

    return { entities, relations };
  }

  private async performSearch(
    query: string,
    branchName?: string,
    includeStatuses?: EntityStatus[]
  ): Promise<Entity[]> {
    const branchId = branchName
      ? await this.connection.getBranchId(branchName)
      : null;

    // Word boundary search for more precise matching
    // Match whole words or parts of compound words
    const searchPattern = `%${query}%`;
    const wordBoundaryPattern = `% ${query} %`; // Exact word with spaces
    
    let whereClause =
      "WHERE (e.name LIKE ? OR e.name LIKE ? OR e.entity_type LIKE ? OR e.original_content LIKE ? OR e.original_content LIKE ? OR o.content LIKE ? OR o.content LIKE ?)";
    let params: any[] = [
      searchPattern, wordBoundaryPattern, // name
      searchPattern, // entity_type
      searchPattern, wordBoundaryPattern, // original_content
      searchPattern, wordBoundaryPattern  // observations
    ];

    if (branchId) {
      whereClause += " AND e.branch_id = ?";
      params.push(branchId);
    }

    // Add status filtering
    const statuses =
      includeStatuses && includeStatuses.length > 0
        ? includeStatuses
        : ["active"];
    whereClause += ` AND e.status IN (${statuses.map(() => "?").join(",")})`;
    params.push(...statuses);

    const results = await this.connection.runQuery(
      `
      SELECT DISTINCT e.*, GROUP_CONCAT(o.content, '|') as observations
      FROM entities e
      LEFT JOIN observations o ON e.id = o.entity_id
      ${whereClause}
      GROUP BY e.id
      ORDER BY e.last_accessed DESC
    `,
      params
    );

    return this.entityOps.convertRowsToEntities(results);
  }
}
