import { InterfaceInfo } from "../project-analysis/project-indexer.js";
import { VectorStore } from "../vector-store.js";
import { logger } from "../logger.js";
import { CodeInterfaceRecord } from "./project-analysis-records.js";
import { SQLiteConnection } from "./sqlite-connection.js";

export interface CodeInterfaceQueryCriteria {
  fileId?: number;
  name?: string;
  interfaceType?: string;
  kind?: string;
  language?: string;
  qualifiedName?: string;
  filePath?: string;
  isExported?: boolean;
  limit?: number;
  offset?: number;
}

export interface CodeInterfaceSimilarityOptions {
  language?: string;
  kind?: string;
  filePath?: string;
  qualifiedName?: string;
  dedupe?: boolean;
  offset?: number;
}

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

      const metadata = buildMetadata(iface);
      const stableId =
        iface.stableId ||
        `${iface.language || "unknown"}:${fileId}:${iface.kind || "interface"}:${iface.qualifiedName || iface.name}:${iface.line}`;
      const existing = await this.connection.getQuery(
        "SELECT id FROM code_interfaces WHERE stable_id = ? OR (name = ? AND file_id = ? AND line_number = ?)",
        [stableId, iface.name, fileId, iface.line],
      );

      const record: CodeInterfaceRecord = {
        name: iface.name,
        file_id: fileId,
        line_number: iface.startLine || iface.line,
        interface_type: iface.kind || "interface",
        definition:
          iface.definition ||
          iface.signature ||
          `${iface.kind || "interface"} ${iface.qualifiedName || iface.name}`,
        properties: JSON.stringify(iface.properties),
        extends_interfaces: JSON.stringify(iface.extends),
        language: iface.language,
        qualified_name: iface.qualifiedName || iface.name,
        namespace: iface.namespace,
        kind: iface.kind || "interface",
        signature: iface.signature,
        documentation: iface.documentation,
        visibility: iface.visibility,
        start_line: iface.startLine || iface.line,
        end_line: iface.endLine || iface.line,
        container_name: iface.containerName,
        stable_id: stableId,
        source_hash: iface.sourceHash || iface.bodyHash,
        metadata: JSON.stringify(metadata),
        summary: iface.summary,
        rank_text: iface.rankText,
        is_exported: iface.isExported,
        is_generic: Boolean(iface.templateParameters?.length),
        usage_count: 0,
        embedding: embeddingBuffer || undefined,
      };

      if (existing) {
        await this.connection.execute(
          `UPDATE code_interfaces SET
           interface_type = ?, definition = ?, properties = ?, extends_interfaces = ?,
           language = ?, qualified_name = ?, namespace = ?, kind = ?, signature = ?,
           documentation = ?, visibility = ?, start_line = ?, end_line = ?, container_name = ?,
           stable_id = ?, source_hash = ?, metadata = ?, summary = ?, rank_text = ?,
           is_exported = ?, is_generic = ?, embedding = COALESCE(?, embedding), updated_at = ?
           WHERE id = ?`,
          [
            record.interface_type,
            record.definition,
            record.properties,
            record.extends_interfaces,
            record.language,
            record.qualified_name,
            record.namespace,
            record.kind,
            record.signature,
            record.documentation,
            record.visibility,
            record.start_line,
            record.end_line,
            record.container_name,
            record.stable_id,
            record.source_hash,
            record.metadata,
            record.summary,
            record.rank_text,
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
            extends_interfaces, language, qualified_name, namespace, kind, signature,
            documentation, visibility, start_line, end_line, container_name,
            stable_id, source_hash, metadata, summary, rank_text,
            is_exported, is_generic, usage_count, embedding, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            record.name,
            record.file_id,
            record.line_number,
            record.interface_type,
            record.definition,
            record.properties,
            record.extends_interfaces,
            record.language,
            record.qualified_name,
            record.namespace,
            record.kind,
            record.signature,
            record.documentation,
            record.visibility,
            record.start_line,
            record.end_line,
            record.container_name,
            record.stable_id,
            record.source_hash,
            record.metadata,
            record.summary,
            record.rank_text,
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
            qualifiedName: iface.qualifiedName || iface.name,
            language: iface.language,
            kind: iface.kind,
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

  async getCodeInterfaces(
    criteria: CodeInterfaceQueryCriteria,
  ): Promise<CodeInterfaceRecord[]> {
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
    if (criteria.kind) {
      whereClause += " AND kind = ?";
      params.push(criteria.kind);
    }
    if (criteria.language) {
      whereClause += " AND language = ?";
      params.push(criteria.language);
    }
    if (criteria.qualifiedName) {
      whereClause += " AND qualified_name LIKE ? ESCAPE '\\'";
      params.push(`%${escapeLike(criteria.qualifiedName)}%`);
    }
    if (criteria.filePath) {
      whereClause +=
        " AND file_id IN (SELECT id FROM project_files WHERE relative_path LIKE ? ESCAPE '\\' OR file_path LIKE ? ESCAPE '\\')";
      const pathLike = `%${escapeLike(criteria.filePath)}%`;
      params.push(pathLike, pathLike);
    }
    if (criteria.isExported !== undefined) {
      whereClause += " AND is_exported = ?";
      params.push(criteria.isExported ? 1 : 0);
    }

    const rows = await this.connection.runQuery(
      `SELECT * FROM code_interfaces ${whereClause}
       ORDER BY usage_count DESC, qualified_name ASC, line_number ASC
       LIMIT ? OFFSET ?`,
      [
        ...params,
        clampLimit(criteria.limit, 100, 1000),
        clampOffset(criteria.offset),
      ],
    );
    return rows || [];
  }

  async updateInterfaceUsage(interfaceId: number): Promise<void> {
    await this.connection.execute(
      "UPDATE code_interfaces SET usage_count = usage_count + 1, last_used = ? WHERE id = ?",
      [new Date().toISOString(), interfaceId],
    );
  }

  async refreshInterfaceRelationships(limit = 1000): Promise<number> {
    const interfaces = await this.connection.runQuery(
      `SELECT id, name, qualified_name, extends_interfaces, metadata
       FROM code_interfaces
       ORDER BY updated_at DESC
       LIMIT ?`,
      [clampLimit(limit, 1000, 10_000)],
    );
    let created = 0;
    for (const iface of interfaces || []) {
      const targets = new Set<string>();
      for (const target of safeJsonArray(iface.extends_interfaces))
        targets.add(String(target));
      const metadata = safeJson(iface.metadata);
      for (const relation of metadata.relationships || []) {
        if (relation?.target) targets.add(String(relation.target));
      }
      for (const target of targets) {
        const targetRow = await this.connection.getQuery(
          `SELECT id FROM code_interfaces
           WHERE qualified_name = ? OR name = ?
           ORDER BY qualified_name = ? DESC
           LIMIT 1`,
          [target, target.split("::").pop() || target, target],
        );
        if (!targetRow?.id || targetRow.id === iface.id) continue;
        const result = await this.connection.execute(
          `INSERT OR IGNORE INTO interface_relationships (
             from_interface_id, to_interface_id, relationship_type,
             confidence_score, semantic_similarity, usage_frequency, last_detected
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            iface.id,
            targetRow.id,
            "extends",
            0.9,
            0,
            0,
            new Date().toISOString(),
          ],
        );
        created += result.changes;
      }
    }
    return created;
  }

  async findSimilarInterfaces(
    queryEmbedding: number[],
    limit = 5,
    minSimilarity = -1,
    options: CodeInterfaceSimilarityOptions = {},
  ): Promise<Array<{ interface: CodeInterfaceRecord; similarity: number }>> {
    try {
      const where: string[] = ["embedding IS NOT NULL"];
      const params: any[] = [];
      if (options.language) {
        where.push("language = ?");
        params.push(options.language);
      }
      if (options.kind) {
        where.push("kind = ?");
        params.push(options.kind);
      }
      if (options.qualifiedName) {
        where.push("qualified_name LIKE ? ESCAPE '\\'");
        params.push(`%${escapeLike(options.qualifiedName)}%`);
      }
      if (options.filePath) {
        where.push(
          "file_id IN (SELECT id FROM project_files WHERE relative_path LIKE ? ESCAPE '\\' OR file_path LIKE ? ESCAPE '\\')",
        );
        const pathLike = `%${escapeLike(options.filePath)}%`;
        params.push(pathLike, pathLike);
      }
      const rows = await this.connection.runQuery(
        `SELECT * FROM code_interfaces WHERE ${where.join(" AND ")}`,
        params,
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
          results.push({
            interface: row as CodeInterfaceRecord,
            similarity: addRankingBoost(row, similarity, options),
          });
        }
      }

      const sorted = results.sort((a, b) => b.similarity - a.similarity);
      const deduped =
        options.dedupe === false ? sorted : dedupeSimilarityResults(sorted);
      return deduped.slice(
        clampOffset(options.offset),
        clampOffset(options.offset) + clampLimit(limit, 5, 100),
      );
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
        `SELECT id, name, definition, signature, documentation, rank_text, qualified_name, language, kind, file_id FROM code_interfaces
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
          const interfaceContext = [
            `Interface: ${iface.qualified_name || iface.name}`,
            `Language: ${iface.language || "unknown"}`,
            `Kind: ${iface.kind || "interface"}`,
            iface.signature,
            iface.documentation,
            iface.rank_text,
            iface.definition,
          ]
            .filter(Boolean)
            .join("\n");
          const embedding = await embeddingGenerator(interfaceContext);
          if (!embedding) continue;

          const embeddingBuffer = Buffer.from(
            new Float32Array(embedding).buffer,
          );
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
              qualifiedName: iface.qualified_name,
              language: iface.language,
              kind: iface.kind,
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

function buildMetadata(iface: InterfaceInfo): Record<string, any> {
  return {
    members: iface.members || [],
    parameters: iface.parameters || [],
    returnType: iface.returnType,
    templateParameters: iface.templateParameters || [],
    attributes: iface.attributes || [],
    modifiers: iface.modifiers || [],
    macroParameters: iface.macroParameters || [],
    macroReplacement: iface.macroReplacement,
    relationships: iface.relationships || [],
    diagnostics: iface.diagnostics || [],
  };
}

function addRankingBoost(
  row: any,
  similarity: number,
  options: CodeInterfaceSimilarityOptions,
): number {
  let score = similarity;
  if (
    options.qualifiedName &&
    row.qualified_name?.includes(options.qualifiedName)
  ) {
    score += 0.15;
  }
  if (options.kind && row.kind === options.kind) score += 0.08;
  if (options.language && row.language === options.language) score += 0.05;
  if (row.is_exported) score += 0.02;
  return Math.max(-1, Math.min(1, score));
}

function dedupeSimilarityResults<T extends { interface: CodeInterfaceRecord }>(
  items: T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const iface = item.interface;
    const key =
      iface.stable_id ||
      `${iface.language || ""}:${iface.qualified_name || iface.name}:${iface.kind || iface.interface_type}:${iface.file_id}:${iface.start_line || iface.line_number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function safeJson(input: string | undefined): any {
  if (!input) return {};
  try {
    return JSON.parse(input);
  } catch {
    return {};
  }
}

function safeJsonArray(input: string | undefined): any[] {
  const parsed = safeJson(input);
  return Array.isArray(parsed) ? parsed : [];
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

function clampLimit(
  value: number | undefined,
  fallback: number,
  max: number,
): number {
  if (!Number.isFinite(value) || !value || value < 1) return fallback;
  return Math.min(Math.floor(value), max);
}

function clampOffset(value: number | undefined): number {
  if (!Number.isFinite(value) || !value || value < 0) return 0;
  return Math.floor(value);
}
