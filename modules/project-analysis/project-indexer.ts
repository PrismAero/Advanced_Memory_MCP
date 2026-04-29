import { logger } from "../logger.js";
import { FileAnalyzer } from "./file-analyzer.js";
import { IgnorePolicy } from "./ignore-policy.js";
import { ProjectDetector } from "./project-detector.js";
import { ProjectFileScanner } from "./project-file-scanner.js";
import type { FileAnalysis, ProjectInfo } from "./project-types.js";

export type {
  ExportInfo,
  FileAnalysis,
  FileTypeInfo,
  ImportInfo,
  InterfaceInfo,
  PackageManager,
  ProjectInfo,
  ProjectType,
  WorkspaceInfo,
} from "./project-types.js";

/**
 * Project analysis orchestrator.
 *
 * Detection, file analysis, source parsing, and scanning live in focused
 * modules so changes in one operation do not keep expanding this facade.
 */
export class ProjectIndexer {
  private ignorePolicy = new IgnorePolicy();
  private fileAnalyzer = new FileAnalyzer();
  private projectDetector = new ProjectDetector(this.ignorePolicy);
  private fileScanner = new ProjectFileScanner(this.ignorePolicy, (filePath, rootPath) =>
    this.analyzeFile(filePath, rootPath),
  );

  async analyzeProject(rootPath: string): Promise<ProjectInfo> {
    logger.info(`[SEARCH] Analyzing project structure at: ${rootPath}`);
    await this.ignorePolicy.load(rootPath);

    const projectType = await this.projectDetector.detectProjectType(rootPath);
    const packageManager = await this.projectDetector.detectPackageManager(rootPath);
    const workspaces = await this.projectDetector.detectWorkspaces(rootPath, packageManager);
    const files = await this.scanProjectFiles(rootPath);
    const languages = this.fileAnalyzer.extractLanguages(files);
    const frameworks = await this.projectDetector.detectFrameworks(rootPath, files);
    const entryPoints = this.projectDetector.identifyEntryPoints(files, projectType);

    logger.info(`[SUCCESS] Project analysis complete: ${projectType} with ${languages.join(", ")}`);

    return {
      rootPath,
      projectType,
      packageManager,
      frameworks,
      languages,
      workspaces,
      entryPoints,
    };
  }

  async scanProjectFiles(
    rootPath: string,
    additionalIgnorePatterns: string[] = [],
  ): Promise<FileAnalysis[]> {
    await this.ignorePolicy.load(rootPath, {
      additionalPatterns: additionalIgnorePatterns,
      persistAdditionalPatterns: additionalIgnorePatterns.length > 0,
    });
    return this.fileScanner.scan(rootPath);
  }

  analyzeFile(filePath: string, rootPath: string): Promise<FileAnalysis | null> {
    return this.fileAnalyzer.analyzeFile(filePath, rootPath);
  }
}
