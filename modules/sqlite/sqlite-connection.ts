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
  private initialized: boolean = false;
  private initializePromise: Promise<void> | null = null;

  constructor(basePath: string) {
    this.basePath = path.resolve(basePath);
    this.branchesPath = path.join(this.basePath, ".memory");
    this.dbPath = path.join(this.branchesPath, "memory.db");
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initializePromise) return this.initializePromise;
    this.initializePromise = this.doInitialize().then(() => {
      this.initialized = true;
    });
    return this.initializePromise;
  }

  private async doInitialize(): Promise<void> {
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
    // Block writers for up to 5s on contention before raising SQLITE_BUSY.
    // We still share a single connection, but background analysis and
    // tool-driven writes can occasionally overlap.
    await this.runQuery("PRAGMA busy_timeout = 5000");

    // Create schema
    await this.createSchema();

    // Run AI enhancements migration
    await this.migrateToAIEnhancements();

    // Ensure main branch exists
    await this.runQuery(
      'INSERT OR IGNORE INTO memory_branches (id, name, purpose) VALUES (1, "main", "Main project memory - core entities, business logic, and system architecture")'
    );
  }

  private async createSchema(): Promise<void> {
    const queries = [
      // Memory branches with AI enhancements
      `CREATE TABLE IF NOT EXISTS memory_branches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        purpose TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        current_focus INTEGER DEFAULT 0,
        project_phase TEXT DEFAULT 'active-development'
      )`,

      // Entities with optimization fields and AI enhancements
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
        working_context INTEGER DEFAULT 0,
        relevance_score REAL DEFAULT 0.5,
        embedding BLOB,
        FOREIGN KEY (branch_id) REFERENCES memory_branches(id) ON DELETE CASCADE,
        UNIQUE(name, branch_id)
      )`,

      // Observations with AI-enhanced metadata
      `CREATE TABLE IF NOT EXISTS observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        optimized_content TEXT,
        sequence_order INTEGER DEFAULT 0,
        observation_type TEXT DEFAULT 'reference',
        priority TEXT DEFAULT 'normal',
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

      // Branch relationships for AI context management
      `CREATE TABLE IF NOT EXISTS branch_relationships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_branch_id INTEGER NOT NULL,
        to_branch_id INTEGER NOT NULL,
        relationship_type TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (from_branch_id) REFERENCES memory_branches(id) ON DELETE CASCADE,
        FOREIGN KEY (to_branch_id) REFERENCES memory_branches(id) ON DELETE CASCADE,
        UNIQUE(from_branch_id, to_branch_id, relationship_type)
      )`,

      // Project analysis tables for AI-driven code intelligence

      // Project files table - tracks all files in the project
      `CREATE TABLE IF NOT EXISTS project_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL UNIQUE,
        relative_path TEXT NOT NULL,
        file_type TEXT NOT NULL,
        language TEXT NOT NULL,
        category TEXT NOT NULL, -- source, config, documentation, test, etc.
        size_bytes INTEGER DEFAULT 0,
        line_count INTEGER DEFAULT 0,
        last_modified DATETIME NOT NULL,
        last_analyzed DATETIME DEFAULT CURRENT_TIMESTAMP,
        branch_id INTEGER DEFAULT 1,
        is_entry_point INTEGER DEFAULT 0,
        has_tests INTEGER DEFAULT 0,
        complexity TEXT DEFAULT 'low', -- low, medium, high
        documentation_percentage REAL DEFAULT 0.0,
        analysis_metadata TEXT, -- JSON blob with additional metadata
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES memory_branches(id) ON DELETE CASCADE
      )`,

      // Code interfaces table - TypeScript interfaces, API contracts, etc.
      `CREATE TABLE IF NOT EXISTS code_interfaces (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        file_id INTEGER NOT NULL,
        line_number INTEGER NOT NULL,
        interface_type TEXT NOT NULL, -- interface, type, class, function, api_endpoint
        definition TEXT NOT NULL, -- Full interface definition
        properties TEXT, -- JSON array of property names and types
        extends_interfaces TEXT, -- JSON array of extended interface names
        is_exported INTEGER DEFAULT 0,
        is_generic INTEGER DEFAULT 0,
        usage_count INTEGER DEFAULT 0,
        last_used DATETIME,
        embedding BLOB, -- TensorFlow.js embedding for semantic search
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (file_id) REFERENCES project_files(id) ON DELETE CASCADE,
        UNIQUE(name, file_id, line_number)
      )`,

      // Project dependencies table - import/export relationships
      `CREATE TABLE IF NOT EXISTS project_dependencies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_file_id INTEGER NOT NULL,
        to_file_id INTEGER,
        dependency_type TEXT NOT NULL, -- import, export, require, interface_usage
        source_identifier TEXT NOT NULL, -- What is being imported/used
        target_identifier TEXT, -- What it maps to in the target
        line_number INTEGER NOT NULL,
        is_default_import INTEGER DEFAULT 0,
        is_namespace_import INTEGER DEFAULT 0,
        is_type_only INTEGER DEFAULT 0,
        external_package TEXT, -- For npm/pip packages
        resolution_status TEXT DEFAULT 'resolved', -- resolved, unresolved, error
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (from_file_id) REFERENCES project_files(id) ON DELETE CASCADE,
        FOREIGN KEY (to_file_id) REFERENCES project_files(id) ON DELETE CASCADE
      )`,

      // Workspace context table - monorepo and project structure
      `CREATE TABLE IF NOT EXISTS workspace_context (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_name TEXT NOT NULL,
        workspace_path TEXT NOT NULL,
        project_type TEXT NOT NULL, -- react, nodejs, python, monorepo, etc.
        package_manager TEXT NOT NULL, -- npm, yarn, pnpm, pip, etc.
        root_path TEXT NOT NULL,
        config_files TEXT, -- JSON array of important config files
        entry_points TEXT, -- JSON array of main entry points
        frameworks TEXT, -- JSON array of detected frameworks
        languages TEXT, -- JSON array of programming languages
        workspace_dependencies TEXT, -- JSON object of workspace relationships
        total_files INTEGER DEFAULT 0,
        total_size_bytes INTEGER DEFAULT 0,
        last_indexed DATETIME DEFAULT CURRENT_TIMESTAMP,
        indexing_status TEXT DEFAULT 'pending', -- pending, indexing, completed, error
        branch_id INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES memory_branches(id) ON DELETE CASCADE,
        UNIQUE(workspace_path, branch_id)
      )`,

      // Interface relationships table - tracks how interfaces relate to each other
      `CREATE TABLE IF NOT EXISTS interface_relationships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_interface_id INTEGER NOT NULL,
        to_interface_id INTEGER NOT NULL,
        relationship_type TEXT NOT NULL, -- extends, implements, uses, similar_to
        confidence_score REAL DEFAULT 0.5,
        semantic_similarity REAL DEFAULT 0.0,
        usage_frequency INTEGER DEFAULT 0,
        last_detected DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (from_interface_id) REFERENCES code_interfaces(id) ON DELETE CASCADE,
        FOREIGN KEY (to_interface_id) REFERENCES code_interfaces(id) ON DELETE CASCADE,
        UNIQUE(from_interface_id, to_interface_id, relationship_type)
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

    // Create indexes including AI enhancements
    const indexes = [
      "CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name)",
      "CREATE INDEX IF NOT EXISTS idx_entities_branch ON entities(branch_id)",
      "CREATE INDEX IF NOT EXISTS idx_entities_status ON entities(status)",
      "CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type)",
      "CREATE INDEX IF NOT EXISTS idx_entities_accessed ON entities(last_accessed)",
      "CREATE INDEX IF NOT EXISTS idx_entities_working_context ON entities(working_context)",
      "CREATE INDEX IF NOT EXISTS idx_entities_relevance ON entities(relevance_score)",
      "CREATE INDEX IF NOT EXISTS idx_branches_focus ON memory_branches(current_focus)",
      "CREATE INDEX IF NOT EXISTS idx_branches_phase ON memory_branches(project_phase)",
      "CREATE INDEX IF NOT EXISTS idx_observations_type ON observations(observation_type)",
      "CREATE INDEX IF NOT EXISTS idx_observations_priority ON observations(priority)",
      "CREATE INDEX IF NOT EXISTS idx_branch_relationships_from ON branch_relationships(from_branch_id)",
      "CREATE INDEX IF NOT EXISTS idx_branch_relationships_to ON branch_relationships(to_branch_id)",
      "CREATE INDEX IF NOT EXISTS idx_keywords_keyword ON keywords(keyword)",
      "CREATE INDEX IF NOT EXISTS idx_keywords_entity ON keywords(entity_id)",
      "CREATE INDEX IF NOT EXISTS idx_relations_from ON relations(from_entity_id)",
      "CREATE INDEX IF NOT EXISTS idx_relations_to ON relations(to_entity_id)",
      "CREATE INDEX IF NOT EXISTS idx_relations_type ON relations(relation_type)",

      // Project analysis indexes
      "CREATE INDEX IF NOT EXISTS idx_project_files_path ON project_files(file_path)",
      "CREATE INDEX IF NOT EXISTS idx_project_files_type ON project_files(file_type)",
      "CREATE INDEX IF NOT EXISTS idx_project_files_language ON project_files(language)",
      "CREATE INDEX IF NOT EXISTS idx_project_files_category ON project_files(category)",
      "CREATE INDEX IF NOT EXISTS idx_project_files_modified ON project_files(last_modified)",
      "CREATE INDEX IF NOT EXISTS idx_project_files_branch ON project_files(branch_id)",
      "CREATE INDEX IF NOT EXISTS idx_project_files_entry_point ON project_files(is_entry_point)",

      "CREATE INDEX IF NOT EXISTS idx_code_interfaces_name ON code_interfaces(name)",
      "CREATE INDEX IF NOT EXISTS idx_code_interfaces_file ON code_interfaces(file_id)",
      "CREATE INDEX IF NOT EXISTS idx_code_interfaces_type ON code_interfaces(interface_type)",
      "CREATE INDEX IF NOT EXISTS idx_code_interfaces_exported ON code_interfaces(is_exported)",
      "CREATE INDEX IF NOT EXISTS idx_code_interfaces_usage ON code_interfaces(usage_count)",

      "CREATE INDEX IF NOT EXISTS idx_project_deps_from ON project_dependencies(from_file_id)",
      "CREATE INDEX IF NOT EXISTS idx_project_deps_to ON project_dependencies(to_file_id)",
      "CREATE INDEX IF NOT EXISTS idx_project_deps_type ON project_dependencies(dependency_type)",
      "CREATE INDEX IF NOT EXISTS idx_project_deps_identifier ON project_dependencies(source_identifier)",
      "CREATE INDEX IF NOT EXISTS idx_project_deps_package ON project_dependencies(external_package)",

      "CREATE INDEX IF NOT EXISTS idx_workspace_context_path ON workspace_context(workspace_path)",
      "CREATE INDEX IF NOT EXISTS idx_workspace_context_type ON workspace_context(project_type)",
      "CREATE INDEX IF NOT EXISTS idx_workspace_context_branch ON workspace_context(branch_id)",
      "CREATE INDEX IF NOT EXISTS idx_workspace_context_status ON workspace_context(indexing_status)",

      "CREATE INDEX IF NOT EXISTS idx_interface_rels_from ON interface_relationships(from_interface_id)",
      "CREATE INDEX IF NOT EXISTS idx_interface_rels_to ON interface_relationships(to_interface_id)",
      "CREATE INDEX IF NOT EXISTS idx_interface_rels_type ON interface_relationships(relationship_type)",
      "CREATE INDEX IF NOT EXISTS idx_interface_rels_confidence ON interface_relationships(confidence_score)",
    ];

    for (const index of indexes) {
      await this.runQuery(index);
    }
  }

  /**
   * Safely execute an ALTER TABLE query, handling expected "duplicate column" errors
   */
  private async safeAlterTable(query: string): Promise<void> {
    try {
      await this.runQuery(query);
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      // SQLite "duplicate column" error is expected during migration
      if (
        errorMessage.includes("duplicate column") ||
        errorMessage.includes("already exists")
      ) {
        // Column already exists - this is expected, no need to log
        return;
      }
      // Log unexpected errors but don't fail the migration
      logger.warn(
        `Migration warning for query "${query.substring(
          0,
          50
        )}...": ${errorMessage}`
      );
    }
  }

  /**
   * Migrate existing databases to support AI enhancements
   * Adds new columns if they don't exist for backwards compatibility
   */
  private async migrateToAIEnhancements(): Promise<void> {
    try {
      // Add AI enhancement columns to entities table
      await this.safeAlterTable(
        "ALTER TABLE entities ADD COLUMN working_context INTEGER DEFAULT 0"
      );

      await this.safeAlterTable(
        "ALTER TABLE entities ADD COLUMN relevance_score REAL DEFAULT 0.5"
      );

      // Add AI enhancement columns to memory_branches table
      await this.safeAlterTable(
        "ALTER TABLE memory_branches ADD COLUMN current_focus INTEGER DEFAULT 0"
      );

      await this.safeAlterTable(
        "ALTER TABLE memory_branches ADD COLUMN project_phase TEXT DEFAULT 'active-development'"
      );

      // Add AI enhancement columns to observations table
      await this.safeAlterTable(
        "ALTER TABLE observations ADD COLUMN observation_type TEXT DEFAULT 'reference'"
      );

      await this.safeAlterTable(
        "ALTER TABLE observations ADD COLUMN priority TEXT DEFAULT 'normal'"
      );

      // Add embedding column for TensorFlow.js support
      await this.safeAlterTable(
        "ALTER TABLE entities ADD COLUMN embedding BLOB"
      );

      // Add embedding columns to project analysis tables if they exist
      await this.safeAlterTable(
        "ALTER TABLE project_files ADD COLUMN embedding BLOB"
      );

      await this.safeAlterTable(
        "ALTER TABLE code_interfaces ADD COLUMN embedding BLOB"
      );

      // Create project analysis tables if they don't exist
      const projectTables = [
        `CREATE TABLE IF NOT EXISTS project_files (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          file_path TEXT NOT NULL UNIQUE,
          relative_path TEXT NOT NULL,
          file_type TEXT NOT NULL,
          language TEXT NOT NULL,
          category TEXT NOT NULL,
          size_bytes INTEGER DEFAULT 0,
          line_count INTEGER DEFAULT 0,
          last_modified DATETIME NOT NULL,
          last_analyzed DATETIME DEFAULT CURRENT_TIMESTAMP,
          branch_id INTEGER DEFAULT 1,
          is_entry_point INTEGER DEFAULT 0,
          has_tests INTEGER DEFAULT 0,
          complexity TEXT DEFAULT 'low',
          documentation_percentage REAL DEFAULT 0.0,
          analysis_metadata TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (branch_id) REFERENCES memory_branches(id) ON DELETE CASCADE
        )`,

        `CREATE TABLE IF NOT EXISTS code_interfaces (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          file_id INTEGER NOT NULL,
          line_number INTEGER NOT NULL,
          interface_type TEXT NOT NULL,
          definition TEXT NOT NULL,
          properties TEXT,
          extends_interfaces TEXT,
          is_exported INTEGER DEFAULT 0,
          is_generic INTEGER DEFAULT 0,
          usage_count INTEGER DEFAULT 0,
          last_used DATETIME,
          embedding BLOB,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (file_id) REFERENCES project_files(id) ON DELETE CASCADE,
          UNIQUE(name, file_id, line_number)
        )`,

        `CREATE TABLE IF NOT EXISTS project_dependencies (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          from_file_id INTEGER NOT NULL,
          to_file_id INTEGER,
          dependency_type TEXT NOT NULL,
          source_identifier TEXT NOT NULL,
          target_identifier TEXT,
          line_number INTEGER NOT NULL,
          is_default_import INTEGER DEFAULT 0,
          is_namespace_import INTEGER DEFAULT 0,
          is_type_only INTEGER DEFAULT 0,
          external_package TEXT,
          resolution_status TEXT DEFAULT 'resolved',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (from_file_id) REFERENCES project_files(id) ON DELETE CASCADE,
          FOREIGN KEY (to_file_id) REFERENCES project_files(id) ON DELETE CASCADE
        )`,

        `CREATE TABLE IF NOT EXISTS workspace_context (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          workspace_name TEXT NOT NULL,
          workspace_path TEXT NOT NULL,
          project_type TEXT NOT NULL,
          package_manager TEXT NOT NULL,
          root_path TEXT NOT NULL,
          config_files TEXT,
          entry_points TEXT,
          frameworks TEXT,
          languages TEXT,
          workspace_dependencies TEXT,
          total_files INTEGER DEFAULT 0,
          total_size_bytes INTEGER DEFAULT 0,
          last_indexed DATETIME DEFAULT CURRENT_TIMESTAMP,
          indexing_status TEXT DEFAULT 'pending',
          branch_id INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (branch_id) REFERENCES memory_branches(id) ON DELETE CASCADE,
          UNIQUE(workspace_path, branch_id)
        )`,

        `CREATE TABLE IF NOT EXISTS interface_relationships (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          from_interface_id INTEGER NOT NULL,
          to_interface_id INTEGER NOT NULL,
          relationship_type TEXT NOT NULL,
          confidence_score REAL DEFAULT 0.5,
          semantic_similarity REAL DEFAULT 0.0,
          usage_frequency INTEGER DEFAULT 0,
          last_detected DATETIME DEFAULT CURRENT_TIMESTAMP,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (from_interface_id) REFERENCES code_interfaces(id) ON DELETE CASCADE,
          FOREIGN KEY (to_interface_id) REFERENCES code_interfaces(id) ON DELETE CASCADE,
          UNIQUE(from_interface_id, to_interface_id, relationship_type)
        )`,
      ];

      for (const tableQuery of projectTables) {
        await this.runQuery(tableQuery).catch((error) => {
          logger.warn("Failed to create project analysis table:", error);
        });
      }

      logger.info(
        "AI enhancements and project analysis migration completed successfully"
      );
    } catch (error) {
      logger.error("Error during AI enhancements migration:", error);
      // Don't fail initialization if migration has issues
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

  async execute(
    query: string,
    params: any[] = []
  ): Promise<{ lastID: number; changes: number }> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      this.db.run(query, params, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
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
