import { logger } from "../logger.js";
import {
  ExportInfo,
  FileAnalysis,
  ImportInfo,
  InterfaceInfo,
  ProjectInfo,
} from "../project-analysis/project-indexer.js";
import { SQLiteConnection } from "./sqlite-connection.js";
import { VectorStore } from "../vector-store.js";

/**
 * Project file record for database storage
 */
export interface ProjectFileRecord {
  id?: number;
  file_path: string;
  relative_path: string;
  file_type: string;
  language: string;
  category: string;
  size_bytes: number;
  line_count: number;
  last_modified: string; // ISO timestamp
  last_analyzed?: string;
  branch_id: number;
  is_entry_point: boolean;
  has_tests: boolean;
  complexity: "low" | "medium" | "high";
  documentation_percentage: number;
  analysis_metadata?: string; // JSON string
  created_at?: string;
  updated_at?: string;
}

/**
 * Code interface record for database storage
 */
export interface CodeInterfaceRecord {
  id?: number;
  name: string;
  file_id: number;
  line_number: number;
  interface_type: string;
  definition: string;
  properties?: string; // JSON array
  extends_interfaces?: string; // JSON array
  is_exported: boolean;
  is_generic: boolean;
  usage_count: number;
  last_used?: string;
  embedding?: Buffer;
  created_at?: string;
  updated_at?: string;
}

/**
 * Project dependency record for database storage
 */
export interface ProjectDependencyRecord {
  id?: number;
  from_file_id: number;
  to_file_id?: number;
  dependency_type: string;
  source_identifier: string;
  target_identifier?: string;
  line_number: number;
  is_default_import: boolean;
  is_namespace_import: boolean;
  is_type_only: boolean;
  external_package?: string;
  resolution_status: "resolved" | "unresolved" | "error";
  created_at?: string;
  updated_at?: string;
}

/**
 * Workspace context record for database storage
 */
export interface WorkspaceContextRecord {
  id?: number;
  workspace_name: string;
  workspace_path: string;
  project_type: string;
  package_manager: string;
  root_path: string;
  config_files?: string; // JSON array
  entry_points?: string; // JSON array
  frameworks?: string; // JSON array
  languages?: string; // JSON array
  workspace_dependencies?: string; // JSON object
  total_files: number;
  total_size_bytes: number;
  last_indexed: string;
  indexing_status: "pending" | "indexing" | "completed" | "error";
  branch_id: number;
  created_at?: string;
  updated_at?: string;
}

/**
 * Interface relationship record for database storage
 */
export interface InterfaceRelationshipRecord {
  id?: number;
  from_interface_id: number;
  to_interface_id: number;
  relationship_type: string;
  confidence_score: number;
  semantic_similarity: number;
  usage_frequency: number;
  last_detected: string;
  created_at?: string;
}

/**
 * Project Analysis Database Operations
 * Handles CRUD operations for project analysis data
 */
export class ProjectAnalysisOperations {
  constructor(private connection: SQLiteConnection) {}

  /**
   * Store or update project files from analysis
   */
  async storeProjectFiles(
    files: FileAnalysis[],
    branchName?: string
  ): Promise<ProjectFileRecord[]> {
    const branchId = await this.connection.getBranchId(branchName);
    const storedFiles: ProjectFileRecord[] = [];

    logger.info(`[FOLDER] Storing ${files.length} project files`);

    for (const file of files) {
      try {
        const record = await this.storeOrUpdateProjectFile(file, branchId);
        if (record) {
          storedFiles.push(record);
        }
      } catch (error) {
        logger.warn(`Failed to store project file ${file.filePath}:`, error);
      }
    }

    logger.info(
      `[SUCCESS] Stored ${storedFiles.length} project files successfully`
    );
    return storedFiles;
  }

  /**
   * Store or update a single project file
   */
  async storeOrUpdateProjectFile(
    file: FileAnalysis,
    branchId: number
  ): Promise<ProjectFileRecord | null> {
    try {
      // Check if file already exists
      const existing = await this.connection.getQuery(
        "SELECT id FROM project_files WHERE file_path = ? AND branch_id = ?",
        [file.filePath, branchId]
      );

      const now = new Date().toISOString();
      const record: ProjectFileRecord = {
        file_path: file.filePath,
        relative_path: file.relativePath,
        file_type: file.fileType.extension,
        language: file.fileType.language,
        category: file.fileType.category,
        size_bytes: file.size,
        line_count: file.analysisMetadata.lineCount,
        last_modified: file.lastModified.toISOString(),
        last_analyzed: now,
        branch_id: branchId,
        is_entry_point: file.isEntryPoint,
        has_tests: file.analysisMetadata.hasTests,
        complexity: file.analysisMetadata.complexity,
        documentation_percentage: file.analysisMetadata.documentation,
        analysis_metadata: JSON.stringify({
          imports_count: file.imports.length,
          exports_count: file.exports.length,
          interfaces_count: file.interfaces.length,
          dependencies_count: file.dependencies.length,
        }),
      };

      if (existing) {
        // Update existing record
        await this.connection.runQuery(
          `UPDATE project_files SET 
           file_type = ?, language = ?, category = ?, size_bytes = ?, line_count = ?,
           last_modified = ?, last_analyzed = ?, is_entry_point = ?, has_tests = ?,
           complexity = ?, documentation_percentage = ?, analysis_metadata = ?, updated_at = ?
           WHERE id = ?`,
          [
            record.file_type,
            record.language,
            record.category,
            record.size_bytes,
            record.line_count,
            record.last_modified,
            record.last_analyzed,
            record.is_entry_point ? 1 : 0,
            record.has_tests ? 1 : 0,
            record.complexity,
            record.documentation_percentage,
            record.analysis_metadata,
            now,
            existing.id,
          ]
        );

        record.id = existing.id;
        record.updated_at = now;
      } else {
        // Insert new record
        await this.connection.runQuery(
          `INSERT INTO project_files (
            file_path, relative_path, file_type, language, category, size_bytes,
            line_count, last_modified, last_analyzed, branch_id, is_entry_point,
            has_tests, complexity, documentation_percentage, analysis_metadata, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            record.file_path,
            record.relative_path,
            record.file_type,
            record.language,
            record.category,
            record.size_bytes,
            record.line_count,
            record.last_modified,
            record.last_analyzed,
            record.branch_id,
            record.is_entry_point ? 1 : 0,
            record.has_tests ? 1 : 0,
            record.complexity,
            record.documentation_percentage,
            record.analysis_metadata,
            now,
            now,
          ]
        );

        const newRecord = await this.connection.getQuery(
          "SELECT * FROM project_files WHERE file_path = ? AND branch_id = ?",
          [record.file_path, record.branch_id]
        );

        if (newRecord) {
          record.id = newRecord.id;
          record.created_at = newRecord.created_at;
          record.updated_at = newRecord.updated_at;
        }
      }

      return record;
    } catch (error) {
      logger.error(`Failed to store project file ${file.filePath}:`, error);
      return null;
    }
  }

  /**
   * Store code interfaces from file analysis
   */
  async storeCodeInterfaces(
    fileId: number,
    interfaces: InterfaceInfo[],
    embedding?: number[]
  ): Promise<CodeInterfaceRecord[]> {
    const storedInterfaces: CodeInterfaceRecord[] = [];

    for (const iface of interfaces) {
      try {
        const record = await this.storeCodeInterface(fileId, iface, embedding);
        if (record) {
          storedInterfaces.push(record);
        }
      } catch (error) {
        logger.warn(`Failed to store interface ${iface.name}:`, error);
      }
    }

    return storedInterfaces;
  }

  /**
   * Store a single code interface
   */
  async storeCodeInterface(
    fileId: number,
    iface: InterfaceInfo,
    embedding?: number[]
  ): Promise<CodeInterfaceRecord | null> {
    try {
      const now = new Date().toISOString();
      const embeddingBuffer = embedding
        ? Buffer.from(new Float32Array(embedding).buffer)
        : null;

      // Check if interface already exists
      const existing = await this.connection.getQuery(
        "SELECT id FROM code_interfaces WHERE name = ? AND file_id = ? AND line_number = ?",
        [iface.name, fileId, iface.line]
      );

      const record: CodeInterfaceRecord = {
        name: iface.name,
        file_id: fileId,
        line_number: iface.line,
        interface_type: "interface", // Default type, can be enhanced
        definition: `interface ${iface.name}`, // Simplified, can be enhanced
        properties: JSON.stringify(iface.properties),
        extends_interfaces: JSON.stringify(iface.extends),
        is_exported: iface.isExported,
        is_generic: false, // Can be enhanced with better parsing
        usage_count: 0,
        embedding: embeddingBuffer || undefined,
      };

      if (existing) {
        // Update existing record
        await this.connection.runQuery(
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
          ]
        );

        record.id = existing.id;
        record.updated_at = now;
      } else {
        // Insert new record
        await this.connection.runQuery(
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
          ]
        );

        const newRecord = await this.connection.getQuery(
          "SELECT * FROM code_interfaces WHERE name = ? AND file_id = ? AND line_number = ?",
          [record.name, record.file_id, record.line_number]
        );

        if (newRecord) {
          record.id = newRecord.id;
          record.created_at = newRecord.created_at;
          record.updated_at = newRecord.updated_at;
        }
      }

      return record;
    } catch (error) {
      logger.error(`Failed to store code interface ${iface.name}:`, error);
      return null;
    }
  }

  /**
   * Store project dependencies from file analysis
   */
  async storeProjectDependencies(
    fromFileId: number,
    imports: ImportInfo[],
    exports: ExportInfo[]
  ): Promise<ProjectDependencyRecord[]> {
    const storedDependencies: ProjectDependencyRecord[] = [];

    // Store imports
    for (const imp of imports) {
      try {
        const record = await this.storeProjectDependency(
          fromFileId,
          imp,
          "import"
        );
        if (record) {
          storedDependencies.push(record);
        }
      } catch (error) {
        logger.warn(`Failed to store import dependency ${imp.source}:`, error);
      }
    }

    // Store exports
    for (const exp of exports) {
      try {
        const record = await this.storeProjectDependency(
          fromFileId,
          exp,
          "export"
        );
        if (record) {
          storedDependencies.push(record);
        }
      } catch (error) {
        logger.warn(`Failed to store export dependency ${exp.name}:`, error);
      }
    }

    return storedDependencies;
  }

  /**
   * Store a single project dependency
   */
  async storeProjectDependency(
    fromFileId: number,
    dependency: ImportInfo | ExportInfo,
    type: "import" | "export"
  ): Promise<ProjectDependencyRecord | null> {
    try {
      const now = new Date().toISOString();
      let sourceIdentifier: string;
      let lineNumber: number;
      let isDefault = false;
      let isNamespace = false;
      let externalPackage: string | undefined;

      if (type === "import") {
        const imp = dependency as ImportInfo;
        sourceIdentifier = imp.source;
        lineNumber = imp.line;
        isDefault = imp.isDefault;
        isNamespace = imp.isNamespace;

        // Determine if it's an external package
        if (!imp.source.startsWith(".") && !imp.source.startsWith("/")) {
          externalPackage = imp.source.split("/")[0];
        }
      } else {
        const exp = dependency as ExportInfo;
        sourceIdentifier = exp.name;
        lineNumber = exp.line;
        isDefault = exp.type === "default";
      }

      // Try to resolve the target file ID for internal dependencies
      let toFileId: number | undefined;
      if (type === "import" && !externalPackage) {
        const imp = dependency as ImportInfo;
        // Attempt to resolve relative import to actual file
        // This is simplified - could be enhanced with better resolution logic
        const targetFile = await this.connection.getQuery(
          "SELECT id FROM project_files WHERE relative_path LIKE ?",
          [`%${imp.source}%`]
        );
        if (targetFile) {
          toFileId = targetFile.id;
        }
      }

      const record: ProjectDependencyRecord = {
        from_file_id: fromFileId,
        to_file_id: toFileId,
        dependency_type: type,
        source_identifier: sourceIdentifier,
        line_number: lineNumber,
        is_default_import: isDefault,
        is_namespace_import: isNamespace,
        is_type_only: false, // Can be enhanced with TypeScript analysis
        external_package: externalPackage,
        resolution_status: toFileId
          ? "resolved"
          : externalPackage
          ? "resolved"
          : "unresolved",
      };

      // Insert record
      await this.connection.runQuery(
        `INSERT INTO project_dependencies (
          from_file_id, to_file_id, dependency_type, source_identifier, target_identifier,
          line_number, is_default_import, is_namespace_import, is_type_only,
          external_package, resolution_status, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.from_file_id,
          record.to_file_id,
          record.dependency_type,
          record.source_identifier,
          record.target_identifier,
          record.line_number,
          record.is_default_import ? 1 : 0,
          record.is_namespace_import ? 1 : 0,
          record.is_type_only ? 1 : 0,
          record.external_package,
          record.resolution_status,
          now,
          now,
        ]
      );

      return record;
    } catch (error) {
      logger.error(`Failed to store project dependency:`, error);
      return null;
    }
  }

  /**
   * Store workspace context
   */
  async storeWorkspaceContext(
    projectInfo: ProjectInfo,
    branchName?: string
  ): Promise<WorkspaceContextRecord | null> {
    try {
      const branchId = await this.connection.getBranchId(branchName);
      const now = new Date().toISOString();

      const record: WorkspaceContextRecord = {
        workspace_name: projectInfo.projectType,
        workspace_path: projectInfo.rootPath,
        project_type: projectInfo.projectType,
        package_manager: projectInfo.packageManager,
        root_path: projectInfo.rootPath,
        config_files: JSON.stringify([]), // Can be enhanced
        entry_points: JSON.stringify(projectInfo.entryPoints),
        frameworks: JSON.stringify(projectInfo.frameworks),
        languages: JSON.stringify(projectInfo.languages),
        workspace_dependencies: JSON.stringify(projectInfo.workspaces || []),
        total_files: 0, // Will be updated after file indexing
        total_size_bytes: 0, // Will be updated after file indexing
        last_indexed: now,
        indexing_status: "completed",
        branch_id: branchId,
      };

      // Check if workspace already exists
      const existing = await this.connection.getQuery(
        "SELECT id FROM workspace_context WHERE workspace_path = ? AND branch_id = ?",
        [record.workspace_path, record.branch_id]
      );

      if (existing) {
        // Update existing record
        await this.connection.runQuery(
          `UPDATE workspace_context SET 
           workspace_name = ?, project_type = ?, package_manager = ?, config_files = ?,
           entry_points = ?, frameworks = ?, languages = ?, workspace_dependencies = ?,
           last_indexed = ?, indexing_status = ?, updated_at = ?
           WHERE id = ?`,
          [
            record.workspace_name,
            record.project_type,
            record.package_manager,
            record.config_files,
            record.entry_points,
            record.frameworks,
            record.languages,
            record.workspace_dependencies,
            record.last_indexed,
            record.indexing_status,
            now,
            existing.id,
          ]
        );

        record.id = existing.id;
        record.updated_at = now;
      } else {
        // Insert new record
        await this.connection.runQuery(
          `INSERT INTO workspace_context (
            workspace_name, workspace_path, project_type, package_manager, root_path,
            config_files, entry_points, frameworks, languages, workspace_dependencies,
            total_files, total_size_bytes, last_indexed, indexing_status, branch_id,
            created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            record.workspace_name,
            record.workspace_path,
            record.project_type,
            record.package_manager,
            record.root_path,
            record.config_files,
            record.entry_points,
            record.frameworks,
            record.languages,
            record.workspace_dependencies,
            record.total_files,
            record.total_size_bytes,
            record.last_indexed,
            record.indexing_status,
            record.branch_id,
            now,
            now,
          ]
        );

        const newRecord = await this.connection.getQuery(
          "SELECT * FROM workspace_context WHERE workspace_path = ? AND branch_id = ?",
          [record.workspace_path, record.branch_id]
        );

        if (newRecord) {
          record.id = newRecord.id;
          record.created_at = newRecord.created_at;
          record.updated_at = newRecord.updated_at;
        }
      }

      return record;
    } catch (error) {
      logger.error("Failed to store workspace context:", error);
      return null;
    }
  }

  /**
   * Get project files by various criteria
   */
  async getProjectFiles(criteria: {
    branchName?: string;
    fileType?: string;
    language?: string;
    category?: string;
    isEntryPoint?: boolean;
    limit?: number;
  }): Promise<ProjectFileRecord[]> {
    const branchId = criteria.branchName
      ? await this.connection.getBranchId(criteria.branchName)
      : null;

    let whereClause = "WHERE 1=1";
    const params: any[] = [];

    if (branchId) {
      whereClause += " AND branch_id = ?";
      params.push(branchId);
    }

    if (criteria.fileType) {
      whereClause += " AND file_type = ?";
      params.push(criteria.fileType);
    }

    if (criteria.language) {
      whereClause += " AND language = ?";
      params.push(criteria.language);
    }

    if (criteria.category) {
      whereClause += " AND category = ?";
      params.push(criteria.category);
    }

    if (criteria.isEntryPoint !== undefined) {
      whereClause += " AND is_entry_point = ?";
      params.push(criteria.isEntryPoint ? 1 : 0);
    }

    let query = `SELECT * FROM project_files ${whereClause} ORDER BY last_modified DESC`;

    if (criteria.limit) {
      query += ` LIMIT ${criteria.limit}`;
    }

    const rows = await this.connection.runQuery(query, params);
    return rows || [];
  }

  /**
   * Get code interfaces with optional filters
   */
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
      whereClause += " AND name LIKE ?";
      params.push(`%${criteria.name}%`);
    }

    if (criteria.interfaceType) {
      whereClause += " AND interface_type = ?";
      params.push(criteria.interfaceType);
    }

    if (criteria.isExported !== undefined) {
      whereClause += " AND is_exported = ?";
      params.push(criteria.isExported ? 1 : 0);
    }

    let query = `SELECT * FROM code_interfaces ${whereClause} ORDER BY usage_count DESC`;

    if (criteria.limit) {
      query += ` LIMIT ${criteria.limit}`;
    }

    const rows = await this.connection.runQuery(query, params);
    return rows || [];
  }

  /**
   * Update interface usage count
   */
  async updateInterfaceUsage(interfaceId: number): Promise<void> {
    await this.connection.runQuery(
      "UPDATE code_interfaces SET usage_count = usage_count + 1, last_used = ? WHERE id = ?",
      [new Date().toISOString(), interfaceId]
    );
  }

  /**
   * Get project dependencies with filters
   */
  async getProjectDependencies(criteria: {
    fromFileId?: number;
    toFileId?: number;
    dependencyType?: string;
    externalPackage?: string;
    limit?: number;
  }): Promise<ProjectDependencyRecord[]> {
    let whereClause = "WHERE 1=1";
    const params: any[] = [];

    if (criteria.fromFileId) {
      whereClause += " AND from_file_id = ?";
      params.push(criteria.fromFileId);
    }

    if (criteria.toFileId) {
      whereClause += " AND to_file_id = ?";
      params.push(criteria.toFileId);
    }

    if (criteria.dependencyType) {
      whereClause += " AND dependency_type = ?";
      params.push(criteria.dependencyType);
    }

    if (criteria.externalPackage) {
      whereClause += " AND external_package = ?";
      params.push(criteria.externalPackage);
    }

    let query = `SELECT * FROM project_dependencies ${whereClause} ORDER BY created_at DESC`;

    if (criteria.limit) {
      query += ` LIMIT ${criteria.limit}`;
    }

    const rows = await this.connection.runQuery(query, params);
    return rows || [];
  }

  /**
   * Remove project files that no longer exist
   */
  async cleanupDeletedFiles(
    existingPaths: string[],
    branchName?: string
  ): Promise<number> {
    const branchId = await this.connection.getBranchId(branchName);

    if (existingPaths.length === 0) {
      return 0;
    }

    const placeholders = existingPaths.map(() => "?").join(",");
    const result = await this.connection.runQuery(
      `DELETE FROM project_files WHERE branch_id = ? AND file_path NOT IN (${placeholders})`,
      [branchId, ...existingPaths]
    );

    const deletedCount = result?.changes || 0;
    logger.info(` Cleaned up ${deletedCount} deleted files from database`);

    return deletedCount;
  }

  /**
   * Find similar interfaces using vector similarity
   * Note: This performs in-memory cosine similarity calculation
   */
  async findSimilarInterfaces(
    queryEmbedding: number[],
    limit: number = 5,
    minSimilarity: number = 0.7
  ): Promise<Array<{ interface: CodeInterfaceRecord; similarity: number }>> {
    try {
      // 1. Fetch all interfaces with embeddings
      // Optimization: In a real production system, we would use a vector database or
      // an SQLite extension like sqlite-vss. For this local implementation,
      // we fetch embeddings and calculate similarity in memory.
      const rows = await this.connection.runQuery(
        "SELECT * FROM code_interfaces WHERE embedding IS NOT NULL"
      );

      if (!rows || rows.length === 0) {
        return [];
      }

      const results: Array<{
        interface: CodeInterfaceRecord;
        similarity: number;
      }> = [];

      // 2. Calculate cosine similarity for each interface
      for (const row of rows) {
        if (!row.embedding) continue;

        // Convert buffer to number array
        const embedding = new Float32Array(row.embedding);

        // Calculate similarity
        const similarity = this.calculateCosineSimilarity(
          queryEmbedding,
          embedding
        );

        if (similarity >= minSimilarity) {
          results.push({
            interface: row as CodeInterfaceRecord,
            similarity,
          });
        }
      }

      // 3. Sort by similarity descending and take top N
      return results
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
    } catch (error) {
      logger.error("Failed to find similar interfaces:", error);
      return [];
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private calculateCosineSimilarity(
    vecA: number[] | Float32Array,
    vecB: number[] | Float32Array
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
}
