import { promises as fs } from "fs";
import path from "path";
import { logger } from "./logger.js";

/**
 * Detected project type
 */
export interface ProjectType {
  primary: string; // typescript, cpp, python, rust, etc.
  secondary: string[]; // Additional detected languages/frameworks
  features: string[]; // qt, react, vue, django, etc.
  confidence: number; // 0-1
}

/**
 * Project Type Detector
 * Analyzes workspace to determine project type and available tools
 */
export class ProjectTypeDetector {
  private cachedProjectType: ProjectType | null = null;
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  /**
   * Detect project type from workspace files
   */
  async detectProjectType(): Promise<ProjectType> {
    if (this.cachedProjectType) {
      return this.cachedProjectType;
    }

    logger.info(`Detecting project type in: ${this.projectPath}`);

    const indicators = {
      typescript: 0,
      javascript: 0,
      cpp: 0,
      python: 0,
      rust: 0,
      go: 0,
      java: 0,
      csharp: 0,
    };

    const features = new Set<string>();
    const secondary: string[] = [];

    try {
      // Check for config files in root
      const rootFiles = await fs.readdir(this.projectPath);

      // TypeScript indicators
      if (rootFiles.includes("tsconfig.json")) indicators.typescript += 3;
      if (rootFiles.includes("package.json")) {
        indicators.typescript += 1;
        indicators.javascript += 1;

        // Check package.json for frameworks
        try {
          const pkgContent = await fs.readFile(
            path.join(this.projectPath, "package.json"),
            "utf-8"
          );
          const pkg = JSON.parse(pkgContent);
          const allDeps = {
            ...pkg.dependencies,
            ...pkg.devDependencies,
          };

          if (allDeps.typescript) indicators.typescript += 2;
          if (allDeps.react || allDeps["@types/react"]) features.add("react");
          if (allDeps.vue) features.add("vue");
          if (allDeps.angular || allDeps["@angular/core"])
            features.add("angular");
          if (allDeps.next) features.add("nextjs");
        } catch (error) {
          // Ignore package.json parse errors
        }
      }

      // C++/Qt indicators
      if (rootFiles.includes("CMakeLists.txt")) indicators.cpp += 3;
      if (rootFiles.includes("meson.build")) indicators.cpp += 2;
      if (rootFiles.includes(".qmake.conf") || rootFiles.includes("*.pro")) {
        indicators.cpp += 2;
        features.add("qt");
      }

      // Check for Qt-specific files
      const hasQmlFiles = await this.hasFilesWithExtension(".qml");
      if (hasQmlFiles) {
        indicators.cpp += 2;
        features.add("qt");
        features.add("qml");
      }

      // Python indicators
      if (rootFiles.includes("pyproject.toml")) indicators.python += 3;
      if (rootFiles.includes("requirements.txt")) indicators.python += 2;
      if (rootFiles.includes("setup.py")) indicators.python += 2;
      if (rootFiles.includes("Pipfile")) indicators.python += 2;

      // Rust indicators
      if (rootFiles.includes("Cargo.toml")) indicators.rust += 3;

      // Go indicators
      if (rootFiles.includes("go.mod")) indicators.go += 3;

      // Java indicators
      if (rootFiles.includes("pom.xml")) indicators.java += 3;
      if (rootFiles.includes("build.gradle")) indicators.java += 3;

      // C# indicators
      if (rootFiles.some((f) => f.endsWith(".csproj"))) indicators.csharp += 3;
      if (rootFiles.some((f) => f.endsWith(".sln"))) indicators.csharp += 2;

      // Count actual source files for more accuracy
      const fileExtCounts = await this.countFileExtensions();

      if (fileExtCounts[".ts"] > 0 || fileExtCounts[".tsx"] > 0) {
        indicators.typescript += Math.min(fileExtCounts[".ts"] / 10, 5);
      }
      if (fileExtCounts[".js"] > 0 || fileExtCounts[".jsx"] > 0) {
        indicators.javascript += Math.min(fileExtCounts[".js"] / 10, 3);
      }
      if (fileExtCounts[".cpp"] > 0 || fileExtCounts[".h"] > 0) {
        indicators.cpp += Math.min(
          (fileExtCounts[".cpp"] + fileExtCounts[".h"]) / 10,
          5
        );
      }
      if (fileExtCounts[".py"] > 0) {
        indicators.python += Math.min(fileExtCounts[".py"] / 10, 5);
      }
      if (fileExtCounts[".rs"] > 0) {
        indicators.rust += Math.min(fileExtCounts[".rs"] / 10, 5);
      }
      if (fileExtCounts[".go"] > 0) {
        indicators.go += Math.min(fileExtCounts[".go"] / 10, 5);
      }
      if (fileExtCounts[".java"] > 0) {
        indicators.java += Math.min(fileExtCounts[".java"] / 10, 5);
      }

      // Determine primary language
      const sorted = Object.entries(indicators)
        .filter(([lang, score]) => score > 0)
        .sort(([, a], [, b]) => b - a);

      if (sorted.length === 0) {
        logger.warn("Could not detect project type, defaulting to generic");
        this.cachedProjectType = {
          primary: "unknown",
          secondary: [],
          features: Array.from(features),
          confidence: 0,
        };
        return this.cachedProjectType;
      }

      const [primaryLang, primaryScore] = sorted[0];

      // Add secondary languages (score > 2)
      for (let i = 1; i < sorted.length; i++) {
        const [lang, score] = sorted[i];
        if (score > 2) {
          secondary.push(lang);
        }
      }

      const confidence = Math.min(primaryScore / 10, 1);

      this.cachedProjectType = {
        primary: primaryLang,
        secondary,
        features: Array.from(features),
        confidence,
      };

      logger.info(
        `Project type detected: ${primaryLang} (confidence: ${Math.round(
          confidence * 100
        )}%)`
      );
      if (features.size > 0) {
        logger.info(`  Features: ${Array.from(features).join(", ")}`);
      }
      if (secondary.length > 0) {
        logger.info(`  Secondary: ${secondary.join(", ")}`);
      }

      return this.cachedProjectType;
    } catch (error) {
      logger.error("Error detecting project type:", error);
      this.cachedProjectType = {
        primary: "unknown",
        secondary: [],
        features: [],
        confidence: 0,
      };
      return this.cachedProjectType;
    }
  }

  /**
   * Check if any files with given extension exist
   */
  private async hasFilesWithExtension(ext: string): Promise<boolean> {
    try {
      const counts = await this.countFileExtensions();
      return (counts[ext] || 0) > 0;
    } catch {
      return false;
    }
  }

  /**
   * Count files by extension (limit depth for performance)
   */
  private async countFileExtensions(
    maxFiles: number = 1000
  ): Promise<{ [ext: string]: number }> {
    const counts: { [ext: string]: number } = {};
    let filesScanned = 0;

    const scanDir = async (dir: string, depth: number) => {
      if (depth > 3 || filesScanned >= maxFiles) return;

      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (filesScanned >= maxFiles) break;

          // Skip hidden and node_modules
          if (entry.name.startsWith(".") || entry.name === "node_modules") {
            continue;
          }

          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            await scanDir(fullPath, depth + 1);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name);
            counts[ext] = (counts[ext] || 0) + 1;
            filesScanned++;
          }
        }
      } catch (error) {
        // Ignore permission errors
      }
    };

    await scanDir(this.projectPath, 0);
    return counts;
  }

  /**
   * Clear cached project type (e.g., when workspace changes)
   */
  clearCache(): void {
    this.cachedProjectType = null;
  }

  /**
   * Check if Qt/QML tools should be available
   */
  shouldEnableQtTools(projectType: ProjectType): boolean {
    return (
      projectType.primary === "cpp" ||
      projectType.features.includes("qt") ||
      projectType.features.includes("qml")
    );
  }

  /**
   * Check if Python tools should be available
   */
  shouldEnablePythonTools(projectType: ProjectType): boolean {
    return (
      projectType.primary === "python" ||
      projectType.secondary.includes("python")
    );
  }

  /**
   * Check if TypeScript/JavaScript tools should be available
   */
  shouldEnableTypeScriptTools(projectType: ProjectType): boolean {
    return (
      projectType.primary === "typescript" ||
      projectType.primary === "javascript" ||
      projectType.secondary.includes("typescript") ||
      projectType.secondary.includes("javascript")
    );
  }
}
