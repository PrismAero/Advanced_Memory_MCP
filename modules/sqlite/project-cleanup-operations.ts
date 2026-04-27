import { logger } from "../logger.js";
import { IgnorePolicy } from "../project-analysis/ignore-policy.js";
import { VectorStore } from "../vector-store.js";
import { SQLiteConnection } from "./sqlite-connection.js";

export class ProjectCleanupOperations {
  constructor(
    private connection: SQLiteConnection,
    private vectorStore: VectorStore,
  ) {}

  async cleanupDeletedFiles(
    existingPaths: string[],
    branchName?: string,
  ): Promise<number> {
    const branchId = await this.connection.getBranchId(branchName);
    return this.cleanupFilesNotInSet(existingPaths, branchId);
  }

  async cleanupIgnoredOrDeletedFiles(
    retainedPaths: string[],
    branchName?: string,
  ): Promise<number> {
    const branchId = await this.connection.getBranchId(branchName);
    return this.cleanupFilesNotInSet(retainedPaths, branchId);
  }

  async cleanupIgnoredFiles(
    rootPath: string,
    branchName?: string,
  ): Promise<number> {
    const branchId = await this.connection.getBranchId(branchName);
    const ignorePolicy = new IgnorePolicy();
    await ignorePolicy.load(rootPath);

    const rows = await this.connection.runQuery(
      "SELECT id, file_path, relative_path FROM project_files WHERE branch_id = ?",
      [branchId],
    );
    const ignoredIds = (rows || [])
      .filter((row: any) => {
        const relativePath = row.relative_path || relativeFromRoot(rootPath, row.file_path);
        return ignorePolicy.ignores(relativePath);
      })
      .map((row: any) => row.id);

    if (ignoredIds.length === 0) return 0;
    await this.deleteProjectFilesById(ignoredIds);
    logger.info(
      `Cleaned up ${ignoredIds.length} newly ignored files from database`,
    );
    return ignoredIds.length;
  }

  private async cleanupFilesNotInSet(
    retainedPaths: string[],
    branchId: number,
  ): Promise<number> {
    if (retainedPaths.length === 0) return 0;

    const placeholders = retainedPaths.map(() => "?").join(",");
    const staleFiles = await this.connection.runQuery(
      `SELECT id FROM project_files WHERE branch_id = ? AND file_path NOT IN (${placeholders})`,
      [branchId, ...retainedPaths],
    );

    if (!staleFiles || staleFiles.length === 0) return 0;

    const fileIds = staleFiles.map((row: any) => row.id);
    await this.deleteProjectFilesById(fileIds);

    logger.info(
      `Cleaned up ${fileIds.length} ignored/deleted files from database`,
    );
    return fileIds.length;
  }

  async deleteProjectFilesById(fileIds: number[]): Promise<number> {
    if (fileIds.length === 0) return 0;

    const placeholders = fileIds.map(() => "?").join(",");
    await this.connection.withTransaction(async () => {
      const interfaceRows = await this.connection.runQuery(
        `SELECT id FROM code_interfaces WHERE file_id IN (${placeholders})`,
        fileIds,
      );
      const interfaceIds = (interfaceRows || []).map((row: any) => row.id);

      await this.vectorStore.deleteMany(fileIds.map((id) => `file_${id}`));
      await this.vectorStore.deleteMany(
        interfaceIds.map((id: number) => `interface_${id}`),
      );

      await this.connection.execute(
        `DELETE FROM project_dependencies
         WHERE from_file_id IN (${placeholders}) OR to_file_id IN (${placeholders})`,
        [...fileIds, ...fileIds],
      );

      await this.connection.execute(
        `DELETE FROM project_files WHERE id IN (${placeholders})`,
        fileIds,
      );
    });

    return fileIds.length;
  }
}

function relativeFromRoot(rootPath: string, filePath: string): string {
  const normalizedRoot = rootPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const normalizedFile = String(filePath || "").replace(/\\/g, "/");
  if (normalizedFile.startsWith(`${normalizedRoot}/`)) {
    return normalizedFile.slice(normalizedRoot.length + 1);
  }
  return normalizedFile;
}
