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
    await this.vectorStore.initialize();
    await this.backfillMissingEmbeddings();
  }

  dispose(): void {
    this.vectorStore.dispose();
  }

  async backfillMissingEmbeddings(): Promise<{
    filesWithoutEmbeddings: number;
    interfacesWithoutEmbeddings: number;
  }> {
    try {
      logger.info("[VECTOR] Checking for data without embeddings...");

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

      if (filesWithoutEmbeddings > 0 || interfacesWithoutEmbeddings > 0) {
        logger.info(
          `[VECTOR] Found ${filesWithoutEmbeddings} files and ${interfacesWithoutEmbeddings} interfaces without embeddings`,
        );
      } else {
        logger.info("[VECTOR] All existing data has embeddings");
      }

      return { filesWithoutEmbeddings, interfacesWithoutEmbeddings };
    } catch (error) {
      logger.warn("Failed to check for missing embeddings:", error);
      return { filesWithoutEmbeddings: 0, interfacesWithoutEmbeddings: 0 };
    }
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
}
