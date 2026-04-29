import { Relation } from "../../memory-types.js";
import { logger } from "../logger.js";
import { KeywordOperations } from "./keyword-operations.js";
import { SQLiteConnection } from "./sqlite-connection.js";

/**
 * SQLite Relation Operations
 * Handles CRUD operations for entity relationships
 */
export class SQLiteRelationOperations {
  private keywordOps: KeywordOperations;

  constructor(private connection: SQLiteConnection) {
    this.keywordOps = new KeywordOperations(connection);
  }

  async createRelations(relations: Relation[], branchName?: string): Promise<Relation[]> {
    if (!relations || relations.length === 0) {
      return [];
    }

    const branchId = await this.connection.getBranchId(branchName);
    const createdRelations: Relation[] = [];
    const validRelations = relations.filter((relation) => {
      const isValid = relation.from && relation.to && relation.relationType;
      if (!isValid) logger.warn("Skipping invalid relation:", relation);
      return isValid;
    });

    if (validRelations.length === 0) return [];

    const entityNames = Array.from(
      new Set(validRelations.flatMap((relation) => [relation.from, relation.to])),
    );
    const placeholders = entityNames.map(() => "?").join(",");
    const entityRows = await this.connection.runQuery(
      `SELECT id, name FROM entities WHERE branch_id = ? AND name IN (${placeholders})`,
      [branchId, ...entityNames],
    );
    const entityIds = new Map<string, number>(
      (entityRows || []).map((row: any) => [row.name, row.id]),
    );

    await this.connection.withTransaction(async () => {
      for (const relation of validRelations) {
        const fromEntityId = entityIds.get(relation.from);
        const toEntityId = entityIds.get(relation.to);

        if (!fromEntityId) {
          logger.warn(`From entity "${relation.from}" not found in branch ${branchName || "main"}`);
          continue;
        }

        if (!toEntityId) {
          logger.warn(`To entity "${relation.to}" not found in branch ${branchName || "main"}`);
          continue;
        }

        await this.connection.execute(
          `
          INSERT OR IGNORE INTO relations (from_entity_id, to_entity_id, relation_type, branch_id)
          VALUES (?, ?, ?, ?)
          `,
          [fromEntityId, toEntityId, relation.relationType, branchId],
        );

        createdRelations.push(relation);
      }
    });

    for (const relation of createdRelations) {
      const fromEntityId = entityIds.get(relation.from);
      const toEntityId = entityIds.get(relation.to);
      if (!fromEntityId || !toEntityId) continue;
      const relationRow = await this.connection.getQuery(
        "SELECT id FROM relations WHERE from_entity_id = ? AND to_entity_id = ? AND relation_type = ? AND branch_id = ?",
        [fromEntityId, toEntityId, relation.relationType, branchId],
      );
      if (relationRow?.id) {
        await this.keywordOps.addRelationKeywords(
          relationRow.id,
          branchId,
          fromEntityId,
          toEntityId,
          `${relation.from} ${relation.relationType} ${relation.to}`,
        );
      }
    }

    // Demoted from INFO to DEBUG: this fires for every batch of
    // relations (including auto-detected pairs) and was the source
    // of "Created 1 of 1 relations" log spam in large workspaces.
    // Operators who want the visibility can still get it via
    // LOG_LEVEL=debug.
    logger.debug(
      `Created ${createdRelations.length} of ${
        relations.length
      } relations in branch ${branchName || "main"}`,
    );
    return createdRelations;
  }

  async deleteRelations(relations: Relation[], branchName?: string): Promise<void> {
    if (!relations || relations.length === 0) {
      return;
    }

    const branchId = await this.connection.getBranchId(branchName);

    for (const relation of relations) {
      if (!relation.from || !relation.to || !relation.relationType) {
        logger.warn("Skipping invalid relation for deletion:", relation);
        continue;
      }

      try {
        // Get entity IDs
        const fromEntity = await this.connection.getQuery(
          "SELECT id FROM entities WHERE name = ? AND branch_id = ?",
          [relation.from, branchId],
        );

        const toEntity = await this.connection.getQuery(
          "SELECT id FROM entities WHERE name = ? AND branch_id = ?",
          [relation.to, branchId],
        );

        if (!fromEntity || !toEntity) {
          continue;
        }

        // Delete relation
        await this.connection.execute(
          `
          DELETE FROM relations 
          WHERE from_entity_id = ? AND to_entity_id = ? AND relation_type = ? AND branch_id = ?
          `,
          [fromEntity.id, toEntity.id, relation.relationType, branchId],
        );
      } catch (error) {
        logger.error(`Failed to delete relation: ${relation.from} -> ${relation.to}:`, error);
      }
    }
  }

  async getRelationsForEntities(entityNames: string[], branchId?: number): Promise<Relation[]> {
    if (!entityNames || entityNames.length === 0) {
      return [];
    }

    const placeholders = entityNames.map(() => "?").join(",");

    let relationQuery = `
      SELECT r.relation_type, ef.name as from_name, et.name as to_name
      FROM relations r
      JOIN entities ef ON r.from_entity_id = ef.id
      JOIN entities et ON r.to_entity_id = et.id
      WHERE (ef.name IN (${placeholders}) OR et.name IN (${placeholders}))
    `;

    const params: any[] = [...entityNames, ...entityNames];

    if (branchId) {
      relationQuery += `
        AND r.branch_id = ?`;
      params.push(branchId);
    }

    const relationRows = await this.connection.runQuery(relationQuery, params);

    return relationRows.map((row: any) => ({
      from: row.from_name,
      to: row.to_name,
      relationType: row.relation_type,
    }));
  }

  async getAllRelationsForBranch(branchId: number): Promise<Relation[]> {
    const relationRows = await this.connection.runQuery(
      `
      SELECT r.relation_type, ef.name as from_name, et.name as to_name
      FROM relations r
      JOIN entities ef ON r.from_entity_id = ef.id
      JOIN entities et ON r.to_entity_id = et.id
      WHERE r.branch_id = ?
    `,
      [branchId],
    );

    return relationRows.map((row: any) => ({
      from: row.from_name,
      to: row.to_name,
      relationType: row.relation_type,
    }));
  }
}
