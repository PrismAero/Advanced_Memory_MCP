import { logger } from "../logger.js";
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
        `DELETE FROM project_files WHERE id IN (${placeholders})`,
        fileIds,
      );
    });

    return fileIds.length;
  }
}
