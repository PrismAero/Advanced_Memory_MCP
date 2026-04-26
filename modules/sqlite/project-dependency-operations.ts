import { ExportInfo, ImportInfo } from "../project-analysis/project-indexer.js";
import { logger } from "../logger.js";
import { ProjectDependencyRecord } from "./project-analysis-records.js";
import { SQLiteConnection } from "./sqlite-connection.js";

export class ProjectDependencyOperations {
  constructor(private connection: SQLiteConnection) {}

  async storeProjectDependencies(
    fromFileId: number,
    imports: ImportInfo[],
    exports: ExportInfo[],
  ): Promise<ProjectDependencyRecord[]> {
    const storedDependencies: ProjectDependencyRecord[] = [];

    for (const imp of imports) {
      try {
        const record = await this.storeProjectDependency(fromFileId, imp, "import");
        if (record) storedDependencies.push(record);
      } catch (error) {
        logger.warn(`Failed to store import dependency ${imp.source}:`, error);
      }
    }

    for (const exp of exports) {
      try {
        const record = await this.storeProjectDependency(fromFileId, exp, "export");
        if (record) storedDependencies.push(record);
      } catch (error) {
        logger.warn(`Failed to store export dependency ${exp.name}:`, error);
      }
    }

    return storedDependencies;
  }

  async storeProjectDependency(
    fromFileId: number,
    dependency: ImportInfo | ExportInfo,
    type: "import" | "export",
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

        if (!imp.source.startsWith(".") && !imp.source.startsWith("/")) {
          externalPackage = imp.source.split("/")[0];
        }
      } else {
        const exp = dependency as ExportInfo;
        sourceIdentifier = exp.name;
        lineNumber = exp.line;
        isDefault = exp.type === "default";
      }

      let toFileId: number | undefined;
      if (type === "import" && !externalPackage) {
        const imp = dependency as ImportInfo;
        const targetFile = await this.connection.getQuery(
          "SELECT id FROM project_files WHERE relative_path LIKE ? ESCAPE '\\'",
          [`%${escapeLike(imp.source)}%`],
        );
        if (targetFile) toFileId = targetFile.id;
      }

      const record: ProjectDependencyRecord = {
        from_file_id: fromFileId,
        to_file_id: toFileId,
        dependency_type: type,
        source_identifier: sourceIdentifier,
        line_number: lineNumber,
        is_default_import: isDefault,
        is_namespace_import: isNamespace,
        is_type_only: false,
        external_package: externalPackage,
        resolution_status: toFileId
          ? "resolved"
          : externalPackage
            ? "resolved"
            : "unresolved",
      };

      await this.connection.execute(
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
        ],
      );

      return record;
    } catch (error) {
      logger.error("Failed to store project dependency:", error);
      return null;
    }
  }

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

    const rows = await this.connection.runQuery(
      `SELECT * FROM project_dependencies ${whereClause} ORDER BY created_at DESC LIMIT ?`,
      [...params, clampLimit(criteria.limit, 100, 1000)],
    );
    return rows || [];
  }
}

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function clampLimit(value: number | undefined, fallback: number, max: number): number {
  if (!Number.isFinite(value) || !value || value < 1) return fallback;
  return Math.min(Math.floor(value), max);
}
