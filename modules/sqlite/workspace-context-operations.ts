import { ProjectInfo } from "../project-analysis/project-indexer.js";
import { logger } from "../logger.js";
import { WorkspaceContextRecord } from "./project-analysis-records.js";
import { SQLiteConnection } from "./sqlite-connection.js";

export class WorkspaceContextOperations {
  constructor(private connection: SQLiteConnection) {}

  async storeWorkspaceContext(
    projectInfo: ProjectInfo,
    branchName?: string,
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
        config_files: JSON.stringify([]),
        entry_points: JSON.stringify(projectInfo.entryPoints),
        frameworks: JSON.stringify(projectInfo.frameworks),
        languages: JSON.stringify(projectInfo.languages),
        workspace_dependencies: JSON.stringify(projectInfo.workspaces || []),
        total_files: 0,
        total_size_bytes: 0,
        last_indexed: now,
        indexing_status: "completed",
        branch_id: branchId,
      };

      const existing = await this.connection.getQuery(
        "SELECT id FROM workspace_context WHERE workspace_path = ? AND branch_id = ?",
        [record.workspace_path, record.branch_id],
      );

      if (existing) {
        await this.connection.execute(
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
          ],
        );
        record.id = existing.id;
        record.updated_at = now;
      } else {
        const result = await this.connection.execute(
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
          ],
        );
        record.id = result.lastID;
        record.created_at = now;
        record.updated_at = now;
      }

      return record;
    } catch (error) {
      logger.error("Failed to store workspace context:", error);
      return null;
    }
  }
}
