export interface FileTypeInfo {
  extension: string;
  language: string;
  category:
    | "source"
    | "config"
    | "documentation"
    | "asset"
    | "test"
    | "build"
    | "schema"
    | "protocol"
    | "generated"
    | "data";
  hasImports: boolean;
  hasExports: boolean;
  canDefineInterfaces: boolean;
  fileKind?: string;
  contextRole?: "code" | "dependency" | "metadata" | "none";
  shouldParseContent?: boolean;
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
  qualifiedName?: string;
  namespace?: string;
  language?: string;
  kind?: string;
  signature?: string;
  definition?: string;
  documentation?: string;
  visibility?: "public" | "protected" | "private" | "internal" | "package";
  startLine?: number;
  endLine?: number;
  containerName?: string;
  stableId?: string;
  bodyHash?: string;
  parameters?: Array<{ name: string; type?: string; defaultValue?: string }>;
  returnType?: string;
  members?: Array<{
    name: string;
    kind: string;
    type?: string;
    signature?: string;
    visibility?: string;
    isOptional?: boolean;
    isReadonly?: boolean;
    line?: number;
  }>;
  templateParameters?: string[];
  attributes?: string[];
  modifiers?: string[];
  macroParameters?: string[];
  macroReplacement?: string;
  relationships?: Array<{ type: string; target: string; confidence?: number }>;
  summary?: string;
  rankText?: string;
  sourceHash?: string;
  diagnostics?: string[];
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
