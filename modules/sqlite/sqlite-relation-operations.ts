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

  /**
   * Clean up orphaned relations (relations pointing to non-existent entities)
   * and duplicate/redundant relations
   */
  async cleanupOrphanedRelations(branchName?: string): Promise<number> {
    const branchId = await this.connection.getBranchId(branchName);

    try {
      // Delete relations where from_entity_id doesn't exist
      const orphanedFromResult = await this.connection.runQuery(
        `
        DELETE FROM relations 
        WHERE branch_id = ? AND from_entity_id NOT IN (
          SELECT id FROM entities WHERE branch_id = ?
        )
        `,
        [branchId, branchId]
      );

      // Delete relations where to_entity_id doesn't exist
      const orphanedToResult = await this.connection.runQuery(
        `
        DELETE FROM relations 
        WHERE branch_id = ? AND to_entity_id NOT IN (
          SELECT id FROM entities WHERE branch_id = ?
        )
        `,
        [branchId, branchId]
      );

      // Delete duplicate relations (keep only one of each unique relation)
      await this.connection.runQuery(
        `
        DELETE FROM relations 
        WHERE branch_id = ? AND id NOT IN (
          SELECT MIN(id) 
          FROM relations 
          WHERE branch_id = ?
          GROUP BY from_entity_id, to_entity_id, relation_type
        )
        `,
        [branchId, branchId]
      );

      // Count total cleaned up (SQLite doesn't return affected rows easily, so we log)
      logger.info(
        `Cleaned up orphaned and duplicate relations in branch ${
          branchName || "main"
        }`
      );

      return 0; // Would need to track changes separately to return accurate count
    } catch (error) {
      logger.error("Error cleaning up orphaned relations:", error);
      return 0;
    }
  }

  /**
   * Clean up low-value relations based on criteria:
   * - Relations with generic types (similar_to) between unrelated entities
   * - Relations created automatically that have low semantic similarity
   */
  async cleanupLowValueRelations(
    branchName?: string,
    minScore: number = 0.6
  ): Promise<number> {
    const branchId = await this.connection.getBranchId(branchName);

    try {
      // This would require storing relation confidence scores in the database
      // For now, we'll clean up generic "similar_to" relations between folders/configs
      const result = await this.connection.runQuery(
        `
        DELETE FROM relations 
        WHERE branch_id = ? 
        AND relation_type IN ('similar_to')
        AND EXISTS (
          SELECT 1 FROM entities e1 
          WHERE e1.id = relations.from_entity_id 
          AND e1.entity_type IN ('reference', 'folder')
        )
        AND EXISTS (
          SELECT 1 FROM entities e2 
          WHERE e2.id = relations.to_entity_id 
          AND e2.entity_type IN ('reference', 'folder')
        )
        `,
        [branchId]
      );

      logger.debug(
        `Cleaned up low-value relations in branch ${branchName || "main"}`
      );
      return 0;
    } catch (error) {
      logger.error("Error cleaning up low-value relations:", error);
      return 0;
    }
  }
}
