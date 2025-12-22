import {
  Entity,
  EntityStatus,
  OPTIMIZATION_METADATA_SYMBOL,
  OptimizationMetadata,
} from "../../memory-types.js";
import { logger } from "../logger.js";
import { SQLiteConnection } from "./sqlite-connection.js";

/**
 * SQLite Entity Operations
 * Handles CRUD operations for entities and observations
 */
type EntityWithOptimization = Entity & {
  [OPTIMIZATION_METADATA_SYMBOL]?: OptimizationMetadata;
};

export class SQLiteEntityOperations {
  constructor(private connection: SQLiteConnection) {}

  async createEntities(
    entities: Entity[],
    branchName?: string
  ): Promise<Entity[]> {
    const branchId = await this.connection.getBranchId(branchName);
    const created: Entity[] = [];

    for (const entity of entities) {
      try {
        const createdEntity = await this.createSingleEntity(entity, branchId);
        created.push(createdEntity);
      } catch (error) {
        logger.error(`Failed to create entity "${entity.name}":`, error);
        throw error;
      }
    }

    return created;
  }

  async updateEntity(entity: Entity, branchName?: string): Promise<Entity> {
    const branchId = await this.connection.getBranchId(branchName);

    // Find the existing entity
    const existingEntity = await this.connection.getQuery(
      "SELECT id, original_content FROM entities WHERE name = ? AND branch_id = ?",
      [entity.name, branchId]
    );

    if (!existingEntity) {
      throw new Error(
        `Entity "${entity.name}" not found in branch ${branchName || "main"}`
      );
    }

    // Update content if provided
    const updatedContent = entity.content || existingEntity.original_content;

    // Update the entity including AI enhancement fields
    await this.connection.runQuery(
      `UPDATE entities 
       SET entity_type = ?, original_content = ?, optimized_content = ?, status = ?, status_reason = ?, updated_at = ?, 
           last_accessed = ?, working_context = ?, relevance_score = ?, embedding = ?
       WHERE id = ?`,
      [
        entity.entityType,
        updatedContent,
        updatedContent,
        entity.status || "active",
        entity.statusReason || null,
        new Date().toISOString(),
        entity.lastAccessed || new Date().toISOString(),
        entity.workingContext ? 1 : 0,
        entity.relevanceScore || 0.5,
        entity.embedding
          ? Buffer.from(new Float32Array(entity.embedding).buffer)
          : null,
        existingEntity.id,
      ]
    );

    // Update observations - delete old ones and insert new ones
    await this.connection.runQuery(
      "DELETE FROM observations WHERE entity_id = ?",
      [existingEntity.id]
    );

    if (entity.observations && entity.observations.length > 0) {
      for (let i = 0; i < entity.observations.length; i++) {
        await this.connection.runQuery(
          `INSERT INTO observations (entity_id, content, optimized_content, sequence_order)
           VALUES (?, ?, ?, ?)`,
          [existingEntity.id, entity.observations[i], entity.observations[i], i]
        );
      }
    }

    return {
      ...entity,
      lastUpdated: new Date().toISOString(),
    };
  }

  async deleteEntities(
    entityNames: string[],
    branchName?: string
  ): Promise<void> {
    if (!entityNames || entityNames.length === 0) {
      return;
    }

    const branchId = await this.connection.getBranchId(branchName);

    for (const entityName of entityNames) {
      try {
        // Get entity ID first
        const entity = await this.connection.getQuery(
          "SELECT id FROM entities WHERE name = ? AND branch_id = ?",
          [entityName, branchId]
        );

        if (!entity) {
          logger.warn(
            `Entity "${entityName}" not found in branch ${branchName || "main"}`
          );
          continue;
        }

        // Delete observations first (foreign key constraints)
        await this.connection.runQuery(
          "DELETE FROM observations WHERE entity_id = ?",
          [entity.id]
        );

        // Delete relations involving this entity
        await this.connection.runQuery(
          "DELETE FROM relations WHERE from_entity_id = ? OR to_entity_id = ?",
          [entity.id, entity.id]
        );

        // Delete keywords
        await this.connection.runQuery(
          "DELETE FROM keywords WHERE entity_id = ?",
          [entity.id]
        );

        // Delete cross references
        await this.connection.runQuery(
          "DELETE FROM cross_references WHERE from_entity_id = ?",
          [entity.id]
        );

        // Finally delete the entity (FTS trigger will handle FTS cleanup)
        await this.connection.runQuery("DELETE FROM entities WHERE id = ?", [
          entity.id,
        ]);

        logger.info(`Deleted entity "${entityName}" and all related data`);
      } catch (error) {
        logger.error(`Failed to delete entity "${entityName}":`, error);
        throw error;
      }
    }
  }

  async findEntityByName(
    name: string,
    branchName?: string
  ): Promise<Entity | null> {
    const branchId = branchName
      ? await this.connection.getBranchId(branchName)
      : null;

    let whereClause = "WHERE e.name = ?";
    let params = [name];

    if (branchId) {
      whereClause += " AND e.branch_id = ?";
      params.push(branchId.toString());
    }

    const results = await this.connection.runQuery(
      `
      SELECT DISTINCT e.*, GROUP_CONCAT(o.content, '|') as observations
      FROM entities e
      LEFT JOIN observations o ON e.id = o.entity_id
      ${whereClause}
      GROUP BY e.id
    `,
      params
    );

    if (results.length === 0) {
      return null;
    }

    const entities = this.convertRowsToEntities(results);
    return entities[0] || null;
  }

  private async createSingleEntity(
    entity: Entity,
    branchId: number
  ): Promise<Entity> {
    const entityWithMeta = entity as EntityWithOptimization;
    const optimizationMeta = entityWithMeta[OPTIMIZATION_METADATA_SYMBOL];

    // Validate and sanitize entity data
    const validName = (entity.name || "").toString().trim() || "Unnamed Entity";
    const validEntityType =
      (entity.entityType || "").toString().trim() || "Unknown";
    const validContent = (entity.content || "").toString().trim() || "";
    const validObservations = (entity.observations || []).filter(
      (obs) => obs && obs.toString().trim()
    );
    const optimizedObservations =
      optimizationMeta?.optimizedObservations || validObservations;

    // Check if entity already exists
    const existing = await this.connection.getQuery(
      "SELECT id FROM entities WHERE name = ? AND branch_id = ?",
      [validName, branchId]
    );

    if (existing) {
      // Return the existing entity instead of throwing an error
      logger.debug(
        `Entity "${validName}" already exists, returning existing entity`
      );
      const existingEntity = await this.connection.getQuery(
        "SELECT * FROM entities WHERE id = ?",
        [existing.id]
      );

      if (existingEntity) {
        // Get observations for the existing entity (simplified for now)
        const observations: any[] = []; // TODO: Implement proper observation fetching

        return {
          name: existingEntity.name,
          entityType: existingEntity.entity_type,
          content: existingEntity.original_content || "",
          observations: observations.map((obs: any) => obs.content),
          status: existingEntity.status || "active",
          statusReason: existingEntity.status_reason,
          created: existingEntity.created_at,
          lastUpdated: existingEntity.updated_at,
        };
      }
    }

    // Store the actual content provided by the user
    const originalContent =
      validContent ||
      JSON.stringify({
        name: validName,
        entityType: validEntityType,
        observations: validObservations,
      });

    const optimizedEntityContent =
      optimizationMeta?.optimizedContent || originalContent;

    // Insert entity with AI enhancement fields
    await this.connection.runQuery(
      `
      INSERT INTO entities (
        name,
        entity_type,
        branch_id,
        status,
        status_reason,
        original_content,
        optimized_content,
        token_count,
        compression_ratio,
        updated_at,
        last_accessed,
        working_context,
        relevance_score,
        embedding
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        validName,
        validEntityType,
        branchId,
        entity.status || "active",
        entity.statusReason || null,
        originalContent,
        optimizedEntityContent,
        optimizationMeta?.tokenCount || validContent.length || 0,
        optimizationMeta?.compressionRatio || 1,
        new Date().toISOString(),
        entity.lastAccessed || new Date().toISOString(),
        entity.workingContext ? 1 : 0,
        entity.relevanceScore || 0.5,
        entity.embedding
          ? Buffer.from(new Float32Array(entity.embedding).buffer)
          : null,
      ]
    );

    const entityRow = await this.connection.getQuery(
      "SELECT id FROM entities WHERE name = ? AND branch_id = ?",
      [validName, branchId]
    );

    // Insert observations
    if (validObservations.length > 0) {
      for (let i = 0; i < validObservations.length; i++) {
        await this.connection.runQuery(
          `
          INSERT INTO observations (entity_id, content, optimized_content, sequence_order)
          VALUES (?, ?, ?, ?)
        `,
          [
            entityRow.id,
            validObservations[i],
            optimizedObservations[i] || validObservations[i],
            i,
          ]
        );
      }
    }

    // Store extracted keywords for faster lookup
    if (optimizationMeta?.keywords && optimizationMeta.keywords.length > 0) {
      for (const keyword of optimizationMeta.keywords) {
        await this.connection.runQuery(
          `
          INSERT INTO keywords (keyword, entity_id, weight, context)
          VALUES (?, ?, ?, ?)
        `,
          [keyword, entityRow.id, 1, validEntityType]
        );
      }
    }

    const now = new Date().toISOString();
    return {
      name: validName,
      entityType: validEntityType,
      content: entity.content || "",
      observations: validObservations,
      status: entity.status || "active",
      statusReason: entity.statusReason,
      created: now,
      lastUpdated: now,
    };
  }

  async addObservations(
    observations: { entityName: string; contents: string[] }[],
    branchName?: string
  ): Promise<{ entityName: string; addedObservations: string[] }[]> {
    const branchId = await this.connection.getBranchId(branchName);
    const results: { entityName: string; addedObservations: string[] }[] = [];

    for (const obs of observations) {
      try {
        // Find the entity
        const entity = await this.connection.getQuery(
          "SELECT id FROM entities WHERE name = ? AND branch_id = ?",
          [obs.entityName, branchId]
        );

        if (!entity) {
          logger.warn(
            `Entity "${obs.entityName}" not found in branch ${
              branchName || "main"
            }`
          );
          continue;
        }

        // Get current max sequence order
        const maxSeq = await this.connection.getQuery(
          "SELECT COALESCE(MAX(sequence_order), -1) as max_seq FROM observations WHERE entity_id = ?",
          [entity.id]
        );

        const startSeq = (maxSeq?.max_seq || -1) + 1;
        const addedObservations: string[] = [];

        // Add each new observation
        for (let i = 0; i < obs.contents.length; i++) {
          const content = obs.contents[i];
          if (content && content.trim()) {
            await this.connection.runQuery(
              `INSERT INTO observations (entity_id, content, optimized_content, sequence_order)
               VALUES (?, ?, ?, ?)`,
              [entity.id, content, content, startSeq + i]
            );
            addedObservations.push(content);
          }
        }

        // Update entity timestamp
        await this.connection.runQuery(
          "UPDATE entities SET updated_at = ? WHERE id = ?",
          [new Date().toISOString(), entity.id]
        );

        results.push({
          entityName: obs.entityName,
          addedObservations,
        });

        logger.info(
          `Added ${addedObservations.length} observations to "${obs.entityName}"`
        );
      } catch (error) {
        logger.error(
          `Failed to add observations to "${obs.entityName}":`,
          error
        );
      }
    }

    return results;
  }

  async deleteObservations(
    deletions: { entityName: string; observations: string[] }[],
    branchName?: string
  ): Promise<void> {
    const branchId = await this.connection.getBranchId(branchName);

    for (const deletion of deletions) {
      try {
        // Find the entity
        const entity = await this.connection.getQuery(
          "SELECT id FROM entities WHERE name = ? AND branch_id = ?",
          [deletion.entityName, branchId]
        );

        if (!entity) {
          logger.warn(
            `Entity "${deletion.entityName}" not found in branch ${
              branchName || "main"
            }`
          );
          continue;
        }

        // Delete specific observations
        for (const obsContent of deletion.observations) {
          await this.connection.runQuery(
            "DELETE FROM observations WHERE entity_id = ? AND content = ?",
            [entity.id, obsContent]
          );
        }

        // Update entity timestamp
        await this.connection.runQuery(
          "UPDATE entities SET updated_at = ? WHERE id = ?",
          [new Date().toISOString(), entity.id]
        );

        logger.info(
          `Deleted ${deletion.observations.length} observations from "${deletion.entityName}"`
        );
      } catch (error) {
        logger.error(
          `Failed to delete observations from "${deletion.entityName}":`,
          error
        );
      }
    }
  }

  async createCrossReference(
    entityName: string,
    targetBranch: string,
    targetEntityNames: string[],
    sourceBranch?: string
  ): Promise<void> {
    const sourceBranchId = await this.connection.getBranchId(sourceBranch);
    const targetBranchId = await this.connection.getBranchId(targetBranch);

    // Find the source entity
    const sourceEntity = await this.connection.getQuery(
      "SELECT id FROM entities WHERE name = ? AND branch_id = ?",
      [entityName, sourceBranchId]
    );

    if (!sourceEntity) {
      throw new Error(
        `Entity "${entityName}" not found in branch ${sourceBranch || "main"}`
      );
    }

    // Create cross-references for each target entity
    for (const targetEntityName of targetEntityNames) {
      try {
        // Verify target entity exists
        const targetEntity = await this.connection.getQuery(
          "SELECT id FROM entities WHERE name = ? AND branch_id = ?",
          [targetEntityName, targetBranchId]
        );

        if (!targetEntity) {
          logger.warn(
            `Target entity "${targetEntityName}" not found in branch "${targetBranch}"`
          );
          continue;
        }

        // Insert cross-reference (ignore duplicates)
        await this.connection.runQuery(
          `INSERT OR IGNORE INTO cross_references (from_entity_id, target_branch_id, target_entity_name)
           VALUES (?, ?, ?)`,
          [sourceEntity.id, targetBranchId, targetEntityName]
        );

        logger.info(
          `Created cross-reference: "${entityName}" -> "${targetEntityName}" (${targetBranch})`
        );
      } catch (error) {
        logger.error(
          `Failed to create cross-reference to "${targetEntityName}":`,
          error
        );
      }
    }
  }

  /**
   * Get entities that have embeddings stored
   */
  async getEntitiesWithEmbeddings(
    branchName?: string,
    includeStatuses?: EntityStatus[]
  ): Promise<Entity[]> {
    const branchId = branchName
      ? await this.connection.getBranchId(branchName)
      : null;
    let whereClause = "WHERE embedding IS NOT NULL";
    const params: any[] = [];

    if (branchId) {
      whereClause += " AND branch_id = ?";
      params.push(branchId);
    }

    const statuses =
      includeStatuses && includeStatuses.length > 0
        ? includeStatuses
        : ["active"];
    whereClause += ` AND status IN (${statuses.map(() => "?").join(",")})`;
    params.push(...statuses);

    const rows = await this.connection.runQuery(
      `SELECT * FROM entities ${whereClause}`,
      params
    );

    return this.convertRowsToEntities(rows);
  }

  /**
   * Update entity embedding
   */
  async updateEntityEmbedding(
    entityName: string,
    embedding: number[],
    branchName?: string
  ): Promise<void> {
    const branchId = await this.connection.getBranchId(branchName);
    const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer);

    await this.connection.runQuery(
      `UPDATE entities 
       SET embedding = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE name = ? AND branch_id = ?`,
      [embeddingBuffer, entityName, branchId]
    );

    logger.debug(`Updated embedding for entity "${entityName}"`);
  }

  convertRowsToEntities(rows: any[]): Entity[] {
    return rows.map((row: any) => {
      const entity: Entity = {
        name: row.name,
        entityType: row.entity_type,
        content: row.original_content || row.optimized_content || "",
        observations: row.observations ? row.observations.split("|") : [],
        status: row.status as EntityStatus,
        statusReason: row.status_reason,
        created: row.created_at,
        lastUpdated: row.updated_at,
        lastAccessed: row.last_accessed,
        workingContext: Boolean(row.working_context),
        relevanceScore: row.relevance_score || 0.5,
      };

      // Convert embedding BLOB back to number array if present
      if (row.embedding) {
        try {
          const buffer = Buffer.from(row.embedding);
          const float32Array = new Float32Array(
            buffer.buffer,
            buffer.byteOffset,
            buffer.byteLength / 4
          );
          entity.embedding = Array.from(float32Array);
        } catch (error) {
          logger.warn(
            `Failed to parse embedding for entity "${row.name}":`,
            error
          );
        }
      }

      return entity;
    });
  }

  /**
   * Update entity relevance score for AI optimization
   */
  async updateEntityRelevanceScore(
    entityName: string,
    relevanceScore: number,
    branchName?: string
  ): Promise<void> {
    const branchId = await this.connection.getBranchId(branchName);

    await this.connection.runQuery(
      `UPDATE entities 
       SET relevance_score = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE name = ? AND branch_id = ?`,
      [relevanceScore, entityName, branchId]
    );

    logger.debug(
      `Updated relevance score for entity "${entityName}" to ${relevanceScore}`
    );
  }

  /**
   * Update entity working context flag for AI workflow management
   */
  async updateEntityWorkingContext(
    entityName: string,
    isWorkingContext: boolean,
    branchName?: string
  ): Promise<void> {
    const branchId = await this.connection.getBranchId(branchName);

    await this.connection.runQuery(
      `UPDATE entities 
       SET working_context = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE name = ? AND branch_id = ?`,
      [isWorkingContext ? 1 : 0, entityName, branchId]
    );

    logger.debug(
      `Updated working context for entity "${entityName}" to ${isWorkingContext}`
    );
  }

  /**
   * Update entity last accessed timestamp
   */
  async updateEntityLastAccessed(
    entityName: string,
    branchName?: string
  ): Promise<void> {
    const branchId = await this.connection.getBranchId(branchName);

    await this.connection.runQuery(
      `UPDATE entities 
       SET last_accessed = CURRENT_TIMESTAMP 
       WHERE name = ? AND branch_id = ?`,
      [entityName, branchId]
    );
  }

  /**
   * Batch update relevance scores for efficiency
   */
  async batchUpdateRelevanceScores(
    updates: { entityName: string; score: number; branchName?: string }[]
  ): Promise<void> {
    for (const update of updates) {
      try {
        await this.updateEntityRelevanceScore(
          update.entityName,
          update.score,
          update.branchName
        );
      } catch (error) {
        logger.warn(
          `Failed to update relevance score for ${update.entityName}:`,
          error
        );
      }
    }
  }
}
