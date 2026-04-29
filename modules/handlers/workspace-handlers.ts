import { promises as fs } from "fs";
import path from "path";
import { Entity } from "../../memory-types.js";
import { BackgroundProcessor } from "../background-processor.js";
import { logger } from "../logger.js";
import { resolveOwnedPath } from "../path-boundary.js";
import {
  ensureMemoryIgnoreFile,
  IgnorePolicy,
  readMemoryIgnorePatterns,
} from "../project-analysis/ignore-policy.js";
import { jsonResponse, sanitizeEntities } from "./response-utils.js";

/**
 * Workspace Integration Handlers.
 *
 * The previous version exposed four overlapping tools (sync_with_workspace,
 * workspace_context_bridge, detect_project_patterns, analyze_project_structure)
 * plus two stubs (find_interface_usage, navigate_codebase) that always
 * returned placeholder text. The stubs are gone. The four real handlers
 * remain accessible via a single `analyze_workspace` tool with a
 * `mode` parameter: "sync" | "bridge" | "patterns" | "structure".
 */
export class WorkspaceHandlers {
  private memoryManager: any;
  private backgroundProcessor: BackgroundProcessor | null = null;

  constructor(memoryManager: any, backgroundProcessor?: BackgroundProcessor) {
    this.memoryManager = memoryManager;
    this.backgroundProcessor = backgroundProcessor || null;
  }

  /** Unified `analyze_workspace` dispatcher. */
  async handleAnalyzeWorkspace(args: any): Promise<any> {
    const mode = args.mode || "sync";
    switch (mode) {
      case "sync":
        return this.handleSyncWithWorkspace(args);
      case "bridge":
        return this.handleWorkspaceContextBridge(args);
      case "patterns":
        return this.handleDetectProjectPatterns(args);
      case "structure":
        return this.handleAnalyzeProjectStructure(args);
      default:
        throw new Error(
          `Unknown workspace mode "${mode}". Expected one of: sync, bridge, patterns, structure.`,
        );
    }
  }

  async handleSyncWithWorkspace(args: any): Promise<any> {
    const workspacePath = await this.prepareWorkspacePath(
      args.workspace_path || process.env.MEMORY_PATH || process.cwd(),
      args.memory_ignore_patterns,
    );
    const filePatterns = args.file_patterns || [
      "*.ts",
      "*.tsx",
      "*.js",
      "*.jsx",
      "*.md",
      "*.json",
      "*.py",
    ];
    const branchName = args.branch_name || "main";
    const createStructure = args.create_structure_entities !== false;
    const linkExisting = args.link_existing_entities !== false;

    const workspaceAnalysis = await this.analyzeWorkspaceStructure(
      workspacePath,
      filePatterns,
      args.memory_ignore_patterns || [],
    );

    let createdCount = 0;
    let linkedCount = 0;
    if (createStructure) {
      const entities = await this.createWorkspaceStructureEntities(workspaceAnalysis, branchName);
      createdCount = entities.length;
    }
    if (linkExisting) {
      linkedCount = await this.linkEntitiesToFiles(workspaceAnalysis, branchName);
    }

    return jsonResponse({
      mode: "sync",
      workspace_path: workspacePath,
      branch: branchName,
      structure_entities_created: createdCount,
      existing_entities_linked: linkedCount,
      total_files: workspaceAnalysis.totalFiles,
      folders: workspaceAnalysis.folders.slice(0, 10).map((f: any) => f.path),
      important_files: workspaceAnalysis.importantFiles,
      file_types: workspaceAnalysis.fileTypes,
      memory_ignore_patterns: await readMemoryIgnorePatterns(workspacePath),
    });
  }

  async handleWorkspaceContextBridge(args: any): Promise<any> {
    if (!args.current_files?.length) {
      throw new Error("current_files is required and must not be empty");
    }
    const branchName = args.branch_name || "main";
    const contextRadius = args.context_radius || 2;
    const currentFiles = args.current_files.map((filePath: string) =>
      resolveOwnedPath(filePath, "current_files[]"),
    );

    const relatedEntities: any[] = [];
    const fileConnections: any[] = [];

    for (const filePath of currentFiles) {
      const fileAnalysis = await this.analyzeFileContext(filePath, branchName, contextRadius);
      relatedEntities.push(...fileAnalysis.relatedEntities);
      fileConnections.push({
        file: filePath,
        relevance_score: fileAnalysis.relevanceScore,
        match_count: fileAnalysis.relatedEntities.length,
      });
    }

    return jsonResponse({
      mode: "bridge",
      branch: branchName,
      current_files: currentFiles,
      related_entities: this.dedupeAndSort(relatedEntities).slice(0, 20),
      file_connections: fileConnections,
    });
  }

  async handleAnalyzeProjectStructure(args: any): Promise<any> {
    const projectPath = await this.prepareWorkspacePath(
      args.project_path || args.workspace_path || process.env.MEMORY_PATH || process.cwd(),
      args.memory_ignore_patterns,
    );
    const branchName = args.branch_name || "main";

    if (this.backgroundProcessor) {
      this.backgroundProcessor.setMonitoredProject(projectPath);
    }

    try {
      const workspaceAnalysis = await this.analyzeWorkspaceStructure(
        projectPath,
        ["*.ts", "*.tsx", "*.js", "*.jsx", "*.py", "*.java", "*.cs", "*.go", "*.rs"],
        args.memory_ignore_patterns || [],
      );
      const structureEntities = await this.createWorkspaceStructureEntities(
        workspaceAnalysis,
        branchName,
      );
      return jsonResponse({
        mode: "structure",
        project_path: projectPath,
        background_monitoring: this.backgroundProcessor ? "active" : "inactive",
        structure_entities_created: structureEntities.length,
        total_files: workspaceAnalysis.totalFiles,
        folder_count: workspaceAnalysis.folders.length,
        file_types: workspaceAnalysis.fileTypes,
        memory_ignore_patterns: await readMemoryIgnorePatterns(projectPath),
      });
    } catch (error) {
      return jsonResponse({
        mode: "structure",
        project_path: projectPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async handleDetectProjectPatterns(args: any): Promise<any> {
    const workspacePath = await this.prepareWorkspacePath(
      args.workspace_path || process.env.MEMORY_PATH || process.cwd(),
      args.memory_ignore_patterns,
    );
    const analysisDepth = args.analysis_depth || 2;
    const suggestBranches = args.suggest_branches !== false;
    const createSuggestedBranches = args.create_suggested_branches === true;

    const patternAnalysis = await this.detectPatterns(workspacePath, analysisDepth);

    let branchSuggestions: any[] = [];
    let createdBranches: any[] = [];
    if (suggestBranches) {
      branchSuggestions = this.generateBranchSuggestions(patternAnalysis);
      if (createSuggestedBranches) {
        createdBranches = await this.createSuggestedBranches(branchSuggestions);
      }
    }

    return jsonResponse({
      mode: "patterns",
      workspace_path: workspacePath,
      analysis_depth: analysisDepth,
      project_type: patternAnalysis.projectType,
      architecture_style: patternAnalysis.architectureStyle,
      patterns: patternAnalysis.patterns,
      complexity_metrics: patternAnalysis.complexityMetrics,
      branch_suggestions: branchSuggestions,
      created_branches: createdBranches,
      memory_ignore_patterns: await readMemoryIgnorePatterns(workspacePath),
    });
  }

  // ---------- internal helpers (mostly unchanged) ----------

  private async prepareWorkspacePath(
    requestedPath: string,
    memoryIgnorePatterns?: string[],
  ): Promise<string> {
    const workspacePath = resolveOwnedPath(requestedPath, "workspace_path");
    await ensureMemoryIgnoreFile(workspacePath, {
      patterns: Array.isArray(memoryIgnorePatterns) ? memoryIgnorePatterns : [],
      appendPatterns: Array.isArray(memoryIgnorePatterns) && memoryIgnorePatterns.length > 0,
      createIfMissing: true,
    });
    return workspacePath;
  }

  private async analyzeWorkspaceStructure(
    workspacePath: string,
    filePatterns: string[],
    additionalIgnorePatterns: string[] = [],
  ): Promise<any> {
    const analysis: any = {
      totalFiles: 0,
      folders: [],
      importantFiles: [],
      fileTypes: {},
    };
    try {
      const ignorePolicy = new IgnorePolicy();
      await ignorePolicy.load(workspacePath, {
        additionalPatterns: additionalIgnorePatterns,
        persistAdditionalPatterns: additionalIgnorePatterns.length > 0,
      });
      await this.walkDirectory(workspacePath, workspacePath, analysis, 0, 3, ignorePolicy);
      analysis.importantFiles = await this.identifyImportantFiles(workspacePath);
      return analysis;
    } catch (error) {
      logger.warn("Error analyzing workspace structure:", error);
      return analysis;
    }
  }

  private async walkDirectory(
    currentPath: string,
    rootPath: string,
    analysis: any,
    depth: number,
    maxDepth: number,
    ignorePolicy: IgnorePolicy,
  ): Promise<void> {
    if (depth > maxDepth) return;
    try {
      const items = await fs.readdir(currentPath, { withFileTypes: true });
      for (const item of items) {
        if (item.name.startsWith(".") || item.name === "node_modules") continue;
        const itemPath = path.join(currentPath, item.name);
        const relativePath = path.relative(rootPath, itemPath);
        if (ignorePolicy.ignores(relativePath)) continue;
        if (item.isDirectory()) {
          analysis.folders.push({
            name: item.name,
            path: relativePath,
            depth,
          });
          await this.walkDirectory(itemPath, rootPath, analysis, depth + 1, maxDepth, ignorePolicy);
        } else if (item.isFile()) {
          analysis.totalFiles++;
          const extension = path.extname(item.name);
          analysis.fileTypes[extension] = (analysis.fileTypes[extension] || 0) + 1;
        }
      }
    } catch (error) {
      logger.debug(`Error reading directory ${currentPath}:`, error);
    }
  }

  private async identifyImportantFiles(workspacePath: string): Promise<string[]> {
    const importantNames = [
      "package.json",
      "tsconfig.json",
      "README.md",
      "Dockerfile",
      ".gitignore",
      "yarn.lock",
      "package-lock.json",
      "pyproject.toml",
      "requirements.txt",
      "Cargo.toml",
      "go.mod",
    ];
    const importantFiles: string[] = [];
    for (const filename of importantNames) {
      try {
        await fs.access(path.join(workspacePath, filename));
        importantFiles.push(filename);
      } catch {
        // missing
      }
    }
    return importantFiles;
  }

  private async createWorkspaceStructureEntities(
    workspaceAnalysis: any,
    branchName: string,
  ): Promise<Entity[]> {
    const entities: Entity[] = [];
    try {
      const majorFolders = workspaceAnalysis.folders.filter((f: any) => f.depth <= 1);
      for (const folder of majorFolders.slice(0, 10)) {
        entities.push({
          name: `Folder: ${folder.name}`,
          entityType: "reference",
          observations: [`Workspace folder: ${folder.path}`, `Depth: ${folder.depth}`],
          status: "active",
          relevanceScore: 0.6,
        });
      }
      for (const file of workspaceAnalysis.importantFiles) {
        entities.push({
          name: `Config: ${file}`,
          entityType: "reference",
          observations: [`Important configuration file: ${file}`],
          status: "active",
          relevanceScore: 0.8,
        });
      }
      if (entities.length > 0) {
        return await this.memoryManager.createEntities(entities, branchName);
      }
    } catch (error) {
      logger.warn("Error creating workspace structure entities:", error);
    }
    return entities;
  }

  private async linkEntitiesToFiles(workspaceAnalysis: any, branchName: string): Promise<number> {
    let linkedCount = 0;
    try {
      const existing = await this.memoryManager.exportBranch(branchName);
      for (const entity of existing.entities) {
        const entityName = entity.name.toLowerCase();
        const matchingFolder = workspaceAnalysis.folders.find(
          (f: any) =>
            entityName.includes(f.name.toLowerCase()) || f.name.toLowerCase().includes(entityName),
        );
        const matchingFile = workspaceAnalysis.importantFiles.find(
          (f: string) =>
            entityName.includes(f.toLowerCase()) || f.toLowerCase().includes(entityName),
        );
        if (matchingFolder || matchingFile) {
          const note = matchingFolder
            ? `Linked to workspace folder: ${matchingFolder.path}`
            : `Linked to workspace file: ${matchingFile}`;
          await this.memoryManager.addObservations(
            [{ entityName: entity.name, contents: [note] }],
            branchName,
          );
          linkedCount++;
        }
      }
    } catch (error) {
      logger.warn("Error linking entities to files:", error);
    }
    return linkedCount;
  }

  private async analyzeFileContext(
    filePath: string,
    branchName: string,
    contextRadius: number,
  ): Promise<any> {
    const fileAnalysis: any = {
      relatedEntities: [],
      relevanceScore: 0.5,
    };
    try {
      const segments = filePath.split(/[/\\]/).filter(Boolean);
      const fileName = path.basename(filePath, path.extname(filePath));
      const keywords = [...segments, fileName].filter((k) => k.length > 2);

      for (const keyword of keywords.slice(0, contextRadius * 2)) {
        const results = await this.memoryManager.searchEntities(keyword, branchName, ["active"], {
          includeConfidenceScores: true,
        });
        for (const entity of results.entities) {
          fileAnalysis.relatedEntities.push({
            entity_name: entity.name,
            entity_type: entity.entityType,
            relevance_score: entity.relevanceScore || 0.5,
            matched_keyword: keyword,
          });
        }
      }
      if (fileAnalysis.relatedEntities.length > 0) {
        fileAnalysis.relevanceScore = Math.min(
          0.9,
          0.5 + fileAnalysis.relatedEntities.length * 0.1,
        );
      }
    } catch (error) {
      logger.warn(`Error analyzing file context for ${filePath}:`, error);
    }
    return fileAnalysis;
  }

  private async detectPatterns(workspacePath: string, analysisDepth: number): Promise<any> {
    const patterns: any[] = [];
    let projectType = "unknown";
    let architectureStyle = "unknown";

    try {
      const importantFiles = await this.identifyImportantFiles(workspacePath);
      if (importantFiles.includes("package.json")) {
        projectType = "node.js";
        patterns.push({
          type: "package_manager",
          name: "npm/yarn",
          confidence: 0.9,
        });
      }
      if (
        importantFiles.includes("pyproject.toml") ||
        importantFiles.includes("requirements.txt")
      ) {
        projectType = "python";
        patterns.push({
          type: "package_manager",
          name: "pip/poetry",
          confidence: 0.9,
        });
      }

      const structureAnalysis = await this.analyzeWorkspaceStructure(workspacePath, []);
      const hasComponents = structureAnalysis.folders.some((f: any) =>
        f.name.toLowerCase().includes("component"),
      );
      const hasServices = structureAnalysis.folders.some((f: any) =>
        f.name.toLowerCase().includes("service"),
      );
      const hasMVC = structureAnalysis.folders.some((f: any) =>
        ["model", "view", "controller"].includes(f.name.toLowerCase()),
      );

      if (hasComponents) {
        architectureStyle = "component-based";
        patterns.push({
          type: "architecture",
          name: "component-based",
          confidence: 0.8,
        });
      } else if (hasServices) {
        architectureStyle = "service-oriented";
        patterns.push({
          type: "architecture",
          name: "service-oriented",
          confidence: 0.8,
        });
      } else if (hasMVC) {
        architectureStyle = "mvc";
        patterns.push({ type: "architecture", name: "mvc", confidence: 0.8 });
      }

      return {
        patterns,
        projectType,
        architectureStyle,
        complexityMetrics: {
          folder_count: structureAnalysis.folders.length,
          file_count: structureAnalysis.totalFiles,
          depth: structureAnalysis.folders.length
            ? Math.max(...structureAnalysis.folders.map((f: any) => f.depth))
            : 0,
        },
      };
    } catch (error) {
      logger.warn("Error detecting patterns:", error);
      return {
        patterns: [],
        projectType,
        architectureStyle,
        complexityMetrics: {},
      };
    }
  }

  private generateBranchSuggestions(patternAnalysis: any): any[] {
    const suggestions = [
      {
        name: "main",
        purpose: "Core project logic and architecture",
        priority: "essential",
      },
    ];
    if (patternAnalysis.architectureStyle === "component-based") {
      suggestions.push({
        name: "components",
        purpose: "UI components and widgets",
        priority: "high",
      });
    }
    if (patternAnalysis.architectureStyle === "service-oriented") {
      suggestions.push({
        name: "services",
        purpose: "Business logic and data services",
        priority: "high",
      });
    }
    if (patternAnalysis.projectType === "node.js") {
      suggestions.push({
        name: "build-config",
        purpose: "Build tools and configuration",
        priority: "medium",
      });
    }
    return suggestions;
  }

  private async createSuggestedBranches(branchSuggestions: any[]): Promise<any[]> {
    const created: any[] = [];
    for (const suggestion of branchSuggestions) {
      if (suggestion.name === "main") continue;
      try {
        await this.memoryManager.createBranch(suggestion.name, suggestion.purpose);
        created.push(suggestion);
      } catch (error) {
        logger.warn(`Failed to create suggested branch ${suggestion.name}:`, error);
      }
    }
    return created;
  }

  private dedupeAndSort(items: any[]): any[] {
    const seen = new Set<string>();
    return items
      .filter((item) => {
        const key = item.entity_name || JSON.stringify(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort(
        (a, b) =>
          (b.relevance_score || b.confidence || 0) - (a.relevance_score || a.confidence || 0),
      );
  }
}
