export interface FileTypeInfo {
  extension: string;
  language: string;
  category: "source" | "config" | "documentation" | "asset" | "test" | "build";
  hasImports: boolean;
  hasExports: boolean;
  canDefineInterfaces: boolean;
}

export interface ProjectInfo {
  rootPath: string;
  projectType: ProjectType;
  packageManager: PackageManager;
  frameworks: string[];
  languages: string[];
  workspaces?: WorkspaceInfo[];
  entryPoints: string[];
}

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
    documentation: number;
    isGenerated?: boolean;
    skippedReason?: "too-large" | "generated" | "too-many-lines";
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
