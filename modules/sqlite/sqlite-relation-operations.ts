import { Relation } from "../../memory-types.js";
import { logger } from "../logger.js";
import { SQLiteConnection } from "./sqlite-connection.js";

/**
 * SQLite Relation Operations
 * Handles CRUD operations for entity relationships
 */
export class SQLiteRelationOperations {
  constructor(private connection: SQLiteConnection) {}

  async createRelations(
    relations: Relation[],
    branchName?: string
  ): Promise<Relation[]> {
    if (!relations || relations.length === 0) {
      return [];
    }

    const branchId = await this.connection.getBranchId(branchName);
    const createdRelations: Relation[] = [];

    for (const relation of relations) {
      if (!relation.from || !relation.to || !relation.relationType) {
        logger.warn("Skipping invalid relation:", relation);
        continue;
      }

      try {
        // Get entity IDs
        const fromEntity = await this.connection.getQuery(
          "SELECT id FROM entities WHERE name = ? AND branch_id = ?",
          [relation.from, branchId]
        );

        const toEntity = await this.connection.getQuery(
          "SELECT id FROM entities WHERE name = ? AND branch_id = ?",
          [relation.to, branchId]
        );

        if (!fromEntity) {
          logger.warn(
            `From entity "${relation.from}" not found in branch ${
              branchName || "main"
            }`
          );
          continue;
        }

        if (!toEntity) {
          logger.warn(
            `To entity "${relation.to}" not found in branch ${
              branchName || "main"
            }`
          );
          continue;
        }

        // Insert relation (ignore duplicates)
        await this.connection.runQuery(
          `
          INSERT OR IGNORE INTO relations (from_entity_id, to_entity_id, relation_type, branch_id)
          VALUES (?, ?, ?, ?)
          `,
          [fromEntity.id, toEntity.id, relation.relationType, branchId]
        );

        createdRelations.push(relation);
      } catch (error) {
        logger.error(
          `Failed to create relation: ${relation.from} -> ${relation.to}:`,
          error
        );
      }
    }

    logger.info(
      `Created ${createdRelations.length} of ${
        relations.length
      } relations in branch ${branchName || "main"}`
    );
    return createdRelations;
  }

  async deleteRelations(
    relations: Relation[],
    branchName?: string
  ): Promise<void> {
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
          [relation.from, branchId]
        );

        const toEntity = await this.connection.getQuery(
          "SELECT id FROM entities WHERE name = ? AND branch_id = ?",
          [relation.to, branchId]
        );

        if (!fromEntity || !toEntity) {
          continue;
        }

        // Delete relation
        await this.connection.runQuery(
          `
          DELETE FROM relations 
          WHERE from_entity_id = ? AND to_entity_id = ? AND relation_type = ? AND branch_id = ?
          `,
          [fromEntity.id, toEntity.id, relation.relationType, branchId]
        );
      } catch (error) {
        logger.error(
          `Failed to delete relation: ${relation.from} -> ${relation.to}:`,
          error
        );
      }
    }
  }

  async getRelationsForEntities(
    entityNames: string[],
    branchId?: number
  ): Promise<Relation[]> {
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
      [branchId]
    );

    return relationRows.map((row: any) => ({
      from: row.from_name,
      to: row.to_name,
      relationType: row.relation_type,
    }));
  }
}
