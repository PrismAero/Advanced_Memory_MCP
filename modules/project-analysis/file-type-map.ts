import type { FileTypeInfo } from "./project-types.js";

const source = (
  extension: string,
  language: string,
  canDefineInterfaces = true,
  hasExports = true,
): FileTypeInfo => ({
  extension,
  language,
  category: "source",
  hasImports: true,
  hasExports,
  canDefineInterfaces,
});

const config = (extension: string, language: string): FileTypeInfo => ({
  extension,
  language,
  category: "config",
  hasImports: false,
  hasExports: false,
  canDefineInterfaces: false,
});

export function buildFileTypeMap(): Map<string, FileTypeInfo> {
  const map = new Map<string, FileTypeInfo>();

  for (const ext of [".ts", ".tsx", ".test.ts", ".spec.ts"]) {
    map.set(ext, source(ext, "typescript"));
  }
  for (const ext of [".js", ".jsx", ".test.js", ".spec.js"]) {
    map.set(ext, source(ext, "javascript", false));
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

  map.set(".json", config(".json", "json"));
  map.set(".yaml", config(".yaml", "yaml"));
  map.set(".yml", config(".yml", "yaml"));
  map.set(".toml", config(".toml", "toml"));
  map.set(".ui", config(".ui", "xml"));
  map.set(".qrc", config(".qrc", "xml"));
  map.set(".pro", { ...config(".pro", "qmake"), category: "build" });
  map.set(".pri", { ...config(".pri", "qmake"), category: "build" });
  map.set(".csproj", { ...config(".csproj", "xml"), category: "build" });
  map.set(".sln", { ...config(".sln", "text"), category: "build" });

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
