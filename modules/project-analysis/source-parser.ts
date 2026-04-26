import type { ExportInfo, ImportInfo, InterfaceInfo } from "./project-types.js";

export class SourceParser {
  extractImports(content: string, language: string): ImportInfo[] {
    const imports: ImportInfo[] = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (language === "javascript" || language === "typescript") {
        const importMatch = line.match(/^import\s+(.+)\s+from\s+['"]([^'"]+)['"];?$/);
        if (importMatch) {
          const [, specifiers, source] = importMatch;
          imports.push({
            source,
            specifiers: this.parseImportSpecifiers(specifiers),
            isDefault: /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(specifiers.trim()),
            isNamespace: specifiers.includes("* as "),
            line: i + 1,
          });
          continue;
        }

        const requireMatch = line.match(
          /(?:const|let|var)\s+(.+)\s*=\s*require\(['"]([^'"]+)['"]\)/,
        );
        if (requireMatch) {
          imports.push({
            source: requireMatch[2],
            specifiers: [requireMatch[1].trim()],
            isDefault: true,
            isNamespace: false,
            line: i + 1,
          });
        }
      } else if (language === "python") {
        const importMatch = line.match(/^(?:from\s+([^\s]+)\s+)?import\s+(.+)$/);
        if (importMatch) {
          const [, from, importsValue] = importMatch;
          imports.push({
            source: from || importsValue.split(",")[0].trim(),
            specifiers: importsValue.split(",").map((specifier) => specifier.trim()),
            isDefault: false,
            isNamespace: importsValue.includes("*"),
            line: i + 1,
          });
        }
      } else if (language === "c" || language === "cpp") {
        const moduleImportMatch = line.match(/^import\s+([^;]+);/);
        if (moduleImportMatch) {
          imports.push({
            source: moduleImportMatch[1].trim(),
            specifiers: [],
            isDefault: false,
            isNamespace: false,
            line: i + 1,
          });
          continue;
        }

        const includeMatch = line.match(/^#\s*include\s*([<"])([^>"]+)[>"]/);
        if (includeMatch) {
          const isLocal = includeMatch[1] === '"';
          imports.push({
            source: includeMatch[2],
            specifiers: [],
            isDefault: isLocal,
            isNamespace: !isLocal,
            line: i + 1,
          });
        }
      } else if (language === "csharp") {
        const usingMatch = line.match(/^using\s+([^;]+);/);
        if (usingMatch) {
          imports.push({
            source: usingMatch[1].trim(),
            specifiers: [],
            isDefault: false,
            isNamespace: true,
            line: i + 1,
          });
        }
      } else if (language === "qml") {
        const importMatch = line.match(/^import\s+([^\s]+)(?:\s+(\d+\.\d+))?/);
        if (importMatch) {
          imports.push({
            source: importMatch[2] ? `${importMatch[1]} ${importMatch[2]}` : importMatch[1],
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

  extractExports(content: string, language: string): ExportInfo[] {
    const exports: ExportInfo[] = [];
    if (language !== "javascript" && language !== "typescript") return exports;

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const namedExportMatch = line.match(
        /^export\s+(?:const|let|var|function|class|interface|type)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/,
      );
      if (namedExportMatch) {
        exports.push({
          name: namedExportMatch[1],
          type: this.determineExportType(line),
          line: i + 1,
        });
      }

      if (/^export\s+default\s+/.test(line)) {
        exports.push({ name: "default", type: "default", line: i + 1 });
      }
    }

    return exports;
  }

  extractInterfaces(content: string, language: string): InterfaceInfo[] {
    if (language === "typescript") return this.extractTypeScriptInterfaces(content);
    if (language === "c" || language === "cpp") return this.extractCppInterfaces(content);
    if (language === "csharp") return this.extractCSharpInterfaces(content);
    if (language === "qml") return this.extractQmlTypes(content);
    if (language === "go") return this.extractGoInterfaces(content);
    if (language === "java" || language === "kotlin") {
      return this.extractJvmInterfaces(content);
    }
    return [];
  }

  detectTestFile(relativePath: string, content: string): boolean {
    return (
      /\.(test|spec)\.(js|ts|jsx|tsx)$/.test(relativePath) ||
      /\/__tests__\//.test(relativePath) ||
      content.includes("describe(") ||
      content.includes("it(") ||
      content.includes("test(")
    );
  }

  calculateComplexity(content: string): "low" | "medium" | "high" {
    const lines = content.split("\n").length;
    const functions = (content.match(/function\s+\w+|=>\s*{|class\s+\w+/g) || []).length;
    const conditionals = (content.match(/if\s*\(|switch\s*\(|while\s*\(|for\s*\(/g) || []).length;
    const complexity = lines / 100 + functions / 5 + conditionals / 10;

    if (complexity < 2) return "low";
    if (complexity < 5) return "medium";
    return "high";
  }

  calculateDocumentation(content: string, language: string): number {
    const lines = content.split("\n");
    let docLines = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (language === "javascript" || language === "typescript") {
        if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
          docLines++;
        }
      } else if (language === "python") {
        if (trimmed.startsWith("#") || trimmed.startsWith('"""') || trimmed.startsWith("'''")) {
          docLines++;
        }
      }
    }

    return lines.length > 0 ? (docLines / lines.length) * 100 : 0;
  }

  private extractTypeScriptInterfaces(content: string): InterfaceInfo[] {
    const interfaces: InterfaceInfo[] = [];
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const match = line.match(
        /^(?:export\s+)?(?:interface|type|class)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:extends\s+([^{=]+))?/,
      );
      if (!match) continue;
      interfaces.push({
        name: match[1],
        properties: [],
        extends: match[2] ? match[2].split(",").map((item) => item.trim()) : [],
        line: i + 1,
        isExported: line.startsWith("export"),
      });
    }
    return interfaces;
  }

  private extractCppInterfaces(content: string): InterfaceInfo[] {
    const interfaces: InterfaceInfo[] = [];
    const lines = content.split("\n");
    let currentNamespace = "";
    const namespaceStack: { name: string; depth: number }[] = [];
    let braceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const line = rawLine.trim();

      const namespaceMatch = line.match(/^namespace\s+([a-zA-Z_][a-zA-Z0-9_:]*)\s*{?/);
      if (namespaceMatch) {
        const name = currentNamespace
          ? `${currentNamespace}::${namespaceMatch[1]}`
          : namespaceMatch[1];
        namespaceStack.push({ name, depth: braceDepth + (line.includes("{") ? 1 : 0) });
        currentNamespace = name;
      }

      const priorBraceDepth = braceDepth;
      braceDepth += (rawLine.match(/{/g) || []).length - (rawLine.match(/}/g) || []).length;
      while (namespaceStack.length && braceDepth < namespaceStack[namespaceStack.length - 1].depth) {
        namespaceStack.pop();
      }
      currentNamespace = namespaceStack[namespaceStack.length - 1]?.name || "";

      const declaration = line.match(
        /^(?:export\s+)?(?:template\s*<[^>]+>\s*)?(class|struct|enum\s+class|enum\s+struct|enum|concept)\s+([a-zA-Z_][a-zA-Z0-9_:]*)\s*(?::\s*(?:public|protected|private)?\s*([^{]+))?/,
      );
      if (declaration) {
        const name = declaration[2].includes("::")
          ? declaration[2]
          : currentNamespace
            ? `${currentNamespace}::${declaration[2]}`
            : declaration[2];
        interfaces.push({
          name,
          properties: [],
          extends: declaration[3]
            ? declaration[3].split(",").map((item) => item.trim().replace(/^(public|protected|private)\s+/, ""))
            : [],
          line: i + 1,
          isExported: true,
        });
        continue;
      }

      const typedef = line.match(/^(?:typedef\s+.+\s+|using\s+)([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:=|;)/);
      if (typedef) {
        interfaces.push({
          name: currentNamespace ? `${currentNamespace}::${typedef[1]}` : typedef[1],
          properties: [],
          extends: [],
          line: i + 1,
          isExported: true,
        });
        continue;
      }

      if (priorBraceDepth === namespaceStack.length && !line.startsWith("#")) {
        const fn = line.match(
          /^(?:(?:static|inline|constexpr|extern|virtual|explicit|friend|export)\s+)*[a-zA-Z_][\w:<>,\s*&]*\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^;{}]*\)\s*(?:const\s*)?(?:noexcept\s*)?(?:->[^;{}]+)?\s*[{;]/,
        );
        if (fn && !/^(if|for|while|switch|return)$/.test(fn[1])) {
          interfaces.push({
            name: currentNamespace ? `${currentNamespace}::${fn[1]}` : fn[1],
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

  private extractCSharpInterfaces(content: string): InterfaceInfo[] {
    return this.extractByPattern(
      content,
      /^(?:public\s+|internal\s+)?(?:abstract\s+|sealed\s+)?(?:interface|class)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?::\s+([^{]+))?/,
    );
  }

  private extractGoInterfaces(content: string): InterfaceInfo[] {
    return this.extractByPattern(
      content,
      /^type\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+(?:interface|struct)\s*{?/,
    );
  }

  private extractJvmInterfaces(content: string): InterfaceInfo[] {
    return this.extractByPattern(
      content,
      /^(?:public\s+)?(?:abstract\s+)?(?:interface|class|data\s+class)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:extends\s+([^{]+))?/,
    );
  }

  private extractQmlTypes(content: string): InterfaceInfo[] {
    const interfaces: InterfaceInfo[] = [];
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      if (!/^[A-Z]/.test(rawLine)) continue;
      const match = rawLine.trim().match(/^([A-Z][a-zA-Z0-9_]*)\s*{/);
      if (match) {
        interfaces.push({
          name: match[1],
          properties: [],
          extends: [],
          line: i + 1,
          isExported: true,
        });
      }
    }
    return interfaces;
  }

  private extractByPattern(content: string, pattern: RegExp): InterfaceInfo[] {
    const interfaces: InterfaceInfo[] = [];
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].trim().match(pattern);
      if (!match) continue;
      interfaces.push({
        name: match[1],
        properties: [],
        extends: match[2] ? match[2].split(",").map((item) => item.trim()) : [],
        line: i + 1,
        isExported: true,
      });
    }
    return interfaces;
  }

  private parseImportSpecifiers(specifiers: string): string[] {
    return specifiers.split(",").map((specifier) => specifier.trim().replace(/[{}]/g, ""));
  }

  private determineExportType(line: string): ExportInfo["type"] {
    if (line.includes("function")) return "function";
    if (line.includes("class")) return "class";
    if (line.includes("interface")) return "interface";
    if (line.includes("type")) return "type";
    return "const";
  }
}
