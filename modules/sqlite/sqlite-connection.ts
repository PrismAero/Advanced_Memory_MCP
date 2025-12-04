import { promises as fs } from "fs";
import path from "path";
import sqlite3 from "sqlite3";
import { logger } from "../logger.js";

/**
 * SQLite Connection and Schema Management
 * Handles database initialization, schema creation, and query operations
 */
export class SQLiteConnection {
  private db: sqlite3.Database | null = null;
  private dbPath: string;
  private branchesPath: string;
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = path.resolve(basePath);
    this.branchesPath = path.join(this.basePath, ".memory");
    this.dbPath = path.join(this.branchesPath, "memory.db");
  }

  async initialize(): Promise<void> {
    // Ensure directories exist (skip creating drive roots on Windows)
    const parsedBase = path.parse(this.basePath);
    const isDriveRoot = parsedBase.root === this.basePath;

    if (!isDriveRoot) {
      await fs.mkdir(this.basePath, { recursive: true });
    }

    await fs.mkdir(this.branchesPath, { recursive: true });

    // Create SQLite database
    this.db = new sqlite3.Database(this.dbPath);

    // Enable optimizations
    await this.runQuery("PRAGMA foreign_keys = ON");
    await this.runQuery("PRAGMA journal_mode = WAL");
    await this.runQuery("PRAGMA synchronous = NORMAL");
    await this.runQuery("PRAGMA cache_size = 10000");

    // Create schema
    await this.createSchema();

    // Ensure main branch exists
    await this.runQuery(
      'INSERT OR IGNORE INTO memory_branches (id, name, purpose) VALUES (1, "main", "Main project memory - core entities, business logic, and system architecture")'
    );
  }

  private async createSchema(): Promise<void> {
    const queries = [
      // Memory branches
      `CREATE TABLE IF NOT EXISTS memory_branches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        purpose TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Entities with optimization fields
      `CREATE TABLE IF NOT EXISTS entities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        branch_id INTEGER DEFAULT 1,
        status TEXT DEFAULT 'active',
        status_reason TEXT,
        original_content TEXT NOT NULL,
        optimized_content TEXT,
        token_count INTEGER DEFAULT 0,
        compression_ratio REAL DEFAULT 1.0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES memory_branches(id) ON DELETE CASCADE,
        UNIQUE(name, branch_id)
      )`,

      // Observations (normalized)
      `CREATE TABLE IF NOT EXISTS observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        optimized_content TEXT,
        sequence_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
      )`,

      // Relations
      `CREATE TABLE IF NOT EXISTS relations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_entity_id INTEGER NOT NULL,
        to_entity_id INTEGER NOT NULL,
        relation_type TEXT NOT NULL,
        branch_id INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (from_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
        FOREIGN KEY (to_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
        FOREIGN KEY (branch_id) REFERENCES memory_branches(id) ON DELETE CASCADE,
        UNIQUE(from_entity_id, to_entity_id, relation_type)
      )`,

      // Keywords for fast search
      `CREATE TABLE IF NOT EXISTS keywords (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        keyword TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        weight REAL DEFAULT 1.0,
        context TEXT,
        FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
      )`,

      // Cross-references
      `CREATE TABLE IF NOT EXISTS cross_references (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_entity_id INTEGER NOT NULL,
        target_branch_id INTEGER NOT NULL,
        target_entity_name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (from_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
        FOREIGN KEY (target_branch_id) REFERENCES memory_branches(id)
      )`,

      // Full-text search
      `CREATE VIRTUAL TABLE IF NOT EXISTS entities_fts USING fts5(
        name, entity_type, optimized_content, content='entities', content_rowid='id'
      )`,

      // FTS triggers
      `CREATE TRIGGER IF NOT EXISTS entities_fts_insert AFTER INSERT ON entities BEGIN
        INSERT INTO entities_fts(rowid, name, entity_type, optimized_content)
        VALUES (new.id, new.name, new.entity_type, new.optimized_content);
      END`,

      `CREATE TRIGGER IF NOT EXISTS entities_fts_delete AFTER DELETE ON entities BEGIN
        DELETE FROM entities_fts WHERE rowid = old.id;
      END`,

      `CREATE TRIGGER IF NOT EXISTS entities_fts_update AFTER UPDATE ON entities BEGIN
        DELETE FROM entities_fts WHERE rowid = old.id;
        INSERT INTO entities_fts(rowid, name, entity_type, optimized_content)
        VALUES (new.id, new.name, new.entity_type, new.optimized_content);
      END`,
    ];

    for (const query of queries) {
      await this.runQuery(query);
    }

    // Create indexes
    const indexes = [
      "CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name)",
      "CREATE INDEX IF NOT EXISTS idx_entities_branch ON entities(branch_id)",
      "CREATE INDEX IF NOT EXISTS idx_entities_status ON entities(status)",
      "CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type)",
      "CREATE INDEX IF NOT EXISTS idx_entities_accessed ON entities(last_accessed)",
      "CREATE INDEX IF NOT EXISTS idx_keywords_keyword ON keywords(keyword)",
      "CREATE INDEX IF NOT EXISTS idx_keywords_entity ON keywords(entity_id)",
      "CREATE INDEX IF NOT EXISTS idx_relations_from ON relations(from_entity_id)",
      "CREATE INDEX IF NOT EXISTS idx_relations_to ON relations(to_entity_id)",
      "CREATE INDEX IF NOT EXISTS idx_relations_type ON relations(relation_type)",
    ];

    for (const index of indexes) {
      await this.runQuery(index);
    }
  }

  async runQuery(query: string, params: any[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      this.db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async getQuery(query: string, params: any[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      this.db.get(query, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  async close(): Promise<void> {
    if (this.db) {
      return new Promise((resolve) => {
        this.db!.close((err) => {
          if (err) {
            logger.error("Error closing database:", err);
          }
          resolve();
        });
      });
    }
  }

  async getBranchId(branchName?: string): Promise<number> {
    const name = branchName || "main";
    const branch = await this.getQuery(
      "SELECT id FROM memory_branches WHERE name = ?",
      [name]
    );

    if (branch) {
      return branch.id;
    }

    // Create branch if it doesn't exist
    await this.runQuery(
      "INSERT INTO memory_branches (name, purpose) VALUES (?, ?)",
      [name, `Auto-created branch: ${name}`]
    );

    const newBranch = await this.getQuery(
      "SELECT id FROM memory_branches WHERE name = ?",
      [name]
    );

    return newBranch.id;
  }
}
