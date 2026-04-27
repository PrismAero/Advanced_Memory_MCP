import {
  ExportInfo,
  FileAnalysis,
  ImportInfo,
  InterfaceInfo,
  ProjectInfo,
} from "../project-analysis/project-indexer.js";
import { VectorStore } from "../vector-store.js";
import {
  CodeInterfaceOperations,
  type CodeInterfaceQueryCriteria,
  type CodeInterfaceSimilarityOptions,
} from "./code-interface-operations.js";
import { ProjectCleanupOperations } from "./project-cleanup-operations.js";
import { ProjectDependencyOperations } from "./project-dependency-operations.js";
import { ProjectFileOperations } from "./project-file-operations.js";
import {
  CodeInterfaceRecord,
  InterfaceRelationshipRecord,
  ProjectDependencyRecord,
  ProjectFileRecord,
  WorkspaceContextRecord,
} from "./project-analysis-records.js";
import { SQLiteConnection } from "./sqlite-connection.js";
import { WorkspaceContextOperations } from "./workspace-context-operations.js";
import { logger } from "../logger.js";

export type {
  CodeInterfaceRecord,
  InterfaceRelationshipRecord,
  ProjectDependencyRecord,
  ProjectFileRecord,
  WorkspaceContextRecord,
} from "./project-analysis-records.js";

/**
 * Compatibility facade for project-analysis persistence.
 *
 * Callers keep using this class, but table-specific work now lives in focused
 * operation modules so SQL ownership is easier to reason about and test.
 */
export class ProjectAnalysisOperations {
  private vectorStore: VectorStore;
  private fileOps: ProjectFileOperations;
  private interfaceOps: CodeInterfaceOperations;
  private dependencyOps: ProjectDependencyOperations;
  private workspaceOps: WorkspaceContextOperations;
  private cleanupOps: ProjectCleanupOperations;

  constructor(private connection: SQLiteConnection) {
    this.vectorStore = new VectorStore(connection);
    this.fileOps = new ProjectFileOperations(connection, this.vectorStore);
    this.interfaceOps = new CodeInterfaceOperations(
      connection,
      this.vectorStore,
    );
    this.dependencyOps = new ProjectDependencyOperations(connection);
    this.workspaceOps = new WorkspaceContextOperations(connection);
    this.cleanupOps = new ProjectCleanupOperations(
      connection,
      this.vectorStore,
    );
  }

  async initialize(): Promise<void> {
    await this.vectorStore.initialize({
      loadExisting: process.env.ADVANCED_MEMORY_LOAD_VECTOR_INDEX_ON_STARTUP === "1",
    });
    const missing = await this.getMissingEmbeddingCounts();
    if (missing.filesWithoutEmbeddings > 0 || missing.interfacesWithoutEmbeddings > 0) {
      logger.info(
        `[VECTOR] Embedding backlog detected: ${missing.filesWithoutEmbeddings} files, ${missing.interfacesWithoutEmbeddings} interfaces missing vectors`,
      );
    } else {
      logger.debug("[VECTOR] All existing project analysis data has embeddings");
    }
  }

  dispose(): void {
    this.vectorStore.dispose();
  }

  async getMissingEmbeddingCounts(): Promise<{
    filesWithoutEmbeddings: number;
    interfacesWithoutEmbeddings: number;
  }> {
    try {
      const fileCount = await this.connection.getQuery(`
        SELECT COUNT(*) as count
        FROM project_files pf
        LEFT JOIN vectors v ON v.id = 'file_' || pf.id
        WHERE v.id IS NULL
      `);
      const interfaceCount = await this.connection.getQuery(
        "SELECT COUNT(*) as count FROM code_interfaces WHERE embedding IS NULL",
      );

      const filesWithoutEmbeddings = fileCount?.count || 0;
      const interfacesWithoutEmbeddings = interfaceCount?.count || 0;

      return { filesWithoutEmbeddings, interfacesWithoutEmbeddings };
    } catch (error) {
      logger.warn("Failed to check for missing embeddings:", error);
      return { filesWithoutEmbeddings: 0, interfacesWithoutEmbeddings: 0 };
    }
  }

  backfillMissingEmbeddings(): Promise<{
    filesWithoutEmbeddings: number;
    interfacesWithoutEmbeddings: number;
  }> {
    return this.getMissingEmbeddingCounts();
  }

  storeProjectFiles(
    files: FileAnalysis[],
    branchName?: string,
  ): Promise<ProjectFileRecord[]> {
    return this.fileOps.storeProjectFiles(files, branchName);
  }

  storeOrUpdateProjectFile(
    file: FileAnalysis,
    branchId: number,
  ): Promise<ProjectFileRecord | null> {
    return this.fileOps.storeOrUpdateProjectFile(file, branchId);
  }

  getProjectFiles(criteria: {
    branchName?: string;
    fileType?: string;
    language?: string;
    category?: string;
    isEntryPoint?: boolean;
    limit?: number;
  }): Promise<ProjectFileRecord[]> {
    return this.fileOps.getProjectFiles(criteria);
  }

  async getProjectIndexStats(branchName?: string): Promise<{
    fileCount: number;
    lastAnalyzed: string | null;
  }> {
    const branchId = branchName
      ? await this.connection.getBranchId(branchName)
      : null;
    const row = await this.connection.getQuery(
      `SELECT COUNT(*) as file_count, MAX(last_analyzed) as last_analyzed
       FROM project_files
       WHERE (? IS NULL OR branch_id = ?)`,
      [branchId, branchId],
    );
    return {
      fileCount: row?.file_count || 0,
      lastAnalyzed: row?.last_analyzed || null,
    };
  }

  generateMissingFileEmbeddings(
    embeddingGenerator: (fileContext: string) => Promise<number[] | null>,
    limit = 50,
  ): Promise<number[]> {
    return this.fileOps.generateMissingFileEmbeddings(
      embeddingGenerator,
      limit,
    );
  }

  storeCodeInterfaces(
    fileId: number,
    interfaces: InterfaceInfo[],
    embedding?: number[],
  ): Promise<CodeInterfaceRecord[]> {
    return this.interfaceOps.storeCodeInterfaces(fileId, interfaces, embedding);
  }

  storeCodeInterface(
    fileId: number,
    iface: InterfaceInfo,
    embedding?: number[],
  ): Promise<CodeInterfaceRecord | null> {
    return this.interfaceOps.storeCodeInterface(fileId, iface, embedding);
  }

  getCodeInterfaces(
    criteria: CodeInterfaceQueryCriteria,
  ): Promise<CodeInterfaceRecord[]> {
    return this.interfaceOps.getCodeInterfaces(criteria);
  }

  updateInterfaceUsage(interfaceId: number): Promise<void> {
    return this.interfaceOps.updateInterfaceUsage(interfaceId);
  }

  refreshInterfaceRelationships(limit = 1000): Promise<number> {
    return this.interfaceOps.refreshInterfaceRelationships(limit);
  }

  findSimilarInterfaces(
    queryEmbedding: number[],
    limit = 5,
    minSimilarity = -1,
    options: CodeInterfaceSimilarityOptions = {},
  ): Promise<Array<{ interface: CodeInterfaceRecord; similarity: number }>> {
    return this.interfaceOps.findSimilarInterfaces(
      queryEmbedding,
      limit,
      minSimilarity,
      options,
    );
  }

  generateMissingInterfaceEmbeddings(
    embeddingGenerator: (interfaceContext: string) => Promise<number[] | null>,
    limit = 50,
  ): Promise<number[]> {
    return this.interfaceOps.generateMissingInterfaceEmbeddings(
      embeddingGenerator,
      limit,
    );
  }

  storeProjectDependencies(
    fromFileId: number,
    imports: ImportInfo[],
    exports: ExportInfo[],
  ): Promise<ProjectDependencyRecord[]> {
    return this.dependencyOps.storeProjectDependencies(
      fromFileId,
      imports,
      exports,
    );
  }

  storeProjectDependency(
    fromFileId: number,
    dependency: ImportInfo | ExportInfo,
    type: "import" | "export",
  ): Promise<ProjectDependencyRecord | null> {
    return this.dependencyOps.storeProjectDependency(
      fromFileId,
      dependency,
      type,
    );
  }

  getProjectDependencies(criteria: {
    fromFileId?: number;
    toFileId?: number;
    dependencyType?: string;
    externalPackage?: string;
    limit?: number;
  }): Promise<ProjectDependencyRecord[]> {
    return this.dependencyOps.getProjectDependencies(criteria);
  }

  storeWorkspaceContext(
    projectInfo: ProjectInfo,
    branchName?: string,
  ): Promise<WorkspaceContextRecord | null> {
    return this.workspaceOps.storeWorkspaceContext(projectInfo, branchName);
  }

  cleanupDeletedFiles(
    existingPaths: string[],
    branchName?: string,
  ): Promise<number> {
    return this.cleanupOps.cleanupDeletedFiles(existingPaths, branchName);
  }

  cleanupIgnoredOrDeletedFiles(
    retainedPaths: string[],
    branchName?: string,
  ): Promise<number> {
    return this.cleanupOps.cleanupIgnoredOrDeletedFiles(
      retainedPaths,
      branchName,
    );
  }

  cleanupIgnoredFiles(
    rootPath: string,
    branchName?: string,
  ): Promise<number> {
    return this.cleanupOps.cleanupIgnoredFiles(rootPath, branchName);
  }

  deleteProjectFilesByPath(
    filePaths: string[],
    branchName?: string,
  ): Promise<number> {
    return this.cleanupOps.deleteProjectFilesByPath(filePaths, branchName);
  }

  clearProjectFileDerivedData(fileIds: number[]): Promise<void> {
    return this.cleanupOps.clearProjectFileDerivedData(fileIds);
  }
}
