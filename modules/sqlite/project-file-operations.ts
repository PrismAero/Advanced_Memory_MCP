import { FileAnalysis } from "../project-analysis/project-indexer.js";
import { VectorStore } from "../vector-store.js";
import { SQLiteConnection } from "./sqlite-connection.js";
import { ProjectFileRecord } from "./project-analysis-records.js";
import { logger } from "../logger.js";

export class ProjectFileOperations {
  constructor(
    private connection: SQLiteConnection,
    private vectorStore: VectorStore,
  ) {}

  async storeProjectFiles(
    files: FileAnalysis[],
    branchName?: string,
  ): Promise<ProjectFileRecord[]> {
    const branchId = await this.connection.getBranchId(branchName);
    const storedFiles: ProjectFileRecord[] = [];

    logger.info(`[FOLDER] Storing ${files.length} project files`);

    for (const file of files) {
      try {
        const record = await this.storeOrUpdateProjectFile(file, branchId);
        if (record) storedFiles.push(record);
      } catch (error) {
        logger.warn(`Failed to store project file ${file.filePath}:`, error);
      }
    }

    logger.info(
      `[SUCCESS] Stored ${storedFiles.length} project files successfully`,
    );
    return storedFiles;
  }

  async storeOrUpdateProjectFile(
    file: FileAnalysis,
    branchId: number,
  ): Promise<ProjectFileRecord | null> {
    try {
      const existing = await this.connection.getQuery(
        "SELECT id FROM project_files WHERE file_path = ? AND branch_id = ?",
        [file.filePath, branchId],
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
          is_generated: file.analysisMetadata.isGenerated ?? false,
          skipped_reason: file.analysisMetadata.skippedReason,
        }),
      };

      if (existing) {
        await this.connection.execute(
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
          ],
        );

        record.id = existing.id;
        record.updated_at = now;
      } else {
        const result = await this.connection.execute(
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
          ],
        );
        record.id = result.lastID;
      }

      if (file.embedding && record.id) {
        await this.vectorStore.add({
          id: `file_${record.id}`,
          vector: file.embedding,
          metadata: {
            type: "file",
            filePath: file.filePath,
            language: file.fileType.language,
            dbId: record.id,
          },
        });
      }

      return record;
    } catch (error) {
      logger.error(`Failed to store project file ${file.filePath}:`, error);
      return null;
    }
  }

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

    const limit = clampLimit(criteria.limit, 100, 1000);
    const rows = await this.connection.runQuery(
      `SELECT * FROM project_files ${whereClause} ORDER BY last_modified DESC LIMIT ?`,
      [...params, limit],
    );
    return rows || [];
  }

  async generateMissingFileEmbeddings(
    embeddingGenerator: (fileContext: string) => Promise<number[] | null>,
    limit = 50,
  ): Promise<number[]> {
    try {
      const files = await this.connection.runQuery(
        `SELECT pf.id, pf.file_path, pf.relative_path, pf.file_type, pf.language, pf.category
         FROM project_files pf
         LEFT JOIN vectors v ON v.id = 'file_' || pf.id
         WHERE v.id IS NULL
         LIMIT ?`,
        [clampLimit(limit, 50, 500)],
      );
      if (!files || files.length === 0) return [];

      logger.info(`[VECTOR] Generating embeddings for ${files.length} files...`);
      const updatedIds: number[] = [];

      for (const file of files) {
        try {
          const fileContext = `File: ${file.relative_path}\nType: ${file.category}\nLanguage: ${file.language}`;
          const embedding = await embeddingGenerator(fileContext);
          if (!embedding) continue;

          await this.vectorStore.add({
            id: `file_${file.id}`,
            vector: embedding,
            metadata: {
              type: "file",
              filePath: file.file_path,
              language: file.language,
              dbId: file.id,
            },
          });
          updatedIds.push(file.id);
        } catch (error) {
          logger.warn(
            `Failed to generate embedding for file ${file.file_path}:`,
            error,
          );
        }
      }

      if (updatedIds.length > 0) {
        logger.info(`[SUCCESS] Generated embeddings for ${updatedIds.length} files`);
      }
      return updatedIds;
    } catch (error) {
      logger.error("Failed to generate missing file embeddings:", error);
      return [];
    }
  }
}

function clampLimit(value: number | undefined, fallback: number, max: number): number {
  if (!Number.isFinite(value) || !value || value < 1) return fallback;
  return Math.min(Math.floor(value), max);
}
