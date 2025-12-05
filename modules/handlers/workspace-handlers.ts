import { promises as fs } from "fs";
import path from "path";
import { Entity } from "../../memory-types.js";
import { logger } from "../logger.js";

/**
 * Workspace Integration Handlers
 * Connects memory system with Cursor/IDE workspace for enhanced context awareness
 */
export class WorkspaceHandlers {
  private memoryManager: any;

  constructor(memoryManager: any) {
    this.memoryManager = memoryManager;
  }

  /**
   * Sync memory entities with workspace structure
   */
  async handleSyncWithWorkspace(args: any): Promise<any> {
    const workspacePath =
      args.workspace_path || process.env.MEMORY_PATH || process.cwd();
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
    const createStructureEntities = args.create_structure_entities !== false; // Default true
    const linkExistingEntities = args.link_existing_entities !== false; // Default true

    logger.info(`Syncing memory with workspace: ${workspacePath}`);

    try {
      // Analyze workspace structure
      const workspaceAnalysis = await this.analyzeWorkspaceStructure(
        workspacePath,
        filePatterns
      );

      const syncResults = {
        workspace_path: workspacePath,
        structure_entities_created: 0,
        existing_entities_linked: 0,
        total_files_analyzed: workspaceAnalysis.totalFiles,
        folders_analyzed: workspaceAnalysis.folders.length,
      };

      // Create structure entities if requested
      if (createStructureEntities) {
        const structureEntities = await this.createWorkspaceStructureEntities(
          workspaceAnalysis,
          branchName
        );
        syncResults.structure_entities_created = structureEntities.length;
      }

      // Link existing entities to files if requested
      if (linkExistingEntities) {
        const linkedCount = await this.linkEntitiesToFiles(
          workspaceAnalysis,
          branchName
        );
        syncResults.existing_entities_linked = linkedCount;
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                workspace_sync: syncResults,
                workspace_structure: {
                  root_path: workspacePath,
                  major_folders: workspaceAnalysis.folders.slice(0, 10),
                  important_files: workspaceAnalysis.importantFiles,
                  file_types: workspaceAnalysis.fileTypes,
                },
                ai_insights: {
                  project_complexity:
                    this.assessProjectComplexity(workspaceAnalysis),
                  suggested_memory_organization:
                    this.suggestMemoryOrganization(workspaceAnalysis),
                  integration_readiness:
                    syncResults.structure_entities_created > 0 ||
                    syncResults.existing_entities_linked > 0,
                },
                summary: `Synced workspace: ${syncResults.structure_entities_created} entities created, ${syncResults.existing_entities_linked} entities linked`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      logger.error("Error syncing with workspace:", error);
      throw error;
    }
  }

  /**
   * Bridge workspace context with memory entities
   */
  async handleWorkspaceContextBridge(args: any): Promise<any> {
    if (!args.current_files || args.current_files.length === 0) {
      throw new Error("current_files is required and must not be empty");
    }

    const currentFiles = args.current_files;
    const branchName = args.branch_name || "main";
    const contextRadius = args.context_radius || 2;

    logger.info(`Bridging context for files: ${currentFiles.join(", ")}`);

    try {
      const contextBridge: any = {
        current_files: currentFiles,
        related_entities: [],
        file_connections: [],
        context_suggestions: [],
      };

      // Analyze each current file
      for (const filePath of currentFiles) {
        const fileAnalysis = await this.analyzeFileContext(
          filePath,
          branchName,
          contextRadius
        );

        contextBridge.related_entities.push(...fileAnalysis.relatedEntities);
        contextBridge.file_connections.push({
          file: filePath,
          connections: fileAnalysis.connections,
          relevance_score: fileAnalysis.relevanceScore,
        });
        contextBridge.context_suggestions.push(...fileAnalysis.suggestions);
      }

      // Remove duplicates and sort by relevance
      contextBridge.related_entities = this.deduplicateAndSort(
        contextBridge.related_entities
      );
      contextBridge.context_suggestions = this.deduplicateAndSort(
        contextBridge.context_suggestions
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                workspace_context_bridge: contextBridge,
                ai_recommendations: {
                  immediate_context: contextBridge.related_entities.slice(0, 5),
                  high_relevance_entities:
                    contextBridge.related_entities.filter(
                      (e: any) => e.relevance_score > 0.8
                    ),
                  context_completeness:
                    this.calculateContextCompleteness(contextBridge),
                  missing_context_areas: this.identifyMissingContext(
                    currentFiles,
                    contextBridge
                  ),
                },
                summary: `Context bridge established: ${contextBridge.related_entities.length} related entities found for ${currentFiles.length} files`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      logger.error("Error bridging workspace context:", error);
      throw error;
    }
  }

  /**
   * Detect project patterns and suggest memory organization
   */
  async handleDetectProjectPatterns(args: any): Promise<any> {
    const workspacePath =
      args.workspace_path || process.env.MEMORY_PATH || process.cwd();
    const analysisDepth = args.analysis_depth || 2;
    const suggestBranches = args.suggest_branches !== false; // Default true
    const createSuggestedBranches = args.create_suggested_branches === true; // Default false

    logger.info(`Detecting project patterns in: ${workspacePath}`);

    try {
      // Analyze project structure patterns
      const patternAnalysis = await this.detectPatterns(
        workspacePath,
        analysisDepth
      );

      let branchSuggestions: any[] = [];
      let createdBranches: any[] = [];

      if (suggestBranches) {
        branchSuggestions = this.generateBranchSuggestions(patternAnalysis);

        // Create branches if requested
        if (createSuggestedBranches) {
          createdBranches = await this.createSuggestedBranches(
            branchSuggestions
          );
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                project_patterns: {
                  workspace_path: workspacePath,
                  analysis_depth: analysisDepth,
                  detected_patterns: patternAnalysis.patterns,
                  project_type: patternAnalysis.projectType,
                  architecture_style: patternAnalysis.architectureStyle,
                  complexity_metrics: patternAnalysis.complexityMetrics,
                },
                memory_organization: {
                  branch_suggestions: branchSuggestions,
                  created_branches: createdBranches,
                  organization_rationale: patternAnalysis.organizationRationale,
                },
                ai_insights: {
                  optimal_branch_count: branchSuggestions.length,
                  project_maturity: this.assessProjectMaturity(patternAnalysis),
                  memory_strategy:
                    this.recommendMemoryStrategy(patternAnalysis),
                  integration_opportunities:
                    this.identifyIntegrationOpportunities(patternAnalysis),
                },
                summary: `Detected ${patternAnalysis.patterns.length} project patterns, suggested ${branchSuggestions.length} memory branches`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      logger.error("Error detecting project patterns:", error);
      throw error;
    }
  }

  // Helper methods for workspace analysis
  private async analyzeWorkspaceStructure(
    workspacePath: string,
    filePatterns: string[]
  ): Promise<any> {
    const analysis: any = {
      totalFiles: 0,
      folders: [],
      importantFiles: [],
      fileTypes: {},
    };

    try {
      // Recursively analyze directory structure
      await this.walkDirectory(workspacePath, workspacePath, analysis, 0, 3);

      // Identify important files
      analysis.importantFiles = await this.identifyImportantFiles(
        workspacePath
      );

      return analysis;
    } catch (error) {
      logger.warn(`Error analyzing workspace structure:`, error);
      return analysis;
    }
  }

  private async walkDirectory(
    currentPath: string,
    rootPath: string,
    analysis: any,
    depth: number,
    maxDepth: number
  ): Promise<void> {
    if (depth > maxDepth) return;

    try {
      const items = await fs.readdir(currentPath, { withFileTypes: true });

      for (const item of items) {
        // Skip hidden files and node_modules
        if (item.name.startsWith(".") || item.name === "node_modules") continue;

        const itemPath = path.join(currentPath, item.name);
        const relativePath = path.relative(rootPath, itemPath);

        if (item.isDirectory()) {
          analysis.folders.push({
            name: item.name,
            path: relativePath,
            depth: depth,
          });
          await this.walkDirectory(
            itemPath,
            rootPath,
            analysis,
            depth + 1,
            maxDepth
          );
        } else if (item.isFile()) {
          analysis.totalFiles++;

          const extension = path.extname(item.name);
          analysis.fileTypes[extension] =
            (analysis.fileTypes[extension] || 0) + 1;
        }
      }
    } catch (error) {
      logger.debug(`Error reading directory ${currentPath}:`, error);
    }
  }

  private async identifyImportantFiles(
    workspacePath: string
  ): Promise<string[]> {
    const importantFiles = [];
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

    for (const filename of importantNames) {
      const filePath = path.join(workspacePath, filename);
      try {
        await fs.access(filePath);
        importantFiles.push(filename);
      } catch (error) {
        // File doesn't exist, continue
      }
    }

    return importantFiles;
  }

  private async createWorkspaceStructureEntities(
    workspaceAnalysis: any,
    branchName: string
  ): Promise<Entity[]> {
    const entities: Entity[] = [];

    try {
      // Create folder structure entities for major folders
      const majorFolders = workspaceAnalysis.folders.filter(
        (f: any) => f.depth <= 1
      );

      for (const folder of majorFolders.slice(0, 10)) {
        // Limit to prevent spam
        const folderEntity: Entity = {
          name: `Folder: ${folder.name}`,
          entityType: "reference",
          observations: [
            `Workspace folder: ${folder.path}`,
            `Depth: ${folder.depth}`,
            `Part of project structure`,
          ],
          status: "active",
          relevanceScore: 0.6,
        };

        entities.push(folderEntity);
      }

      // Create important files entities
      for (const file of workspaceAnalysis.importantFiles) {
        const fileEntity: Entity = {
          name: `Config: ${file}`,
          entityType: "reference",
          observations: [
            `Important configuration file: ${file}`,
            `Located at workspace root`,
            `Critical for project setup`,
          ],
          status: "active",
          relevanceScore: 0.8,
        };

        entities.push(fileEntity);
      }

      // Create entities in batch
      if (entities.length > 0) {
        return await this.memoryManager.createEntities(entities, branchName);
      }
    } catch (error) {
      logger.warn("Error creating workspace structure entities:", error);
    }

    return entities;
  }

  private async linkEntitiesToFiles(
    workspaceAnalysis: any,
    branchName: string
  ): Promise<number> {
    let linkedCount = 0;

    try {
      // Get existing entities to link
      const existingEntities = await this.memoryManager.exportBranch(
        branchName
      );

      // Try to link entities to workspace elements
      for (const entity of existingEntities.entities) {
        const entityName = entity.name.toLowerCase();

        // Check if entity name matches any folder or file
        const matchingFolder = workspaceAnalysis.folders.find(
          (f: any) =>
            entityName.includes(f.name.toLowerCase()) ||
            f.name.toLowerCase().includes(entityName)
        );

        const matchingFile = workspaceAnalysis.importantFiles.find(
          (f: string) =>
            entityName.includes(f.toLowerCase()) ||
            f.toLowerCase().includes(entityName)
        );

        if (matchingFolder || matchingFile) {
          // Add workspace connection observation
          const connectionNote = matchingFolder
            ? `Linked to workspace folder: ${matchingFolder.path}`
            : `Linked to workspace file: ${matchingFile}`;

          await this.memoryManager.addObservations(
            [
              {
                entityName: entity.name,
                contents: [connectionNote],
              },
            ],
            branchName
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
    contextRadius: number
  ): Promise<any> {
    const fileAnalysis: any = {
      relatedEntities: [],
      connections: [],
      suggestions: [],
      relevanceScore: 0.5,
    };

    try {
      // Extract keywords from file path for context search
      const pathSegments = filePath.split(/[/\\]/).filter(Boolean);
      const fileName = path.basename(filePath, path.extname(filePath));
      const searchKeywords = [...pathSegments, fileName];

      // Search for entities related to file path components
      for (const keyword of searchKeywords) {
        if (keyword.length > 2) {
          // Skip very short segments
          const searchResults = await this.memoryManager.searchEntities(
            keyword,
            branchName,
            ["active"],
            { includeConfidenceScores: true }
          );

          for (const entity of searchResults.entities) {
            fileAnalysis.relatedEntities.push({
              entity_name: entity.name,
              entity_type: entity.entityType,
              relevance_score: entity.relevanceScore || 0.5,
              connection_reason: `Matches file path component: ${keyword}`,
            });
          }
        }
      }

      // Generate context suggestions
      fileAnalysis.suggestions.push({
        suggestion: `Consider creating entities for components in ${fileName}`,
        confidence: 0.6,
        type: "entity_creation",
      });

      // Calculate overall relevance
      if (fileAnalysis.relatedEntities.length > 0) {
        fileAnalysis.relevanceScore = Math.min(
          0.9,
          0.5 + fileAnalysis.relatedEntities.length * 0.1
        );
      }
    } catch (error) {
      logger.warn(`Error analyzing file context for ${filePath}:`, error);
    }

    return fileAnalysis;
  }

  private async detectPatterns(
    workspacePath: string,
    analysisDepth: number
  ): Promise<any> {
    const patterns = [];
    let projectType = "unknown";
    let architectureStyle = "unknown";

    try {
      // Detect project type from files
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

      // Detect architecture patterns from folder structure
      const structureAnalysis = await this.analyzeWorkspaceStructure(
        workspacePath,
        []
      );

      const hasComponents = structureAnalysis.folders.some((f: any) =>
        f.name.toLowerCase().includes("component")
      );
      const hasServices = structureAnalysis.folders.some((f: any) =>
        f.name.toLowerCase().includes("service")
      );
      const hasMVC = structureAnalysis.folders.some((f: any) =>
        ["model", "view", "controller"].includes(f.name.toLowerCase())
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
          depth: Math.max(
            ...structureAnalysis.folders.map((f: any) => f.depth)
          ),
        },
        organizationRationale: `Detected ${projectType} project with ${architectureStyle} architecture`,
      };
    } catch (error) {
      logger.warn("Error detecting patterns:", error);
      return {
        patterns: [],
        projectType,
        architectureStyle,
        complexityMetrics: {},
        organizationRationale: "",
      };
    }
  }

  // Helper utility methods
  private deduplicateAndSort(items: any[]): any[] {
    const seen = new Set();
    return items
      .filter((item) => {
        const key = item.entity_name || item.suggestion || JSON.stringify(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort(
        (a, b) =>
          (b.relevance_score || b.confidence || 0) -
          (a.relevance_score || a.confidence || 0)
      );
  }

  private calculateContextCompleteness(contextBridge: any): number {
    const fileCount = contextBridge.current_files.length;
    const entityCount = contextBridge.related_entities.length;
    const connectionCount = contextBridge.file_connections.length;

    // Simple heuristic for completeness
    return Math.min(1.0, (entityCount + connectionCount) / (fileCount * 3));
  }

  private identifyMissingContext(
    currentFiles: string[],
    contextBridge: any
  ): string[] {
    const missing = [];

    if (contextBridge.related_entities.length === 0) {
      missing.push(
        "No related entities found - consider creating entities for current work"
      );
    }

    if (contextBridge.context_suggestions.length === 0) {
      missing.push(
        "No context suggestions available - workspace may need better integration"
      );
    }

    return missing;
  }

  private assessProjectComplexity(workspaceAnalysis: any): string {
    const fileCount = workspaceAnalysis.totalFiles;
    const folderCount = workspaceAnalysis.folders.length;

    if (fileCount > 1000 || folderCount > 50) return "high";
    if (fileCount > 100 || folderCount > 20) return "medium";
    return "low";
  }

  private suggestMemoryOrganization(workspaceAnalysis: any): any {
    return {
      recommended_branches: Math.min(
        5,
        Math.max(2, Math.floor(workspaceAnalysis.folders.length / 10))
      ),
      organization_strategy:
        workspaceAnalysis.folders.length > 20 ? "feature-based" : "simple",
      priority_areas: workspaceAnalysis.folders
        .slice(0, 5)
        .map((f: any) => f.name),
    };
  }

  private generateBranchSuggestions(patternAnalysis: any): any[] {
    const suggestions = [
      {
        name: "main",
        purpose: "Core project logic and architecture",
        priority: "essential",
      },
    ];

    // Add suggestions based on detected patterns
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

  private async createSuggestedBranches(
    branchSuggestions: any[]
  ): Promise<any[]> {
    const createdBranches = [];

    for (const suggestion of branchSuggestions) {
      if (suggestion.name === "main") continue; // Main branch already exists

      try {
        await this.memoryManager.createBranch(
          suggestion.name,
          suggestion.purpose
        );
        createdBranches.push(suggestion);
      } catch (error) {
        logger.warn(
          `Failed to create suggested branch ${suggestion.name}:`,
          error
        );
      }
    }

    return createdBranches;
  }

  private assessProjectMaturity(patternAnalysis: any): string {
    const patternCount = patternAnalysis.patterns.length;
    const complexity = patternAnalysis.complexityMetrics.file_count || 0;

    if (patternCount > 3 && complexity > 500) return "mature";
    if (patternCount > 1 && complexity > 50) return "developing";
    return "early";
  }

  private recommendMemoryStrategy(patternAnalysis: any): string {
    if (patternAnalysis.architectureStyle === "component-based") {
      return "component-focused";
    } else if (patternAnalysis.architectureStyle === "service-oriented") {
      return "service-focused";
    } else {
      return "feature-focused";
    }
  }

  private identifyIntegrationOpportunities(patternAnalysis: any): string[] {
    const opportunities = [];

    if (patternAnalysis.projectType === "node.js") {
      opportunities.push("Package.json dependency tracking");
    }

    if (patternAnalysis.patterns.some((p: any) => p.type === "architecture")) {
      opportunities.push("Architectural decision recording");
    }

    return opportunities;
  }
}
