import * as chokidar from "chokidar";
import { EventEmitter } from "events";
import { promises as fs } from "fs";
import path from "node:path";
import { logger } from "../logger.js";
import { buildWatcherIgnoreGlobs } from "./exclusion-patterns.js";
import { IgnorePolicy } from "./ignore-policy.js";
import { ProjectIndexer, ProjectInfo } from "./project-indexer.js";

/**
 * File system change event types
 */
export type FileChangeType = "add" | "change" | "unlink" | "addDir" | "unlinkDir";

/**
 * File change event data
 */
export interface FileChangeEvent {
  type: FileChangeType;
  path: string;
  relativePath: string;
  timestamp: Date;
  stats?: any;
  previousPath?: string; // For renames/moves
}

/**
 * Folder tree node representing directory structure
 */
export interface FolderTreeNode {
  name: string;
  path: string;
  relativePath: string;
  type: "file" | "directory";
  size?: number;
  lastModified?: Date;
  children?: Map<string, FolderTreeNode>;
  parent?: FolderTreeNode | null;
  metadata?: {
    isHidden: boolean;
    isSymlink: boolean;
    fileCount: number;
    directoryCount: number;
    totalSize: number;
  };
}

/**
 * File location mapping for quick lookups
 */
export interface FileLocationMap {
  files: Map<string, FolderTreeNode>; // filename -> node
  directories: Map<string, FolderTreeNode>; // dirname -> node
  paths: Map<string, FolderTreeNode>; // full path -> node
  relativePaths: Map<string, FolderTreeNode>; // relative path -> node
}

/**
 * Change detection configuration
 */
export interface WatcherConfig {
  ignored?: string[];
  interval: number; // milliseconds between incremental updates
  debounceDelay: number; // debounce file change events
  maxDepth?: number;
  followSymlinks: boolean;
  enableStats: boolean;
  useGitignore: boolean; // Whether to respect .gitignore files
  additionalIgnorePatterns?: string[]; // Extra patterns to ignore beyond .gitignore
  skipInitialAnalysis?: boolean; // Avoid startup-wide scans when DB already has state
  skipInitialFolderTree?: boolean; // Avoid building an in-memory tree for huge repos
}

/**
 * File Watcher Service
 * Provides real-time file system monitoring with comprehensive folder tree tracking
 */
export class FileWatcher extends EventEmitter {
  private watcher: chokidar.FSWatcher | null = null;
  private projectIndexer: ProjectIndexer;
  private rootPath: string = "";
  private config: WatcherConfig;
  private folderTree: FolderTreeNode | null = null;
  private locationMap: FileLocationMap;
  private changeQueue: FileChangeEvent[] = [];
  private processingInterval: NodeJS.Timeout | null = null;
  private isWatching = false;
  private projectInfo: ProjectInfo | null = null;
  private ignorePolicy = new IgnorePolicy();

  // Change tracking
  private pendingChanges = new Map<string, FileChangeEvent>();
  private lastProcessTime = new Date();

  constructor(projectIndexer?: ProjectIndexer, config?: Partial<WatcherConfig>) {
    super();
    this.projectIndexer = projectIndexer || new ProjectIndexer();

    this.config = {
      ignored: buildWatcherIgnoreGlobs(),
      interval: 3000, // 3 seconds
      debounceDelay: 500, // 500ms
      followSymlinks: false,
      enableStats: true,
      useGitignore: true,
      additionalIgnorePatterns: [],
      skipInitialAnalysis: false,
      skipInitialFolderTree: false,
      ...config,
    };

    this.locationMap = {
      files: new Map(),
      directories: new Map(),
      paths: new Map(),
      relativePaths: new Map(),
    };
  }

  /**
   * Start watching a project directory
   */
  async startWatching(rootPath: string): Promise<void> {
    if (this.isWatching) {
      await this.stopWatching();
    }

    this.rootPath = path.resolve(rootPath);
    logger.info(`[SEARCH] Starting file watcher for: ${this.rootPath}`);

    try {
      // Load .gitignore patterns if enabled
      if (this.config.useGitignore) {
        await this.loadGitignorePatterns();
      }

      if (!this.config.skipInitialAnalysis) {
        await this.performInitialAnalysis();
      } else {
        logger.debug("[DATA] Skipping file watcher initial project analysis");
      }

      if (!this.config.skipInitialFolderTree) {
        await this.buildInitialFolderTree();
      } else {
        logger.debug("[FOLDER] Skipping file watcher initial folder tree build");
      }

      // Start file system watcher
      this.watcher = chokidar.watch(this.rootPath, {
        ignored: this.config.ignored,
        persistent: true,
        ignoreInitial: true, // We've already done initial scan
        followSymlinks: this.config.followSymlinks,
        depth: this.config.maxDepth,
        awaitWriteFinish: {
          stabilityThreshold: this.config.debounceDelay,
          pollInterval: 100,
        },
      });

      // Set up event listeners
      this.setupWatcherEvents();

      // Start periodic processing
      this.startPeriodicProcessing();

      this.isWatching = true;
      logger.info("[SUCCESS] File watcher started successfully");
      this.emit("ready", this.folderTree);
    } catch (error) {
      logger.error("Failed to start file watcher:", error);
      throw error;
    }
  }

  /**
   * Stop watching
   */
  async stopWatching(): Promise<void> {
    if (!this.isWatching) return;

    logger.info("[STOP] Stopping file watcher");

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    this.isWatching = false;
    this.changeQueue = [];
    this.pendingChanges.clear();

    logger.info("[SUCCESS] File watcher stopped");
  }

  /**
   * Get current folder tree structure
   */
  getFolderTree(): FolderTreeNode | null {
    return this.folderTree;
  }

  /**
   * Get file location mappings
   */
  getLocationMap(): FileLocationMap {
    return this.locationMap;
  }

  /**
   * Find files by name pattern
   */
  findFiles(pattern: string | RegExp): FolderTreeNode[] {
    const results: FolderTreeNode[] = [];
    const regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;

    for (const [, node] of this.locationMap.files) {
      if (regex.test(node.name)) {
        results.push(node);
      }
    }

    return results;
  }

  /**
   * Find directories by name pattern
   */
  findDirectories(pattern: string | RegExp): FolderTreeNode[] {
    const results: FolderTreeNode[] = [];
    const regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;

    for (const [, node] of this.locationMap.directories) {
      if (regex.test(node.name)) {
        results.push(node);
      }
    }

    return results;
  }

  /**
   * Get node by path
   */
  getNodeByPath(searchPath: string): FolderTreeNode | null {
    // Try absolute path first
    let node = this.locationMap.paths.get(path.resolve(searchPath));
    if (node) return node;

    // Try relative path
    const relativePath = path.relative(this.rootPath, searchPath);
    node = this.locationMap.relativePaths.get(relativePath);
    if (node) return node;

    return null;
  }

  /**
   * Get directory contents
   */
  getDirectoryContents(dirPath: string): FolderTreeNode[] {
    const node = this.getNodeByPath(dirPath);
    if (!node || node.type !== "directory" || !node.children) {
      return [];
    }

    return Array.from(node.children.values());
  }

  /**
   * Get file path hierarchy
   */
  getPathHierarchy(filePath: string): FolderTreeNode[] {
    const hierarchy: FolderTreeNode[] = [];
    let node = this.getNodeByPath(filePath);

    while (node) {
      hierarchy.unshift(node);
      node = node.parent || null;
    }

    return hierarchy;
  }

  /**
   * Get project statistics
   */
  getProjectStatistics(): {
    totalFiles: number;
    totalDirectories: number;
    totalSize: number;
    fileTypes: Map<string, number>;
    largestFiles: Array<{ path: string; size: number }>;
    deepestPath: string;
    lastUpdate: Date;
  } {
    let totalFiles = 0;
    let totalDirectories = 0;
    let totalSize = 0;
    const fileTypes = new Map<string, number>();
    const largestFiles: Array<{ path: string; size: number }> = [];
    let deepestPath = "";
    let maxDepth = 0;

    for (const [filePath, node] of this.locationMap.paths) {
      if (node.type === "file") {
        totalFiles++;
        if (node.size) {
          totalSize += node.size;
          largestFiles.push({ path: filePath, size: node.size });
        }

        const ext = path.extname(node.name);
        fileTypes.set(ext, (fileTypes.get(ext) || 0) + 1);
      } else {
        totalDirectories++;
      }

      const depth = node.relativePath.split(path.sep).length;
      if (depth > maxDepth) {
        maxDepth = depth;
        deepestPath = filePath;
      }
    }

    // Sort largest files
    largestFiles.sort((a, b) => b.size - a.size);

    return {
      totalFiles,
      totalDirectories,
      totalSize,
      fileTypes,
      largestFiles: largestFiles.slice(0, 10), // Top 10
      deepestPath,
      lastUpdate: this.lastProcessTime,
    };
  }

  /**
   * Perform initial project analysis
   */
  private async performInitialAnalysis(): Promise<void> {
    logger.info("[DATA] Performing initial project analysis");

    try {
      this.projectInfo = await this.projectIndexer.analyzeProject(this.rootPath);
      logger.info(
        `Project type: ${
          this.projectInfo.projectType
        }, Languages: ${this.projectInfo.languages.join(", ")}`,
      );
    } catch (error) {
      logger.error("Failed to analyze project:", error);
      // Continue without project info
    }
  }

  /**
   * Build initial folder tree structure
   */
  private async buildInitialFolderTree(): Promise<void> {
    logger.info(" Building initial folder tree");

    this.folderTree = await this.createFolderNode(this.rootPath, null);
    await this.scanDirectoryRecursive(this.folderTree);

    logger.info(
      `Folder tree built: ${this.locationMap.files.size} files, ${this.locationMap.directories.size} directories`,
    );
  }

  /**
   * Create a folder tree node
   */
  private async createFolderNode(
    fullPath: string,
    parent: FolderTreeNode | null,
  ): Promise<FolderTreeNode> {
    const stats = await fs.stat(fullPath);
    const name = parent ? path.basename(fullPath) : path.basename(this.rootPath) || "root";
    const relativePath = parent ? path.relative(this.rootPath, fullPath) : "";

    const node: FolderTreeNode = {
      name,
      path: fullPath,
      relativePath,
      type: stats.isDirectory() ? "directory" : "file",
      size: stats.isFile() ? stats.size : undefined,
      lastModified: stats.mtime,
      children: stats.isDirectory() ? new Map() : undefined,
      parent,
      metadata: {
        isHidden: name.startsWith("."),
        isSymlink: stats.isSymbolicLink(),
        fileCount: 0,
        directoryCount: 0,
        totalSize: stats.isFile() ? stats.size : 0,
      },
    };

    // Update location mappings
    if (node.type === "file") {
      this.locationMap.files.set(name, node);
    } else {
      this.locationMap.directories.set(name, node);
    }
    this.locationMap.paths.set(fullPath, node);
    if (relativePath) {
      this.locationMap.relativePaths.set(relativePath, node);
    }

    return node;
  }

  /**
   * Recursively scan directory structure
   */
  private async scanDirectoryRecursive(node: FolderTreeNode): Promise<void> {
    if (node.type !== "directory" || !node.children) return;

    try {
      const entries = await fs.readdir(node.path, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(node.path, entry.name);
        const relativePath = path.relative(this.rootPath, fullPath);

        // Check if should be ignored
        if (this.shouldIgnore(relativePath)) {
          continue;
        }

        try {
          const childNode = await this.createFolderNode(fullPath, node);
          node.children.set(entry.name, childNode);

          // Update parent metadata
          if (childNode.type === "file") {
            node.metadata!.fileCount++;
            if (childNode.size) {
              node.metadata!.totalSize += childNode.size;
            }
          } else {
            node.metadata!.directoryCount++;
            await this.scanDirectoryRecursive(childNode);
            // Aggregate child metadata
            if (childNode.metadata) {
              node.metadata!.fileCount += childNode.metadata.fileCount;
              node.metadata!.directoryCount += childNode.metadata.directoryCount;
              node.metadata!.totalSize += childNode.metadata.totalSize;
            }
          }
        } catch (error) {
          logger.warn(`Failed to process ${fullPath}:`, error);
        }
      }
    } catch (error) {
      logger.warn(`Failed to scan directory ${node.path}:`, error);
    }
  }

  /**
   * Set up file system watcher events
   */
  private setupWatcherEvents(): void {
    if (!this.watcher) return;

    this.watcher.on("add", (filePath) => {
      this.queueChange({
        type: "add",
        path: filePath,
        relativePath: path.relative(this.rootPath, filePath),
        timestamp: new Date(),
      });
    });

    this.watcher.on("change", (filePath, stats) => {
      this.queueChange({
        type: "change",
        path: filePath,
        relativePath: path.relative(this.rootPath, filePath),
        timestamp: new Date(),
        stats,
      });
    });

    this.watcher.on("unlink", (filePath) => {
      this.queueChange({
        type: "unlink",
        path: filePath,
        relativePath: path.relative(this.rootPath, filePath),
        timestamp: new Date(),
      });
    });

    this.watcher.on("addDir", (dirPath) => {
      this.queueChange({
        type: "addDir",
        path: dirPath,
        relativePath: path.relative(this.rootPath, dirPath),
        timestamp: new Date(),
      });
    });

    this.watcher.on("unlinkDir", (dirPath) => {
      this.queueChange({
        type: "unlinkDir",
        path: dirPath,
        relativePath: path.relative(this.rootPath, dirPath),
        timestamp: new Date(),
      });
    });

    this.watcher.on("error", (error) => {
      logger.error("File watcher error:", error);
      this.emit("error", error);
    });
  }

  /**
   * Queue a file change event
   */
  private queueChange(event: FileChangeEvent): void {
    // Debounce by overwriting previous change for same path
    this.pendingChanges.set(event.path, event);
  }

  /**
   * Start periodic processing of changes
   */
  private startPeriodicProcessing(): void {
    this.processingInterval = setInterval(async () => {
      await this.processQueuedChanges();
    }, this.config.interval);
  }

  /**
   * Process all queued file changes
   */
  private async processQueuedChanges(): Promise<void> {
    if (this.pendingChanges.size === 0) return;

    logger.debug(`[NOTE] Processing ${this.pendingChanges.size} file changes`);

    const changes = Array.from(this.pendingChanges.values());
    this.pendingChanges.clear();

    const significantChanges: FileChangeEvent[] = [];

    for (const change of changes) {
      try {
        await this.processFileChange(change);

        // Check if change is significant (affects imports, exports, interfaces)
        if (await this.isSignificantChange(change)) {
          significantChanges.push(change);
        }
      } catch (error) {
        logger.warn(`Failed to process change for ${change.path}:`, error);
      }
    }

    this.lastProcessTime = new Date();

    if (significantChanges.length > 0) {
      this.emit("significantChanges", significantChanges);
      logger.info(`[LOADING] Processed ${significantChanges.length} significant changes`);
    }

    this.emit("changesProcessed", changes);
  }

  /**
   * Process individual file change
   */
  private async processFileChange(change: FileChangeEvent): Promise<void> {
    const { type, path: changePath } = change;

    switch (type) {
      case "add":
        await this.handleFileAdd(changePath);
        break;
      case "change":
        await this.handleFileChange(changePath);
        break;
      case "unlink":
        await this.handleFileUnlink(changePath);
        break;
      case "addDir":
        await this.handleDirectoryAdd(changePath);
        break;
      case "unlinkDir":
        await this.handleDirectoryUnlink(changePath);
        break;
    }
  }

  /**
   * Handle file addition
   */
  private async handleFileAdd(filePath: string): Promise<void> {
    try {
      const parentDir = path.dirname(filePath);
      const parentNode = this.getNodeByPath(parentDir);

      if (parentNode && parentNode.type === "directory" && parentNode.children) {
        const newNode = await this.createFolderNode(filePath, parentNode);
        parentNode.children.set(path.basename(filePath), newNode);

        // Update parent metadata
        parentNode.metadata!.fileCount++;
        if (newNode.size) {
          parentNode.metadata!.totalSize += newNode.size;
        }
      }
    } catch (error) {
      logger.warn(`Failed to handle file add for ${filePath}:`, error);
    }
  }

  /**
   * Handle file change
   */
  private async handleFileChange(filePath: string): Promise<void> {
    const node = this.getNodeByPath(filePath);
    if (node && node.type === "file") {
      try {
        const stats = await fs.stat(filePath);
        const oldSize = node.size || 0;

        node.size = stats.size;
        node.lastModified = stats.mtime;

        // Update parent metadata
        if (node.parent && node.parent.metadata) {
          node.parent.metadata.totalSize = node.parent.metadata.totalSize - oldSize + stats.size;
        }
      } catch (error) {
        logger.warn(`Failed to update stats for ${filePath}:`, error);
      }
    }
  }

  /**
   * Handle file deletion
   */
  private async handleFileUnlink(filePath: string): Promise<void> {
    const node = this.getNodeByPath(filePath);
    if (node) {
      // Remove from parent
      if (node.parent && node.parent.children) {
        node.parent.children.delete(node.name);

        // Update parent metadata
        if (node.parent.metadata) {
          node.parent.metadata.fileCount--;
          if (node.size) {
            node.parent.metadata.totalSize -= node.size;
          }
        }
      }

      // Remove from location maps
      this.removeNodeFromMaps(node);
    }
  }

  /**
   * Handle directory addition
   */
  private async handleDirectoryAdd(dirPath: string): Promise<void> {
    try {
      const parentDir = path.dirname(dirPath);
      const parentNode = this.getNodeByPath(parentDir);

      if (parentNode && parentNode.type === "directory" && parentNode.children) {
        const newNode = await this.createFolderNode(dirPath, parentNode);
        parentNode.children.set(path.basename(dirPath), newNode);

        // Update parent metadata
        parentNode.metadata!.directoryCount++;
      }
    } catch (error) {
      logger.warn(`Failed to handle directory add for ${dirPath}:`, error);
    }
  }

  /**
   * Handle directory deletion
   */
  private async handleDirectoryUnlink(dirPath: string): Promise<void> {
    const node = this.getNodeByPath(dirPath);
    if (node) {
      // Remove from parent
      if (node.parent && node.parent.children) {
        node.parent.children.delete(node.name);

        // Update parent metadata
        if (node.parent.metadata && node.metadata) {
          node.parent.metadata.directoryCount--;
          node.parent.metadata.fileCount -= node.metadata.fileCount;
          node.parent.metadata.totalSize -= node.metadata.totalSize;
        }
      }

      // Recursively remove from location maps
      this.removeNodeAndChildrenFromMaps(node);
    }
  }

  /**
   * Check if a change is significant for code analysis
   */
  private async isSignificantChange(change: FileChangeEvent): Promise<boolean> {
    const { type, path: changePath } = change;

    // File deletions are always significant
    if (type === "unlink" || type === "unlinkDir") {
      return true;
    }

    // Check file extension for source files
    const ext = path.extname(changePath);
    const significantExtensions = [".js", ".ts", ".tsx", ".jsx", ".py", ".rs", ".go", ".java"];

    if (!significantExtensions.includes(ext)) {
      return false;
    }

    // For file changes, check if imports/exports might have changed
    if (type === "change") {
      try {
        const content = await fs.readFile(changePath, "utf-8");
        const hasImportsOrExports =
          content.includes("import ") ||
          content.includes("export ") ||
          content.includes("from ") ||
          content.includes("require(") ||
          content.includes("interface ") ||
          content.includes("type ") ||
          content.includes("class ") ||
          content.includes("function ");

        return hasImportsOrExports;
      } catch (error) {
        // If we can't read the file, assume it's significant
        return true;
      }
    }

    return true;
  }

  /**
   * Remove node from all location maps
   */
  private removeNodeFromMaps(node: FolderTreeNode): void {
    if (node.type === "file") {
      this.locationMap.files.delete(node.name);
    } else {
      this.locationMap.directories.delete(node.name);
    }

    this.locationMap.paths.delete(node.path);
    if (node.relativePath) {
      this.locationMap.relativePaths.delete(node.relativePath);
    }
  }

  /**
   * Recursively remove node and all children from location maps
   */
  private removeNodeAndChildrenFromMaps(node: FolderTreeNode): void {
    // Remove current node
    this.removeNodeFromMaps(node);

    // Recursively remove children
    if (node.children) {
      for (const child of node.children.values()) {
        this.removeNodeAndChildrenFromMaps(child);
      }
    }
  }

  /**
   * Load .gitignore patterns from the project root
   */
  private async loadGitignorePatterns(): Promise<void> {
    await this.ignorePolicy.load(this.rootPath, {
      additionalPatterns: this.config.additionalIgnorePatterns,
      createMemoryIgnore: true,
    });
  }

  /**
   * Check if path should be ignored
   */
  private shouldIgnore(relativePath: string): boolean {
    if (this.config.useGitignore && this.ignorePolicy.ignores(relativePath)) {
      return true;
    }

    // Fallback to basic pattern matching
    return this.config.ignored!.some((pattern) => {
      // Simple glob pattern matching - can be enhanced
      if (pattern.includes("**")) {
        const regex = pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*");
        return new RegExp(regex).test(relativePath);
      }
      return relativePath.includes(pattern.replace(/\*/g, ""));
    });
  }
}
