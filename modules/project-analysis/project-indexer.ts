import { promises as fs } from "fs";
import path from "path";
import { logger } from "../logger.js";

/**
 * Project file types and their characteristics
 */
export interface FileTypeInfo {
  extension: string;
  language: string;
  category: "source" | "config" | "documentation" | "asset" | "test" | "build";
  hasImports: boolean;
  hasExports: boolean;
  canDefineInterfaces: boolean;
}

/**
 * Project structure information
 */
export interface ProjectInfo {
  rootPath: string;
  projectType: ProjectType;
  packageManager: PackageManager;
  frameworks: string[];
  languages: string[];
  workspaces?: WorkspaceInfo[];
  entryPoints: string[];
}

/**
 * File analysis result
 */
export interface FileAnalysis {
  filePath: string;
  relativePath: string;
  fileType: FileTypeInfo;
  size: number;
  lastModified: Date;
  imports: ImportInfo[];
  exports: ExportInfo[];
  interfaces: InterfaceInfo[];
  dependencies: string[];
  isEntryPoint: boolean;
  analysisMetadata: {
    lineCount: number;
    hasTests: boolean;
    complexity: "low" | "medium" | "high";
    documentation: number; // percentage of documented code
  };
  embedding?: number[];
}

export interface ImportInfo {
  source: string;
  specifiers: string[];
  isDefault: boolean;
  isNamespace: boolean;
  line: number;
}

export interface ExportInfo {
  name: string;
  type: "function" | "class" | "interface" | "type" | "const" | "default";
  line: number;
}

export interface InterfaceInfo {
  name: string;
  properties: string[];
  extends: string[];
  line: number;
  isExported: boolean;
  embedding?: number[];
}

export interface WorkspaceInfo {
  name: string;
  path: string;
  packageJson: any;
}

export type ProjectType =
  | "react"
  | "nextjs"
  | "nodejs"
  | "express"
  | "nestjs"
  | "vue"
  | "angular"
  | "svelte"
  | "python"
  | "django"
  | "flask"
  | "rust"
  | "go"
  | "java"
  | "spring"
  | "cpp"
  | "cpp-cmake"
  | "cpp-qt"
  | "cpp-qml"
  | "cpp-make"
  | "cpp-meson"
  | "cpp-bazel"
  | "c"
  | "csharp"
  | "dotnet"
  | "kotlin"
  | "monorepo"
  | "unknown";

export type PackageManager =
  | "npm"
  | "yarn"
  | "pnpm"
  | "bun"
  | "pip"
  | "cargo"
  | "go-mod"
  | "maven"
  | "gradle"
  | "cmake"
  | "make"
  | "qmake"
  | "meson"
  | "bazel"
  | "vcpkg"
  | "conan"
  | "nuget"
  | "dotnet"
  | "unknown";

/**
 * Core Project Indexer Service
 * Analyzes project structure, detects project types, and maps file relationships
 */
export class ProjectIndexer {
  private fileTypeMap: Map<string, FileTypeInfo>;
  private excludePatterns: RegExp[];

  constructor() {
    this.fileTypeMap = this.initializeFileTypeMap();
    this.excludePatterns = [
      /node_modules/,
      /\.git/,
      /dist/,
      /build/,
      /coverage/,
      /\.next/,
      /\.cache/,
      /\.vscode/,
      /\.idea/,
      /__pycache__/,
      /target/, // Rust build
      /bin/, // Go build
      /\.pytest_cache/,
      /\.DS_Store/,
      /\.env/,
      /\.log$/,
    ];
  }

  /**
   * Analyze project structure and return comprehensive project information
   */
  async analyzeProject(rootPath: string): Promise<ProjectInfo> {
    logger.info(`[SEARCH] Analyzing project structure at: ${rootPath}`);

    const projectType = await this.detectProjectType(rootPath);
    const packageManager = await this.detectPackageManager(rootPath);
    const workspaces = await this.detectWorkspaces(rootPath, packageManager);

    const files = await this.scanProjectFiles(rootPath);
    const languages = this.extractLanguages(files);
    const frameworks = await this.detectFrameworks(rootPath, files);
    const entryPoints = this.identifyEntryPoints(files, projectType);

    const projectInfo: ProjectInfo = {
      rootPath,
      projectType,
      packageManager,
      frameworks,
      languages,
      workspaces,
      entryPoints,
    };

    logger.info(
      `[SUCCESS] Project analysis complete: ${projectType} with ${languages.join(
        ", "
      )}`
    );
    return projectInfo;
  }

  /**
   * Scan and analyze all project files
   */
  async scanProjectFiles(rootPath: string): Promise<FileAnalysis[]> {
    const files: FileAnalysis[] = [];

    async function scanDirectory(
      dirPath: string,
      indexer: ProjectIndexer
    ): Promise<void> {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          const relativePath = path.relative(rootPath, fullPath);

          // Skip excluded patterns
          if (indexer.shouldExclude(relativePath)) {
            continue;
          }

          if (entry.isDirectory()) {
            await scanDirectory(fullPath, indexer);
          } else if (entry.isFile()) {
            const analysis = await indexer.analyzeFile(fullPath, rootPath);
            if (analysis) {
              files.push(analysis);
            }
          }
        }
      } catch (error) {
        logger.warn(`Failed to scan directory ${dirPath}:`, error);
      }
    }

    await scanDirectory(rootPath, this);
    return files;
  }

  /**
   * Analyze individual file
   */
  async analyzeFile(
    filePath: string,
    rootPath: string
  ): Promise<FileAnalysis | null> {
    try {
      const stats = await fs.stat(filePath);
      const relativePath = path.relative(rootPath, filePath);
      const ext = path.extname(filePath);

      const fileType =
        this.fileTypeMap.get(ext) || this.fileTypeMap.get(".unknown")!;

      // Skip non-source files for detailed analysis
      if (fileType.category === "asset" && stats.size > 1024 * 1024) {
        // Skip large assets
        return null;
      }

      let content = "";
      let imports: ImportInfo[] = [];
      let exports: ExportInfo[] = [];
      let interfaces: InterfaceInfo[] = [];
      let dependencies: string[] = [];
      let lineCount = 0;
      let hasTests = false;
      let complexity: "low" | "medium" | "high" = "low";
      let documentation = 0;

      // Analyze source files
      if (fileType.category === "source" || fileType.category === "test") {
        try {
          content = await fs.readFile(filePath, "utf-8");
          lineCount = content.split("\n").length;
          hasTests = this.detectTestFile(relativePath, content);

          if (fileType.hasImports) {
            imports = this.extractImports(content, fileType.language);
            dependencies = imports.map((imp) => imp.source);
          }

          if (fileType.hasExports) {
            exports = this.extractExports(content, fileType.language);
          }

          if (fileType.canDefineInterfaces) {
            interfaces = this.extractInterfaces(content, fileType.language);
          }

          complexity = this.calculateComplexity(content);
          documentation = this.calculateDocumentation(
            content,
            fileType.language
          );
        } catch (error) {
          logger.warn(`Failed to analyze file content ${filePath}:`, error);
        }
      }

      return {
        filePath,
        relativePath,
        fileType,
        size: stats.size,
        lastModified: stats.mtime,
        imports,
        exports,
        interfaces,
        dependencies,
        isEntryPoint: this.isEntryPoint(relativePath),
        analysisMetadata: {
          lineCount,
          hasTests,
          complexity,
          documentation,
        },
      };
    } catch (error) {
      logger.warn(`Failed to analyze file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Detect project type based on files and configuration
   */
  private async detectProjectType(rootPath: string): Promise<ProjectType> {
    try {
      // Check for C++/C build systems first (most specific to least specific)

      // Qt projects with QML
      if (
        (await this.fileExists(path.join(rootPath, "CMakeLists.txt"))) &&
        (await this.hasQtInCMake(path.join(rootPath, "CMakeLists.txt"))) &&
        (await this.hasQMLFiles(rootPath))
      ) {
        return "cpp-qml";
      }

      // Qt projects
      if (
        (await this.fileExists(path.join(rootPath, ".pro"))) ||
        (await this.fileExists(path.join(rootPath, ".pri"))) ||
        (await this.hasQtProject(rootPath))
      ) {
        return "cpp-qt";
      }

      // CMake C++ projects
      if (await this.fileExists(path.join(rootPath, "CMakeLists.txt"))) {
        if (await this.hasCppFiles(rootPath)) {
          return "cpp-cmake";
        }
        return "c";
      }

      // Makefile projects
      if (
        (await this.fileExists(path.join(rootPath, "Makefile"))) ||
        (await this.fileExists(path.join(rootPath, "makefile")))
      ) {
        if (await this.hasCppFiles(rootPath)) {
          return "cpp-make";
        }
        return "c";
      }

      // Meson projects
      if (await this.fileExists(path.join(rootPath, "meson.build"))) {
        if (await this.hasCppFiles(rootPath)) {
          return "cpp-meson";
        }
        return "c";
      }

      // Bazel projects
      if (
        (await this.fileExists(path.join(rootPath, "BUILD"))) ||
        (await this.fileExists(path.join(rootPath, "BUILD.bazel"))) ||
        (await this.fileExists(path.join(rootPath, "WORKSPACE")))
      ) {
        if (await this.hasCppFiles(rootPath)) {
          return "cpp-bazel";
        }
        return "c";
      }

      // Generic C++ project
      if (await this.hasCppFiles(rootPath)) {
        return "cpp";
      }

      // .NET/C# projects
      if (
        (await this.fileExists(path.join(rootPath, ".csproj"))) ||
        (await this.fileExists(path.join(rootPath, ".sln"))) ||
        (await this.hasCSharpProject(rootPath))
      ) {
        return "dotnet";
      }

      // Kotlin projects
      if (
        (await this.fileExists(path.join(rootPath, "build.gradle.kts"))) ||
        (await this.hasKotlinFiles(rootPath))
      ) {
        return "kotlin";
      }

      // Check for package.json and its contents
      const packageJsonPath = path.join(rootPath, "package.json");
      if (await this.fileExists(packageJsonPath)) {
        const packageJson = JSON.parse(
          await fs.readFile(packageJsonPath, "utf-8")
        );

        // Check dependencies for framework signatures
        const allDeps = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
          ...packageJson.peerDependencies,
        };

        if (allDeps.react || allDeps["@types/react"]) {
          if (allDeps.next) return "nextjs";
          return "react";
        }

        if (allDeps.vue) return "vue";
        if (allDeps["@angular/core"]) return "angular";
        if (allDeps.svelte) return "svelte";
        if (allDeps.express) return "express";
        if (allDeps["@nestjs/core"]) return "nestjs";

        // Check for monorepo
        if (packageJson.workspaces) return "monorepo";

        // Default to nodejs for JavaScript projects
        return "nodejs";
      }

      // Check for Python
      if (
        (await this.fileExists(path.join(rootPath, "requirements.txt"))) ||
        (await this.fileExists(path.join(rootPath, "setup.py"))) ||
        (await this.fileExists(path.join(rootPath, "pyproject.toml")))
      ) {
        // Check for Python frameworks
        const requirementsPath = path.join(rootPath, "requirements.txt");
        if (await this.fileExists(requirementsPath)) {
          const requirements = await fs.readFile(requirementsPath, "utf-8");
          if (requirements.includes("django")) return "django";
          if (requirements.includes("flask")) return "flask";
        }

        return "python";
      }

      // Check for Rust
      if (await this.fileExists(path.join(rootPath, "Cargo.toml"))) {
        return "rust";
      }

      // Check for Go
      if (await this.fileExists(path.join(rootPath, "go.mod"))) {
        return "go";
      }

      // Check for Java
      if (await this.fileExists(path.join(rootPath, "pom.xml"))) {
        return "java";
      }

      return "unknown";
    } catch (error) {
      logger.warn("Failed to detect project type:", error);
      return "unknown";
    }
  }

  /**
   * Detect package manager
   */
  private async detectPackageManager(
    rootPath: string
  ): Promise<PackageManager> {
    // C++ build systems
    if (await this.fileExists(path.join(rootPath, "CMakeLists.txt"))) {
      return "cmake";
    }
    if (
      (await this.fileExists(path.join(rootPath, ".pro"))) ||
      (await this.fileExists(path.join(rootPath, ".pri")))
    ) {
      return "qmake";
    }
    if (
      (await this.fileExists(path.join(rootPath, "Makefile"))) ||
      (await this.fileExists(path.join(rootPath, "makefile")))
    ) {
      return "make";
    }
    if (await this.fileExists(path.join(rootPath, "meson.build"))) {
      return "meson";
    }
    if (
      (await this.fileExists(path.join(rootPath, "BUILD"))) ||
      (await this.fileExists(path.join(rootPath, "BUILD.bazel"))) ||
      (await this.fileExists(path.join(rootPath, "WORKSPACE")))
    ) {
      return "bazel";
    }
    if (await this.fileExists(path.join(rootPath, "vcpkg.json"))) {
      return "vcpkg";
    }
    if (await this.fileExists(path.join(rootPath, "conanfile.txt"))) {
      return "conan";
    }

    // .NET
    try {
      const entries = await fs.readdir(rootPath);
      if (entries.some(name => name.endsWith(".csproj") || name.endsWith(".sln"))) {
        return "dotnet";
      }
    } catch {
      // If the directory cannot be read, fall through to other detectors
    }

    // Node.js
    if (await this.fileExists(path.join(rootPath, "bun.lockb"))) return "bun";
    if (await this.fileExists(path.join(rootPath, "pnpm-lock.yaml")))
      return "pnpm";
    if (await this.fileExists(path.join(rootPath, "yarn.lock"))) return "yarn";
    if (await this.fileExists(path.join(rootPath, "package-lock.json")))
      return "npm";

    // Python
    if (await this.fileExists(path.join(rootPath, "requirements.txt")))
      return "pip";

    // Rust
    if (await this.fileExists(path.join(rootPath, "Cargo.lock")))
      return "cargo";

    // Go
    if (await this.fileExists(path.join(rootPath, "go.sum"))) return "go-mod";

    // Java
    if (await this.fileExists(path.join(rootPath, "pom.xml"))) return "maven";
    if (await this.fileExists(path.join(rootPath, "build.gradle")))
      return "gradle";

    return "unknown";
  }

  /**
   * Detect workspaces in monorepo
   */
  private async detectWorkspaces(
    rootPath: string,
    packageManager: PackageManager
  ): Promise<WorkspaceInfo[] | undefined> {
    try {
      if (
        packageManager === "npm" ||
        packageManager === "yarn" ||
        packageManager === "pnpm"
      ) {
        const packageJsonPath = path.join(rootPath, "package.json");
        if (await this.fileExists(packageJsonPath)) {
          const packageJson = JSON.parse(
            await fs.readFile(packageJsonPath, "utf-8")
          );

          if (packageJson.workspaces) {
            const workspaces: WorkspaceInfo[] = [];
            const workspacePatterns = Array.isArray(packageJson.workspaces)
              ? packageJson.workspaces
              : packageJson.workspaces.packages || [];

            for (const pattern of workspacePatterns) {
              // Simple glob pattern matching - can be enhanced
              const workspaceDirs = await this.findWorkspaceDirectories(
                rootPath,
                pattern
              );
              for (const dir of workspaceDirs) {
                const workspacePackageJson = path.join(dir, "package.json");
                if (await this.fileExists(workspacePackageJson)) {
                  const wsPackageJson = JSON.parse(
                    await fs.readFile(workspacePackageJson, "utf-8")
                  );
                  workspaces.push({
                    name: wsPackageJson.name || path.basename(dir),
                    path: path.relative(rootPath, dir),
                    packageJson: wsPackageJson,
                  });
                }
              }
            }

            return workspaces;
          }
        }
      }
    } catch (error) {
      logger.warn("Failed to detect workspaces:", error);
    }

    return undefined;
  }

  /**
   * Initialize file type mapping
   */
  private initializeFileTypeMap(): Map<string, FileTypeInfo> {
    const map = new Map<string, FileTypeInfo>();

    // JavaScript/TypeScript
    map.set(".js", {
      extension: ".js",
      language: "javascript",
      category: "source",
      hasImports: true,
      hasExports: true,
      canDefineInterfaces: false,
    });
    map.set(".ts", {
      extension: ".ts",
      language: "typescript",
      category: "source",
      hasImports: true,
      hasExports: true,
      canDefineInterfaces: true,
    });
    map.set(".tsx", {
      extension: ".tsx",
      language: "typescript",
      category: "source",
      hasImports: true,
      hasExports: true,
      canDefineInterfaces: true,
    });
    map.set(".jsx", {
      extension: ".jsx",
      language: "javascript",
      category: "source",
      hasImports: true,
      hasExports: true,
      canDefineInterfaces: false,
    });

    // Python
    map.set(".py", {
      extension: ".py",
      language: "python",
      category: "source",
      hasImports: true,
      hasExports: true,
      canDefineInterfaces: true,
    });

    // C/C++
    map.set(".c", {
      extension: ".c",
      language: "c",
      category: "source",
      hasImports: true,
      hasExports: false,
      canDefineInterfaces: false,
    });
    map.set(".cpp", {
      extension: ".cpp",
      language: "cpp",
      category: "source",
      hasImports: true,
      hasExports: false,
      canDefineInterfaces: true,
    });
    map.set(".cxx", {
      extension: ".cxx",
      language: "cpp",
      category: "source",
      hasImports: true,
      hasExports: false,
      canDefineInterfaces: true,
    });
    map.set(".cc", {
      extension: ".cc",
      language: "cpp",
      category: "source",
      hasImports: true,
      hasExports: false,
      canDefineInterfaces: true,
    });
    map.set(".h", {
      extension: ".h",
      language: "c",
      category: "source",
      hasImports: true,
      hasExports: false,
      canDefineInterfaces: true,
    });
    map.set(".hpp", {
      extension: ".hpp",
      language: "cpp",
      category: "source",
      hasImports: true,
      hasExports: false,
      canDefineInterfaces: true,
    });
    map.set(".hxx", {
      extension: ".hxx",
      language: "cpp",
      category: "source",
      hasImports: true,
      hasExports: false,
      canDefineInterfaces: true,
    });
    map.set(".hh", {
      extension: ".hh",
      language: "cpp",
      category: "source",
      hasImports: true,
      hasExports: false,
      canDefineInterfaces: true,
    });

    // Qt/QML
    map.set(".qml", {
      extension: ".qml",
      language: "qml",
      category: "source",
      hasImports: true,
      hasExports: false,
      canDefineInterfaces: true,
    });
    map.set(".ui", {
      extension: ".ui",
      language: "xml",
      category: "config",
      hasImports: false,
      hasExports: false,
      canDefineInterfaces: false,
    });
    map.set(".qrc", {
      extension: ".qrc",
      language: "xml",
      category: "config",
      hasImports: false,
      hasExports: false,
      canDefineInterfaces: false,
    });
    map.set(".pro", {
      extension: ".pro",
      language: "qmake",
      category: "build",
      hasImports: false,
      hasExports: false,
      canDefineInterfaces: false,
    });
    map.set(".pri", {
      extension: ".pri",
      language: "qmake",
      category: "build",
      hasImports: false,
      hasExports: false,
      canDefineInterfaces: false,
    });

    // C#/.NET
    map.set(".cs", {
      extension: ".cs",
      language: "csharp",
      category: "source",
      hasImports: true,
      hasExports: false,
      canDefineInterfaces: true,
    });
    map.set(".csproj", {
      extension: ".csproj",
      language: "xml",
      category: "build",
      hasImports: false,
      hasExports: false,
      canDefineInterfaces: false,
    });
    map.set(".sln", {
      extension: ".sln",
      language: "text",
      category: "build",
      hasImports: false,
      hasExports: false,
      canDefineInterfaces: false,
    });

    // Kotlin
    map.set(".kt", {
      extension: ".kt",
      language: "kotlin",
      category: "source",
      hasImports: true,
      hasExports: false,
      canDefineInterfaces: true,
    });
    map.set(".kts", {
      extension: ".kts",
      language: "kotlin",
      category: "source",
      hasImports: true,
      hasExports: false,
      canDefineInterfaces: true,
    });

    // Other languages
    map.set(".rs", {
      extension: ".rs",
      language: "rust",
      category: "source",
      hasImports: true,
      hasExports: true,
      canDefineInterfaces: true,
    });
    map.set(".go", {
      extension: ".go",
      language: "go",
      category: "source",
      hasImports: true,
      hasExports: true,
      canDefineInterfaces: true,
    });
    map.set(".java", {
      extension: ".java",
      language: "java",
      category: "source",
      hasImports: true,
      hasExports: true,
      canDefineInterfaces: true,
    });

    // Config files
    map.set(".json", {
      extension: ".json",
      language: "json",
      category: "config",
      hasImports: false,
      hasExports: false,
      canDefineInterfaces: false,
    });
    map.set(".yaml", {
      extension: ".yaml",
      language: "yaml",
      category: "config",
      hasImports: false,
      hasExports: false,
      canDefineInterfaces: false,
    });
    map.set(".yml", {
      extension: ".yml",
      language: "yaml",
      category: "config",
      hasImports: false,
      hasExports: false,
      canDefineInterfaces: false,
    });
    map.set(".toml", {
      extension: ".toml",
      language: "toml",
      category: "config",
      hasImports: false,
      hasExports: false,
      canDefineInterfaces: false,
    });

    // Documentation
    map.set(".md", {
      extension: ".md",
      language: "markdown",
      category: "documentation",
      hasImports: false,
      hasExports: false,
      canDefineInterfaces: false,
    });
    map.set(".txt", {
      extension: ".txt",
      language: "text",
      category: "documentation",
      hasImports: false,
      hasExports: false,
      canDefineInterfaces: false,
    });

    // Test files
    map.set(".test.js", {
      extension: ".test.js",
      language: "javascript",
      category: "test",
      hasImports: true,
      hasExports: true,
      canDefineInterfaces: false,
    });
    map.set(".test.ts", {
      extension: ".test.ts",
      language: "typescript",
      category: "test",
      hasImports: true,
      hasExports: true,
      canDefineInterfaces: true,
    });
    map.set(".spec.js", {
      extension: ".spec.js",
      language: "javascript",
      category: "test",
      hasImports: true,
      hasExports: true,
      canDefineInterfaces: false,
    });
    map.set(".spec.ts", {
      extension: ".spec.ts",
      language: "typescript",
      category: "test",
      hasImports: true,
      hasExports: true,
      canDefineInterfaces: true,
    });

    // Default fallback
    map.set(".unknown", {
      extension: ".unknown",
      language: "unknown",
      category: "asset",
      hasImports: false,
      hasExports: false,
      canDefineInterfaces: false,
    });

    return map;
  }

  /**
   * Extract imports from source code
   */
  private extractImports(content: string, language: string): ImportInfo[] {
    const imports: ImportInfo[] = [];
    const lines = content.split("\n");

    if (language === "javascript" || language === "typescript") {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // ES6 imports
        const importMatch = line.match(
          /^import\s+(.+)\s+from\s+['"]([^'"]+)['"];?$/
        );
        if (importMatch) {
          const [, specifiers, source] = importMatch;
          imports.push({
            source,
            specifiers: this.parseImportSpecifiers(specifiers),
            isDefault:
              specifiers.trim().match(/^[a-zA-Z_$][a-zA-Z0-9_$]*$/) !== null,
            isNamespace: specifiers.includes("* as "),
            line: i + 1,
          });
        }

        // Require imports
        const requireMatch = line.match(
          /(?:const|let|var)\s+(.+)\s*=\s*require\(['"]([^'"]+)['"]\)/
        );
        if (requireMatch) {
          const [, specifiers, source] = requireMatch;
          imports.push({
            source,
            specifiers: [specifiers.trim()],
            isDefault: true,
            isNamespace: false,
            line: i + 1,
          });
        }
      }
    } else if (language === "python") {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Python imports
        const importMatch = line.match(
          /^(?:from\s+([^\s]+)\s+)?import\s+(.+)$/
        );
        if (importMatch) {
          const [, from, imports_str] = importMatch;
          imports.push({
            source: from || imports_str.split(",")[0].trim(),
            specifiers: imports_str.split(",").map((s) => s.trim()),
            isDefault: false,
            isNamespace: imports_str.includes("*"),
            line: i + 1,
          });
        }
      }
    } else if (language === "c" || language === "cpp") {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // C++20+ module imports
        const moduleImportMatch = line.match(/^import\s+([^;]+);/);
        if (moduleImportMatch) {
          const [, module] = moduleImportMatch;
          imports.push({
            source: module.trim(),
            specifiers: [],
            isDefault: false,
            isNamespace: false,
            line: i + 1,
          });
        }

        // C++20+ module exports
        const moduleExportMatch = line.match(/^export\s+module\s+([^;]+);/);
        if (moduleExportMatch) {
          const [, module] = moduleExportMatch;
          imports.push({
            source: `module:${module.trim()}`,
            specifiers: [],
            isDefault: false,
            isNamespace: false,
            line: i + 1,
          });
        }

        // Traditional C/C++ includes
        const includeMatch = line.match(/^#include\s+[<"]([^>"]+)[>"]/);
        if (includeMatch) {
          const [, source] = includeMatch;
          imports.push({
            source,
            specifiers: [],
            isDefault: false,
            isNamespace: false,
            line: i + 1,
          });
        }
      }
    } else if (language === "csharp") {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // C# using statements
        const usingMatch = line.match(/^using\s+([^;]+);/);
        if (usingMatch) {
          const [, namespace_] = usingMatch;
          imports.push({
            source: namespace_.trim(),
            specifiers: [],
            isDefault: false,
            isNamespace: true,
            line: i + 1,
          });
        }
      }
    } else if (language === "qml") {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // QML imports
        const importMatch = line.match(/^import\s+([^\s]+)(?:\s+(\d+\.\d+))?/);
        if (importMatch) {
          const [, module, version] = importMatch;
          imports.push({
            source: version ? `${module} ${version}` : module,
            specifiers: [],
            isDefault: false,
            isNamespace: false,
            line: i + 1,
          });
        }
      }
    }

    return imports;
  }

  /**
   * Extract exports from source code
   */
  private extractExports(content: string, language: string): ExportInfo[] {
    const exports: ExportInfo[] = [];
    const lines = content.split("\n");

    if (language === "javascript" || language === "typescript") {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Named exports
        const namedExportMatch = line.match(
          /^export\s+(?:const|let|var|function|class|interface|type)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/
        );
        if (namedExportMatch) {
          const [, name] = namedExportMatch;
          exports.push({
            name,
            type: this.determineExportType(line),
            line: i + 1,
          });
        }

        // Default exports
        const defaultExportMatch = line.match(/^export\s+default\s+/);
        if (defaultExportMatch) {
          exports.push({
            name: "default",
            type: "default",
            line: i + 1,
          });
        }
      }
    }

    return exports;
  }

  /**
   * Extract interfaces from source code
   */
  private extractInterfaces(
    content: string,
    language: string
  ): InterfaceInfo[] {
    const interfaces: InterfaceInfo[] = [];
    const lines = content.split("\n");

    if (language === "typescript") {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        const interfaceMatch = line.match(
          /^(?:export\s+)?interface\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:extends\s+([^{]+))?\s*{?/
        );
        if (interfaceMatch) {
          const [, name, extendsClause] = interfaceMatch;
          interfaces.push({
            name,
            properties: [], // Would need more sophisticated parsing for properties
            extends: extendsClause
              ? extendsClause.split(",").map((s) => s.trim())
              : [],
            line: i + 1,
            isExported: line.startsWith("export"),
          });
        }
      }
    } else if (language === "cpp" || language === "c") {
      let currentNamespace = "";
      let braceDepth = 0;
      const namespaceStack: { name: string; depth: number }[] = [];

      for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        const line = rawLine.trim();

        // Track namespace declarations (including nested namespaces with ::)
        const namespaceMatch = line.match(
          /^namespace\s+([a-zA-Z_][a-zA-Z0-9_:]*(?:::[a-zA-Z_][a-zA-Z0-9_]*)*)\s*{?/
        );
        if (namespaceMatch) {
          const declaredNamespace = namespaceMatch[1];
          const hasOpeningBrace = line.includes("{");
          const fullNamespace = currentNamespace
            ? `${currentNamespace}::${declaredNamespace}`
            : declaredNamespace;
          // Namespace becomes active at the depth after its opening brace (if present)
          const activationDepth = braceDepth + (hasOpeningBrace ? 1 : 0);
          namespaceStack.push({ name: fullNamespace, depth: activationDepth });
          currentNamespace = fullNamespace;
        }

        // Update brace depth for all scopes (namespaces, classes, functions, etc.)
        const openBraces = (rawLine.match(/{/g) || []).length;
        const closeBraces = (rawLine.match(/}/g) || []).length;
        braceDepth += openBraces - closeBraces;

        // Pop namespaces whose scope has ended
        while (
          namespaceStack.length > 0 &&
          braceDepth < namespaceStack[namespaceStack.length - 1].depth
        ) {
          namespaceStack.pop();
        }
        currentNamespace =
          namespaceStack.length > 0
            ? namespaceStack[namespaceStack.length - 1].name
            : "";

        // C++20+ concept declarations
        const conceptMatch = line.match(
          /^(?:template\s*<[^>]+>\s*)?concept\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=/
        );
        if (conceptMatch) {
          const [, name] = conceptMatch;
          const fullName = currentNamespace
            ? `${currentNamespace}::${name}`
            : name;
          interfaces.push({
            name: fullName,
            properties: [],
            extends: [],
            line: i + 1,
            isExported: true,
          });
        }

        // C++ class declarations (with namespace support, constexpr, final, etc.)
        const classMatch = line.match(
          /^(?:export\s+)?(?:template\s*<[^>]+>\s*)?(?:constexpr\s+)?class\s+(?:__declspec\([^)]+\)\s+)?(?:alignas\([^)]+\)\s+)?([a-zA-Z_][a-zA-Z0-9_:]*)\s*(?:final\s+)?(?::\s*(?:public|protected|private)\s+([^{]+))?\s*{?/
        );
        if (classMatch) {
          const [, name, inheritance] = classMatch;
          // Handle namespace-qualified names (e.g., MyNamespace::MyClass)
          const fullName = name.includes("::")
            ? name
            : currentNamespace
            ? `${currentNamespace}::${name}`
            : name;
          interfaces.push({
            name: fullName,
            properties: [],
            extends: inheritance
              ? inheritance
                  .split(",")
                  .map((s) =>
                    s.trim().replace(/^(public|protected|private)\s+/, "")
                  )
              : [],
            line: i + 1,
            isExported: true,
          });
        }

        // C++ struct declarations (with namespace support, constexpr, etc.)
        const structMatch = line.match(
          /^(?:export\s+)?(?:template\s*<[^>]+>\s*)?(?:constexpr\s+)?struct\s+(?:alignas\([^)]+\)\s+)?([a-zA-Z_][a-zA-Z0-9_:]*)\s*(?:final\s+)?(?::\s*(?:public|protected|private)\s+([^{]+))?\s*{?/
        );
        if (structMatch) {
          const [, name, inheritance] = structMatch;
          const fullName = name.includes("::")
            ? name
            : currentNamespace
            ? `${currentNamespace}::${name}`
            : name;
          interfaces.push({
            name: fullName,
            properties: [],
            extends: inheritance
              ? inheritance
                  .split(",")
                  .map((s) =>
                    s.trim().replace(/^(public|protected|private)\s+/, "")
                  )
              : [],
            line: i + 1,
            isExported: true,
          });
        }

        // C++ enum class declarations
        const enumClassMatch = line.match(
          /^(?:enum\s+class|enum\s+struct)\s+([a-zA-Z_][a-zA-Z0-9_:]*)\s*(?::\s*([^{]+))?\s*{?/
        );
        if (enumClassMatch) {
          const [, name, underlyingType] = enumClassMatch;
          const fullName = name.includes("::")
            ? name
            : currentNamespace
            ? `${currentNamespace}::${name}`
            : name;
          interfaces.push({
            name: fullName,
            properties: [],
            extends: underlyingType ? [underlyingType.trim()] : [],
            line: i + 1,
            isExported: true,
          });
        }
      }
    } else if (language === "csharp") {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // C# interface declarations
        const interfaceMatch = line.match(
          /^(?:public\s+|internal\s+)?interface\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?::\s+([^{]+))?\s*{?/
        );
        if (interfaceMatch) {
          const [, name, inheritance] = interfaceMatch;
          interfaces.push({
            name,
            properties: [],
            extends: inheritance
              ? inheritance.split(",").map((s) => s.trim())
              : [],
            line: i + 1,
            isExported: true,
          });
        }

        // C# class declarations
        const classMatch = line.match(
          /^(?:public\s+|internal\s+)?(?:abstract\s+|sealed\s+)?class\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?::\s+([^{]+))?\s*{?/
        );
        if (classMatch) {
          const [, name, inheritance] = classMatch;
          interfaces.push({
            name,
            properties: [],
            extends: inheritance
              ? inheritance.split(",").map((s) => s.trim())
              : [],
            line: i + 1,
            isExported: true,
          });
        }
      }
    } else if (language === "qml") {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // QML type declarations
        const qmlTypeMatch = line.match(/^([A-Z][a-zA-Z0-9_]*)\s*{/);
        if (qmlTypeMatch) {
          const [, name] = qmlTypeMatch;
          interfaces.push({
            name,
            properties: [],
            extends: [],
            line: i + 1,
            isExported: true,
          });
        }
      }
    }

    return interfaces;
  }

  // Helper methods
  private shouldExclude(relativePath: string): boolean {
    return this.excludePatterns.some((pattern) => pattern.test(relativePath));
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private extractLanguages(files: FileAnalysis[]): string[] {
    const languages = new Set<string>();
    files.forEach((file) => {
      if (file.fileType.category === "source") {
        languages.add(file.fileType.language);
      }
    });
    return Array.from(languages);
  }

  private async detectFrameworks(
    rootPath: string,
    files: FileAnalysis[]
  ): Promise<string[]> {
    const frameworks: string[] = [];

    // Check package.json for framework dependencies
    try {
      const packageJsonPath = path.join(rootPath, "package.json");
      if (await this.fileExists(packageJsonPath)) {
        const packageJson = JSON.parse(
          await fs.readFile(packageJsonPath, "utf-8")
        );
        const allDeps = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
        };

        const frameworkMap: { [key: string]: string } = {
          react: "React",
          vue: "Vue.js",
          "@angular/core": "Angular",
          svelte: "Svelte",
          express: "Express.js",
          "@nestjs/core": "NestJS",
          next: "Next.js",
          nuxt: "Nuxt.js",
          gatsby: "Gatsby",
        };

        Object.keys(allDeps).forEach((dep) => {
          if (frameworkMap[dep]) {
            frameworks.push(frameworkMap[dep]);
          }
        });
      }
    } catch (error) {
      logger.warn("Failed to detect frameworks from package.json:", error);
    }

    return frameworks;
  }

  private identifyEntryPoints(
    files: FileAnalysis[],
    projectType: ProjectType
  ): string[] {
    const entryPoints: string[] = [];

    // Common entry point patterns
    const entryPointPatterns = [
      /^index\.(js|ts|jsx|tsx)$/,
      /^main\.(js|ts)$/,
      /^app\.(js|ts|jsx|tsx)$/,
      /^server\.(js|ts)$/,
      /^src\/index\.(js|ts|jsx|tsx)$/,
      /^src\/main\.(js|ts)$/,
      /^src\/app\.(js|ts|jsx|tsx)$/,
    ];

    files.forEach((file) => {
      const fileName = path.basename(file.relativePath);
      const relativePath = file.relativePath;

      if (
        entryPointPatterns.some((pattern) => pattern.test(relativePath)) ||
        entryPointPatterns.some((pattern) => pattern.test(fileName))
      ) {
        entryPoints.push(file.relativePath);
      }
    });

    return entryPoints;
  }

  private detectTestFile(relativePath: string, content: string): boolean {
    return (
      /\.(test|spec)\.(js|ts|jsx|tsx)$/.test(relativePath) ||
      /\/__tests__\//.test(relativePath) ||
      content.includes("describe(") ||
      content.includes("it(") ||
      content.includes("test(")
    );
  }

  private calculateComplexity(content: string): "low" | "medium" | "high" {
    const lines = content.split("\n").length;
    const functions = (
      content.match(/function\s+\w+|=>\s*{|class\s+\w+/g) || []
    ).length;
    const conditionals = (
      content.match(/if\s*\(|switch\s*\(|while\s*\(|for\s*\(/g) || []
    ).length;

    const complexity = lines / 100 + functions / 5 + conditionals / 10;

    if (complexity < 2) return "low";
    if (complexity < 5) return "medium";
    return "high";
  }

  private calculateDocumentation(content: string, language: string): number {
    const lines = content.split("\n");
    let docLines = 0;

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (language === "javascript" || language === "typescript") {
        if (
          trimmed.startsWith("//") ||
          trimmed.startsWith("/*") ||
          trimmed.startsWith("*")
        ) {
          docLines++;
        }
      } else if (language === "python") {
        if (
          trimmed.startsWith("#") ||
          trimmed.startsWith('"""') ||
          trimmed.startsWith("'''")
        ) {
          docLines++;
        }
      }
    });

    return lines.length > 0 ? (docLines / lines.length) * 100 : 0;
  }

  private parseImportSpecifiers(specifiers: string): string[] {
    // Simplified parsing - can be enhanced
    return specifiers.split(",").map((s) => s.trim().replace(/[{}]/g, ""));
  }

  private determineExportType(line: string): ExportInfo["type"] {
    if (line.includes("function")) return "function";
    if (line.includes("class")) return "class";
    if (line.includes("interface")) return "interface";
    if (line.includes("type")) return "type";
    return "const";
  }

  private isEntryPoint(relativePath: string): boolean {
    return (
      /^(index|main|app|server)\.(js|ts|jsx|tsx)$/.test(
        path.basename(relativePath)
      ) || /^src\/(index|main|app|server)\.(js|ts|jsx|tsx)$/.test(relativePath)
    );
  }

  private async findWorkspaceDirectories(
    rootPath: string,
    pattern: string
  ): Promise<string[]> {
    // Simplified glob matching - in production, use a proper glob library
    const directories: string[] = [];

    try {
      const entries = await fs.readdir(rootPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !this.shouldExclude(entry.name)) {
          const fullPath = path.join(rootPath, entry.name);

          // Simple pattern matching - enhance with proper glob support
          if (pattern.includes("*") || entry.name.match(pattern)) {
            directories.push(fullPath);
          }
        }
      }
    } catch (error) {
      logger.warn(
        `Failed to find workspace directories for pattern ${pattern}:`,
        error
      );
    }

    return directories;
  }

  /**
   * Check if project contains C++ files
   */
  private async hasCppFiles(rootPath: string): Promise<boolean> {
    try {
      const entries = await fs.readdir(rootPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if ([".cpp", ".cc", ".cxx", ".hpp", ".hxx", ".hh"].includes(ext)) {
            return true;
          }
        } else if (entry.isDirectory() && !this.shouldExclude(entry.name)) {
          if (await this.hasCppFiles(path.join(rootPath, entry.name))) {
            return true;
          }
        }
      }
    } catch (error) {
      // Ignore errors
    }
    return false;
  }

  /**
   * Check if project contains QML files
   */
  private async hasQMLFiles(rootPath: string): Promise<boolean> {
    try {
      const entries = await fs.readdir(rootPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".qml")) {
          return true;
        } else if (entry.isDirectory() && !this.shouldExclude(entry.name)) {
          if (await this.hasQMLFiles(path.join(rootPath, entry.name))) {
            return true;
          }
        }
      }
    } catch (error) {
      // Ignore errors
    }
    return false;
  }

  /**
   * Check if CMakeLists.txt contains Qt references
   */
  private async hasQtInCMake(cmakeFilePath: string): Promise<boolean> {
    try {
      const content = await fs.readFile(cmakeFilePath, "utf-8");
      return (
        content.includes("find_package(Qt") ||
        content.includes("find_package(Qt5") ||
        content.includes("find_package(Qt6") ||
        content.includes("qt_add_") ||
        content.includes("qt5_") ||
        content.includes("qt6_")
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if project has Qt project files (.pro, .pri)
   */
  private async hasQtProject(rootPath: string): Promise<boolean> {
    try {
      const entries = await fs.readdir(rootPath);
      return entries.some(
        (entry) => entry.endsWith(".pro") || entry.endsWith(".pri")
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if project contains C# files
   */
  private async hasCSharpProject(rootPath: string): Promise<boolean> {
    try {
      const entries = await fs.readdir(rootPath);
      return entries.some(
        (entry) =>
          entry.endsWith(".csproj") ||
          entry.endsWith(".sln") ||
          entry.endsWith(".cs")
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if project contains Kotlin files
   */
  private async hasKotlinFiles(rootPath: string): Promise<boolean> {
    try {
      const entries = await fs.readdir(rootPath, { withFileTypes: true });
      for (const entry of entries) {
        if (
          entry.isFile() &&
          (entry.name.endsWith(".kt") || entry.name.endsWith(".kts"))
        ) {
          return true;
        } else if (entry.isDirectory() && !this.shouldExclude(entry.name)) {
          if (await this.hasKotlinFiles(path.join(rootPath, entry.name))) {
            return true;
          }
        }
      }
    } catch (error) {
      // Ignore errors
    }
    return false;
  }
}
