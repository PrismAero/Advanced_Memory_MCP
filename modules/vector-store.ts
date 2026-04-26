import * as tf from "@tensorflow/tfjs-node";
import { logger } from "./logger.js";
import { SQLiteConnection } from "./sqlite/sqlite-connection.js";

export interface VectorSearchResult {
  id: string;
  score: number;
  metadata?: any;
}

export interface VectorRecord {
  id: string;
  vector: number[];
  metadata?: any;
}

/**
 * High-performance Vector Store using TensorFlow.js for operations
 * and SQLite for persistence.
 *
 * Features:
 * - In-memory Tensor-based vector index for fast cosine similarity
 * - SQLite persistence
 * - Metadata filtering support
 */
export class VectorStore {
  private connection: SQLiteConnection;
  private tableName: string;
  private dimension: number;

  // In-memory cache
  private vectorCache: Map<string, Float32Array> = new Map();
  private metadataCache: Map<string, any> = new Map();
  private tensorIndex: tf.Tensor | null = null;
  private idMap: string[] = [];
  private isDirty: boolean = false;

  constructor(
    connection: SQLiteConnection,
    tableName: string = "vectors",
    dimension: number = 512
  ) {
    this.connection = connection;
    this.tableName = tableName;
    this.dimension = dimension;
  }

  async initialize(): Promise<void> {
    // Create table if not exists
    await this.connection.runQuery(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id TEXT PRIMARY KEY,
        vector BLOB NOT NULL,
        metadata TEXT,
        created_at TEXT,
        updated_at TEXT
      )
    `);

    await this.loadIndex();
    logger.info(
      `[VECTOR] Vector store initialized with ${this.vectorCache.size} vectors`
    );
  }

  /**
   * Load all vectors from SQLite into memory
   */
  private async loadIndex(): Promise<void> {
    try {
      const rows = await this.connection.runQuery(
        `SELECT * FROM ${this.tableName}`
      );

      this.vectorCache.clear();
      this.metadataCache.clear();
      this.idMap = [];

      if (rows && rows.length > 0) {
        for (const row of rows) {
          const vector = new Float32Array(row.vector);
          this.vectorCache.set(row.id, vector);
          if (row.metadata) {
            this.metadataCache.set(row.id, JSON.parse(row.metadata));
          }
          this.idMap.push(row.id);
        }
        this.rebuildTensorIndex();
      }
    } catch (error) {
      logger.error("Failed to load vector index:", error);
    }
  }

  /**
   * Rebuild the TensorFlow tensor index from cache
   */
  private rebuildTensorIndex(): void {
    if (this.tensorIndex) {
      this.tensorIndex.dispose();
    }

    if (this.vectorCache.size === 0) {
      this.tensorIndex = null;
      return;
    }

    const vectors: number[][] = [];
    this.idMap = [];

    for (const [id, vector] of this.vectorCache.entries()) {
      vectors.push(Array.from(vector));
      this.idMap.push(id);
    }

    this.tensorIndex = tf.tensor2d(vectors);
  }

  /**
   * Add or update a vector
   */
  async add(record: VectorRecord): Promise<void> {
    if (record.vector.length !== this.dimension) {
      throw new Error(
        `Vector dimension mismatch. Expected ${this.dimension}, got ${record.vector.length}`
      );
    }

    const vectorFloat = new Float32Array(record.vector);
    const now = new Date().toISOString();

    // Update in-memory
    this.vectorCache.set(record.id, vectorFloat);
    if (record.metadata) {
      this.metadataCache.set(record.id, record.metadata);
    }

    // Persist to SQLite
    const buffer = Buffer.from(vectorFloat.buffer);

    const existing = await this.connection.getQuery(
      `SELECT id FROM ${this.tableName} WHERE id = ?`,
      [record.id]
    );

    if (existing) {
      await this.connection.runQuery(
        `UPDATE ${this.tableName} SET vector = ?, metadata = ?, updated_at = ? WHERE id = ?`,
        [buffer, JSON.stringify(record.metadata || {}), now, record.id]
      );
    } else {
      await this.connection.runQuery(
        `INSERT INTO ${this.tableName} (id, vector, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        [record.id, buffer, JSON.stringify(record.metadata || {}), now, now]
      );
    }

    this.isDirty = true;
  }

  /**
   * Add multiple vectors in batch
   */
  async addBatch(records: VectorRecord[]): Promise<void> {
    for (const record of records) {
      await this.add(record);
    }
    // Rebuild index once after batch
    if (this.isDirty) {
      this.rebuildTensorIndex();
      this.isDirty = false;
    }
  }

  /**
   * Search for similar vectors
   */
  async search(
    queryVector: number[],
    limit: number = 5,
    minScore: number = 0.0
  ): Promise<VectorSearchResult[]> {
    if (!this.tensorIndex || this.vectorCache.size === 0) {
      return [];
    }

    if (this.isDirty) {
      this.rebuildTensorIndex();
      this.isDirty = false;
    }

    const { scoreValues, indexValues } = tf.tidy(() => {
      const queryTensor = tf.tensor2d([queryVector]);

      // Normalize query vector
      const queryNorm = tf.norm(queryTensor, "euclidean", 1);
      const normalizedQuery = queryTensor.div(queryNorm);

      // Normalize index vectors (pre-calculating this would be an optimization)
      const indexNorm = tf
        .norm(this.tensorIndex!, "euclidean", 1)
        .expandDims(1);
      const normalizedIndex = this.tensorIndex!.div(indexNorm);

      // Cosine similarity = dot product of normalized vectors
      const scores = tf
        .matMul(normalizedQuery, normalizedIndex, false, true)
        .squeeze();

      // Get top k
      const { values, indices } = tf.topk(
        scores,
        Math.min(limit, this.vectorCache.size)
      );

      return {
        scoreValues: Array.from(values.dataSync()),
        indexValues: Array.from(indices.dataSync()),
      };
    }) as unknown as { scoreValues: number[]; indexValues: number[] };

    const results: VectorSearchResult[] = [];
    for (let i = 0; i < indexValues.length; i++) {
      const score = scoreValues[i];
      if (score < minScore) continue;

      const idx = indexValues[i];
      const id = this.idMap[idx];

      results.push({
        id,
        score,
        metadata: this.metadataCache.get(id),
      });
    }

    return results;
  }

  /**
   * Delete a vector
   */
  async delete(id: string): Promise<void> {
    await this.connection.execute(
      `DELETE FROM ${this.tableName} WHERE id = ?`,
      [id]
    );
    this.vectorCache.delete(id);
    this.metadataCache.delete(id);
    this.isDirty = true;
  }

  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    const placeholders = ids.map(() => "?").join(",");
    await this.connection.execute(
      `DELETE FROM ${this.tableName} WHERE id IN (${placeholders})`,
      ids
    );

    for (const id of ids) {
      this.vectorCache.delete(id);
      this.metadataCache.delete(id);
    }
    this.isDirty = true;
  }

  /**
   * Clear all vectors
   */
  async clear(): Promise<void> {
    await this.connection.execute(`DELETE FROM ${this.tableName}`);
    this.vectorCache.clear();
    this.metadataCache.clear();
    this.idMap = [];
    if (this.tensorIndex) {
      this.tensorIndex.dispose();
      this.tensorIndex = null;
    }
  }

  dispose(): void {
    if (this.tensorIndex) {
      this.tensorIndex.dispose();
      this.tensorIndex = null;
    }
    this.vectorCache.clear();
    this.metadataCache.clear();
    this.idMap = [];
    this.isDirty = false;
  }
}
