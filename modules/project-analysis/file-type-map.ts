import type { FileTypeInfo } from "./project-types.js";

const typeInfo = (
  extension: string,
  language: string,
  category: FileTypeInfo["category"],
  options: Partial<FileTypeInfo> = {},
): FileTypeInfo => ({
  extension,
  language,
  category,
  hasImports: options.hasImports ?? category === "source",
  hasExports: options.hasExports ?? category === "source",
  canDefineInterfaces: options.canDefineInterfaces ?? category === "source",
  fileKind: options.fileKind || category,
  contextRole:
    options.contextRole ||
    (category === "source"
      ? "code"
      : category === "schema" || category === "protocol" || category === "build"
        ? "dependency"
        : category === "asset"
          ? "none"
          : "metadata"),
  shouldParseContent:
    options.shouldParseContent ??
    (category === "source" || category === "schema" || category === "protocol"),
});

const source = (
  extension: string,
  language: string,
  canDefineInterfaces = true,
  hasExports = true,
): FileTypeInfo =>
  typeInfo(extension, language, "source", {
    canDefineInterfaces,
    hasExports,
    contextRole: "code",
  });

const config = (extension: string, language: string, fileKind = "config"): FileTypeInfo =>
  typeInfo(extension, language, "config", {
    hasImports: false,
    hasExports: false,
    canDefineInterfaces: false,
    fileKind,
    contextRole: "metadata",
    shouldParseContent: false,
  });

export function buildFileTypeMap(): Map<string, FileTypeInfo> {
  const map = new Map<string, FileTypeInfo>();

  for (const ext of [".ts", ".tsx", ".mts", ".cts", ".test.ts", ".spec.ts"]) {
    map.set(ext, source(ext, "typescript"));
  }
  for (const ext of [".js", ".jsx", ".mjs", ".cjs", ".test.js", ".spec.js"]) {
    map.set(ext, source(ext, "javascript"));
  }
  map.set(".py", source(".py", "python"));
  map.set(".rs", source(".rs", "rust"));
  map.set(".go", source(".go", "go"));
  map.set(".java", source(".java", "java"));
  map.set(".kt", source(".kt", "kotlin", true, false));
  map.set(".kts", source(".kts", "kotlin", true, false));

  for (const ext of [".c", ".h"]) {
    map.set(ext, source(ext, "c", true, false));
  }
  for (const ext of [".cpp", ".cxx", ".cc", ".hpp", ".hxx", ".hh"]) {
    map.set(ext, source(ext, "cpp", true, false));
  }
  map.set(".qml", source(".qml", "qml", true, false));
  map.set(".cs", source(".cs", "csharp", true, false));
  for (const ext of [".m", ".mm"]) map.set(ext, source(ext, "objective-c", true, false));
  for (const ext of [".swift", ".rb", ".php", ".lua", ".pl", ".pm", ".r", ".R", ".scala", ".dart", ".ex", ".exs", ".erl", ".hrl", ".hs", ".zig"]) {
    const language = ext === ".R" ? "r" : ext.slice(1);
    map.set(ext, source(ext, language));
  }

  for (const ext of [".proto", ".pbtxt", ".graphql", ".gql", ".avsc", ".avdl", ".thrift", ".fbs", ".capnp", ".jsonschema"]) {
    const language = ext === ".proto" ? "protobuf" : ext.slice(1);
    map.set(ext, typeInfo(ext, language, ext === ".proto" ? "protocol" : "schema", {
      canDefineInterfaces: false,
      hasImports: ext === ".proto" || ext === ".graphql" || ext === ".gql",
      hasExports: false,
      contextRole: "dependency",
    }));
  }

  map.set(".json", config(".json", "json", "data"));
  map.set(".jsonc", config(".jsonc", "jsonc", "config"));
  map.set(".yaml", config(".yaml", "yaml"));
  map.set(".yml", config(".yml", "yaml"));
  map.set(".toml", config(".toml", "toml"));
  map.set(".xml", config(".xml", "xml"));
  map.set(".ini", config(".ini", "ini"));
  map.set(".env", config(".env", "dotenv"));
  map.set(".ui", typeInfo(".ui", "xml", "schema", { canDefineInterfaces: false }));
  map.set(".qrc", typeInfo(".qrc", "xml", "schema", { canDefineInterfaces: false }));
  for (const ext of [".pro", ".pri", ".cmake", ".mk", ".ninja", ".meson", ".bazel", ".bzl", ".gradle", ".pom", ".csproj", ".sln", ".tf", ".tfvars"]) {
    map.set(ext, typeInfo(ext, ext.slice(1) || "build", "build", {
      hasImports: false,
      hasExports: false,
      canDefineInterfaces: false,
      fileKind: "build",
      contextRole: "dependency",
      shouldParseContent: false,
    }));
  }
  for (const ext of [".dockerfile", ".compose", ".lock"]) {
    map.set(ext, config(ext, ext.slice(1), "build"));
  }

  map.set(".md", {
    ...typeInfo(".md", "markdown", "documentation", {
      hasImports: false,
      hasExports: false,
      canDefineInterfaces: false,
      contextRole: "metadata",
      shouldParseContent: false,
    }),
  });
  map.set(".rst", typeInfo(".rst", "restructuredtext", "documentation", { canDefineInterfaces: false, hasImports: false, hasExports: false, shouldParseContent: false }));
  map.set(".dox", typeInfo(".dox", "doxygen", "documentation", { canDefineInterfaces: false, hasImports: false, hasExports: false, shouldParseContent: false }));
  map.set(".txt", typeInfo(".txt", "text", "documentation", { canDefineInterfaces: false, hasImports: false, hasExports: false, contextRole: "metadata", shouldParseContent: false }));
  for (const ext of [".html", ".htm", ".css", ".scss", ".sass", ".less", ".vue", ".svelte"]) {
    map.set(ext, typeInfo(ext, ext.slice(1), ext === ".html" || ext === ".htm" ? "documentation" : "source", {
      canDefineInterfaces: ext === ".vue" || ext === ".svelte",
      hasImports: ext === ".vue" || ext === ".svelte",
      hasExports: ext === ".vue" || ext === ".svelte",
      contextRole: ext === ".css" || ext === ".scss" || ext === ".sass" || ext === ".less" ? "metadata" : "code",
    }));
  }

  map.set(".unknown", {
    extension: ".unknown",
    language: "unknown",
    category: "asset",
    hasImports: false,
    hasExports: false,
    canDefineInterfaces: false,
    fileKind: "unknown",
    contextRole: "none",
    shouldParseContent: false,
  });

  return map;
}
