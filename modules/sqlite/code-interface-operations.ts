import { InterfaceInfo } from "../project-analysis/project-indexer.js";
import { VectorStore } from "../vector-store.js";
import { logger } from "../logger.js";
import { CodeInterfaceRecord } from "./project-analysis-records.js";
import { SQLiteConnection } from "./sqlite-connection.js";

export class CodeInterfaceOperations {
  constructor(
    private connection: SQLiteConnection,
    private vectorStore: VectorStore,
  ) {}

  async storeCodeInterfaces(
    fileId: number,
    interfaces: InterfaceInfo[],
    embedding?: number[],
  ): Promise<CodeInterfaceRecord[]> {
    const storedInterfaces: CodeInterfaceRecord[] = [];

    for (const iface of interfaces) {
      try {
        const record = await this.storeCodeInterface(fileId, iface, embedding);
        if (record) storedInterfaces.push(record);
      } catch (error) {
        logger.warn(`Failed to store interface ${iface.name}:`, error);
      }
    }

    return storedInterfaces;
  }

  async storeCodeInterface(
    fileId: number,
    iface: InterfaceInfo,
    embedding?: number[],
  ): Promise<CodeInterfaceRecord | null> {
    try {
      const now = new Date().toISOString();
      const vector = embedding || iface.embedding;
      const embeddingBuffer = vector
        ? Buffer.from(new Float32Array(vector).buffer)
        : null;

      const existing = await this.connection.getQuery(
        "SELECT id FROM code_interfaces WHERE name = ? AND file_id = ? AND line_number = ?",
        [iface.name, fileId, iface.line],
      );

      const record: CodeInterfaceRecord = {
        name: iface.name,
        file_id: fileId,
        line_number: iface.line,
        interface_type: "interface",
        definition: `interface ${iface.name}`,
        properties: JSON.stringify(iface.properties),
        extends_interfaces: JSON.stringify(iface.extends),
        is_exported: iface.isExported,
        is_generic: false,
        usage_count: 0,
        embedding: embeddingBuffer || undefined,
      };

      if (existing) {
        await this.connection.execute(
          `UPDATE code_interfaces SET
           interface_type = ?, definition = ?, properties = ?, extends_interfaces = ?,
           is_exported = ?, is_generic = ?, embedding = ?, updated_at = ?
           WHERE id = ?`,
          [
            record.interface_type,
            record.definition,
            record.properties,
            record.extends_interfaces,
            record.is_exported ? 1 : 0,
            record.is_generic ? 1 : 0,
            record.embedding,
            now,
            existing.id,
          ],
        );
        record.id = existing.id;
        record.updated_at = now;
      } else {
        const result = await this.connection.execute(
          `INSERT INTO code_interfaces (
            name, file_id, line_number, interface_type, definition, properties,
            extends_interfaces, is_exported, is_generic, usage_count, embedding,
            created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            record.name,
            record.file_id,
            record.line_number,
            record.interface_type,
            record.definition,
            record.properties,
            record.extends_interfaces,
            record.is_exported ? 1 : 0,
            record.is_generic ? 1 : 0,
            record.usage_count,
            record.embedding,
            now,
            now,
          ],
        );
        record.id = result.lastID;
      }

      if (embedding && record.id) {
        await this.vectorStore.add({
          id: `interface_${record.id}`,
          vector: embedding,
          metadata: {
            type: "interface",
            name: iface.name,
            fileId,
            dbId: record.id,
          },
        });
      }

      return record;
    } catch (error) {
      logger.error(`Failed to store code interface ${iface.name}:`, error);
      return null;
    }
  }

  async getCodeInterfaces(criteria: {
    fileId?: number;
    name?: string;
    interfaceType?: string;
    isExported?: boolean;
    limit?: number;
  }): Promise<CodeInterfaceRecord[]> {
    let whereClause = "WHERE 1=1";
    const params: any[] = [];

    if (criteria.fileId) {
      whereClause += " AND file_id = ?";
      params.push(criteria.fileId);
    }
    if (criteria.name) {
      whereClause += " AND name LIKE ? ESCAPE '\\'";
      params.push(`%${escapeLike(criteria.name)}%`);
    }
    if (criteria.interfaceType) {
      whereClause += " AND interface_type = ?";
      params.push(criteria.interfaceType);
    }
    if (criteria.isExported !== undefined) {
      whereClause += " AND is_exported = ?";
      params.push(criteria.isExported ? 1 : 0);
    }

    const rows = await this.connection.runQuery(
      `SELECT * FROM code_interfaces ${whereClause} ORDER BY usage_count DESC LIMIT ?`,
      [...params, clampLimit(criteria.limit, 100, 1000)],
    );
    return rows || [];
  }

  async updateInterfaceUsage(interfaceId: number): Promise<void> {
    await this.connection.execute(
      "UPDATE code_interfaces SET usage_count = usage_count + 1, last_used = ? WHERE id = ?",
      [new Date().toISOString(), interfaceId],
    );
  }

  async findSimilarInterfaces(
    queryEmbedding: number[],
    limit = 5,
    minSimilarity = -1,
  ): Promise<Array<{ interface: CodeInterfaceRecord; similarity: number }>> {
    try {
      const rows = await this.connection.runQuery(
        "SELECT * FROM code_interfaces WHERE embedding IS NOT NULL",
      );
      if (!rows || rows.length === 0) return [];

      const results: Array<{
        interface: CodeInterfaceRecord;
        similarity: number;
      }> = [];

      for (const row of rows) {
        if (!row.embedding) continue;
        const embedding = new Float32Array(row.embedding);
        const similarity = calculateCosineSimilarity(queryEmbedding, embedding);
        if (similarity >= minSimilarity) {
          results.push({ interface: row as CodeInterfaceRecord, similarity });
        }
      }

      return results
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, clampLimit(limit, 5, 100));
    } catch (error) {
      logger.error("Failed to find similar interfaces:", error);
      return [];
    }
  }

  async generateMissingInterfaceEmbeddings(
    embeddingGenerator: (interfaceContext: string) => Promise<number[] | null>,
    limit = 50,
  ): Promise<number[]> {
    try {
      const interfaces = await this.connection.runQuery(
        `SELECT id, name, definition, file_id FROM code_interfaces
         WHERE embedding IS NULL
         LIMIT ?`,
        [clampLimit(limit, 50, 500)],
      );
      if (!interfaces || interfaces.length === 0) return [];

      logger.info(
        `[VECTOR] Generating embeddings for ${interfaces.length} interfaces...`,
      );
      const updatedIds: number[] = [];

      for (const iface of interfaces) {
        try {
          const interfaceContext = `Interface: ${iface.name}\n${iface.definition}`;
          const embedding = await embeddingGenerator(interfaceContext);
          if (!embedding) continue;

          const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer);
          await this.connection.execute(
            "UPDATE code_interfaces SET embedding = ?, updated_at = ? WHERE id = ?",
            [embeddingBuffer, new Date().toISOString(), iface.id],
          );

          await this.vectorStore.add({
            id: `interface_${iface.id}`,
            vector: embedding,
            metadata: {
              type: "interface",
              interfaceName: iface.name,
              dbId: iface.id,
            },
          });
          updatedIds.push(iface.id);
        } catch (error) {
          logger.warn(
            `Failed to generate embedding for interface ${iface.name}:`,
            error,
          );
        }
      }

      if (updatedIds.length > 0) {
        logger.info(
          `[SUCCESS] Generated embeddings for ${updatedIds.length} interfaces`,
        );
      }
      return updatedIds;
    } catch (error) {
      logger.error("Failed to generate missing interface embeddings:", error);
      return [];
    }
  }
}

function calculateCosineSimilarity(
  vecA: number[] | Float32Array,
  vecB: number[] | Float32Array,
): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function clampLimit(value: number | undefined, fallback: number, max: number): number {
  if (!Number.isFinite(value) || !value || value < 1) return fallback;
  return Math.min(Math.floor(value), max);
}
