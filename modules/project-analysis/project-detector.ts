import { promises as fs } from "fs";
import path from "path";
import { logger } from "../logger.js";
import { IgnorePolicy } from "./ignore-policy.js";
import type {
  FileAnalysis,
  PackageManager,
  ProjectType,
  WorkspaceInfo,
} from "./project-types.js";

export class ProjectDetector {
  constructor(private ignorePolicy: IgnorePolicy) {}

  async detectProjectType(rootPath: string): Promise<ProjectType> {
    try {
      if (await this.hasQtQmlProject(rootPath)) return "cpp-qml";
      if (await this.hasQtProject(rootPath)) return "cpp-qt";
      if (await this.fileExists(path.join(rootPath, "CMakeLists.txt"))) {
        return (await this.hasCppFiles(rootPath)) ? "cpp-cmake" : "c";
      }
      if (await this.hasAnyFile(rootPath, ["Makefile", "makefile"])) {
        return (await this.hasCppFiles(rootPath)) ? "cpp-make" : "c";
      }
      if (await this.fileExists(path.join(rootPath, "meson.build"))) {
        return (await this.hasCppFiles(rootPath)) ? "cpp-meson" : "c";
      }
      if (await this.hasAnyFile(rootPath, ["BUILD", "BUILD.bazel", "WORKSPACE"])) {
        return (await this.hasCppFiles(rootPath)) ? "cpp-bazel" : "c";
      }
      if (await this.hasCppFiles(rootPath)) return "cpp";
      if (await this.hasDotnetProject(rootPath)) return "dotnet";
      if (await this.hasKotlinFiles(rootPath)) return "kotlin";

      const packageJsonPath = path.join(rootPath, "package.json");
      if (await this.fileExists(packageJsonPath)) {
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf-8"));
        const allDeps = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
          ...packageJson.peerDependencies,
        };

        if (allDeps.react || allDeps["@types/react"]) {
          return allDeps.next ? "nextjs" : "react";
        }
        if (allDeps.vue) return "vue";
        if (allDeps["@angular/core"]) return "angular";
        if (allDeps.svelte) return "svelte";
        if (allDeps.express) return "express";
        if (allDeps["@nestjs/core"]) return "nestjs";
        if (packageJson.workspaces) return "monorepo";
        return "nodejs";
      }

      if (await this.hasAnyFile(rootPath, ["requirements.txt", "setup.py", "pyproject.toml"])) {
        const requirementsPath = path.join(rootPath, "requirements.txt");
        if (await this.fileExists(requirementsPath)) {
          const requirements = (await fs.readFile(requirementsPath, "utf-8")).toLowerCase();
          if (requirements.includes("django")) return "django";
          if (requirements.includes("flask")) return "flask";
        }
        return "python";
      }

      if (await this.fileExists(path.join(rootPath, "Cargo.toml"))) return "rust";
      if (await this.fileExists(path.join(rootPath, "go.mod"))) return "go";
      if (await this.fileExists(path.join(rootPath, "pom.xml"))) return "java";
      return "unknown";
    } catch (error) {
      logger.warn("Failed to detect project type:", error);
      return "unknown";
    }
  }

  async detectPackageManager(rootPath: string): Promise<PackageManager> {
    if (await this.fileExists(path.join(rootPath, "CMakeLists.txt"))) return "cmake";
    if (await this.hasFileWithExtension(rootPath, ".pro")) return "qmake";
    if (await this.hasAnyFile(rootPath, ["Makefile", "makefile"])) return "make";
    if (await this.fileExists(path.join(rootPath, "meson.build"))) return "meson";
    if (await this.hasAnyFile(rootPath, ["BUILD", "BUILD.bazel", "WORKSPACE"])) return "bazel";
    if (await this.fileExists(path.join(rootPath, "vcpkg.json"))) return "vcpkg";
    if (await this.fileExists(path.join(rootPath, "conanfile.txt"))) return "conan";
    if (await this.hasFileWithExtension(rootPath, ".csproj")) return "dotnet";
    if (await this.fileExists(path.join(rootPath, "bun.lockb"))) return "bun";
    if (await this.fileExists(path.join(rootPath, "pnpm-lock.yaml"))) return "pnpm";
    if (await this.fileExists(path.join(rootPath, "yarn.lock"))) return "yarn";
    if (await this.fileExists(path.join(rootPath, "package-lock.json"))) return "npm";
    if (await this.fileExists(path.join(rootPath, "requirements.txt"))) return "pip";
    if (await this.fileExists(path.join(rootPath, "Cargo.lock"))) return "cargo";
    if (await this.fileExists(path.join(rootPath, "go.sum"))) return "go-mod";
    if (await this.fileExists(path.join(rootPath, "pom.xml"))) return "maven";
    if (await this.fileExists(path.join(rootPath, "build.gradle"))) return "gradle";
    return "unknown";
  }

  async detectWorkspaces(
    rootPath: string,
    packageManager: PackageManager,
  ): Promise<WorkspaceInfo[] | undefined> {
    if (!["npm", "yarn", "pnpm"].includes(packageManager)) return undefined;

    try {
      const packageJsonPath = path.join(rootPath, "package.json");
      if (!(await this.fileExists(packageJsonPath))) return undefined;

      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf-8"));
      if (!packageJson.workspaces) return undefined;

      const workspacePatterns = Array.isArray(packageJson.workspaces)
        ? packageJson.workspaces
        : packageJson.workspaces.packages || [];
      const workspaces: WorkspaceInfo[] = [];

      for (const pattern of workspacePatterns) {
        const workspaceDirs = await this.findWorkspaceDirectories(rootPath, pattern);
        for (const dir of workspaceDirs) {
          const workspacePackageJson = path.join(dir, "package.json");
          if (!(await this.fileExists(workspacePackageJson))) continue;
          const wsPackageJson = JSON.parse(
            await fs.readFile(workspacePackageJson, "utf-8"),
          );
          workspaces.push({
            name: wsPackageJson.name || path.basename(dir),
            path: path.relative(rootPath, dir),
            packageJson: wsPackageJson,
          });
        }
      }

      return workspaces;
    } catch (error) {
      logger.warn("Failed to detect workspaces:", error);
      return undefined;
    }
  }

  async detectFrameworks(rootPath: string, files: FileAnalysis[]): Promise<string[]> {
    const frameworks = new Set<string>();
    const packageJsonPath = path.join(rootPath, "package.json");

    try {
      if (await this.fileExists(packageJsonPath)) {
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf-8"));
        const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
        const frameworkMap: Record<string, string> = {
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
          if (frameworkMap[dep]) frameworks.add(frameworkMap[dep]);
        });
      }
    } catch (error) {
      logger.warn("Failed to detect frameworks from package.json:", error);
    }

    if (files.some((file) => file.fileType.language === "qml")) frameworks.add("Qt/QML");
    return Array.from(frameworks);
  }

  identifyEntryPoints(files: FileAnalysis[], projectType: ProjectType): string[] {
    const patterns = [
      /^index\.(js|ts|jsx|tsx)$/,
      /^main\.(js|ts)$/,
      /^app\.(js|ts|jsx|tsx)$/,
      /^server\.(js|ts)$/,
      /^src\/index\.(js|ts|jsx|tsx)$/,
      /^src\/main\.(js|ts)$/,
      /^src\/app\.(js|ts|jsx|tsx)$/,
    ];

    return files
      .filter((file) => {
        const relativePath = file.relativePath.replace(/\\/g, "/");
        return (
          patterns.some((pattern) => pattern.test(relativePath)) ||
          (projectType === "python" && relativePath === "__main__.py")
        );
      })
      .map((file) => file.relativePath);
  }

  private async findWorkspaceDirectories(rootPath: string, pattern: string): Promise<string[]> {
    const directories: string[] = [];
    try {
      const basePattern = pattern.replace(/\/\*+$/, "");
      const baseDir = path.join(rootPath, basePattern.includes("*") ? "." : basePattern);
      const scanRoot = basePattern.includes("*") ? rootPath : baseDir;
      const entries = await fs.readdir(scanRoot, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const fullPath = path.join(scanRoot, entry.name);
        const relativePath = path.relative(rootPath, fullPath);
        if (this.ignorePolicy.ignores(relativePath)) continue;
        if (pattern.includes("*") || relativePath === basePattern) {
          directories.push(fullPath);
        }
      }
    } catch (error) {
      logger.warn(`Failed to find workspace directories for pattern ${pattern}:`, error);
    }
    return directories;
  }

  private async hasQtQmlProject(rootPath: string): Promise<boolean> {
    return (
      (await this.fileExists(path.join(rootPath, "CMakeLists.txt"))) &&
      (await this.hasQtInCMake(path.join(rootPath, "CMakeLists.txt"))) &&
      (await this.hasFilesWithExtensions(rootPath, [".qml"]))
    );
  }

  private async hasQtProject(rootPath: string): Promise<boolean> {
    return (
      (await this.hasFileWithExtension(rootPath, ".pro")) ||
      (await this.hasFileWithExtension(rootPath, ".pri"))
    );
  }

  private async hasCppFiles(rootPath: string): Promise<boolean> {
    return this.hasFilesWithExtensions(rootPath, [".cpp", ".cc", ".cxx", ".hpp", ".hxx", ".hh"]);
  }

  private async hasKotlinFiles(rootPath: string): Promise<boolean> {
    return this.hasFilesWithExtensions(rootPath, [".kt", ".kts"]);
  }

  private async hasDotnetProject(rootPath: string): Promise<boolean> {
    return (
      (await this.hasFileWithExtension(rootPath, ".csproj")) ||
      (await this.hasFileWithExtension(rootPath, ".sln")) ||
      (await this.hasFileWithExtension(rootPath, ".cs"))
    );
  }

  private async hasFilesWithExtensions(rootPath: string, extensions: string[]): Promise<boolean> {
    try {
      const entries = await fs.readdir(rootPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(rootPath, entry.name);
        const relativePath = path.relative(rootPath, fullPath);
        if (this.ignorePolicy.ignores(relativePath)) continue;

        if (entry.isFile() && extensions.includes(path.extname(entry.name).toLowerCase())) {
          return true;
        }
        if (entry.isDirectory() && (await this.hasFilesWithExtensions(fullPath, extensions))) {
          return true;
        }
      }
    } catch {
      return false;
    }
    return false;
  }

  private async hasQtInCMake(cmakeFilePath: string): Promise<boolean> {
    try {
      const content = await fs.readFile(cmakeFilePath, "utf-8");
      return /find_package\(Qt[56]?|qt_add_|qt5_|qt6_/.test(content);
    } catch {
      return false;
    }
  }

  private async hasFileWithExtension(dir: string, extension: string): Promise<boolean> {
    try {
      const entries = await fs.readdir(dir);
      return entries.some((entry) => entry.endsWith(extension));
    } catch {
      return false;
    }
  }

  private async hasAnyFile(dir: string, names: string[]): Promise<boolean> {
    for (const name of names) {
      if (await this.fileExists(path.join(dir, name))) return true;
    }
    return false;
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
