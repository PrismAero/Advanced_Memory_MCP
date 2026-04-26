import type {
  InterfaceExtractionContext,
  InterfaceExtractionResult,
  LanguageInterfaceExtractor,
  NormalizedCodeInterface,
} from "./interface-types.js";
import {
  dedupeInterfaces,
  makeInterface,
  precedingDocumentation,
  splitCsv,
} from "./extractor-utils.js";
import { processWithTreeSitter } from "./tree-sitter-service.js";

export class PythonTreeSitterExtractor implements LanguageInterfaceExtractor {
  readonly languages = ["python"];

  supports(language: string): boolean {
    return this.languages.includes(language);
  }

  async extract(
    content: string,
    context: InterfaceExtractionContext,
  ): Promise<InterfaceExtractionResult> {
    const processed = await processWithTreeSitter(content, "python");
    const diagnostics =
      processed?.diagnostics?.map((diag) => `${diag.severity}: ${diag.message}`) || [];
    const lines = content.split("\n");
    const interfaces: NormalizedCodeInterface[] = [];
    const classStack: { name: string; indent: number }[] = [];
    const decorators: string[] = [];

    for (let index = 0; index < lines.length; index++) {
      const raw = lines[index];
      const line = raw.trim();
      if (!line) continue;
      const indent = raw.length - raw.trimStart().length;
      while (classStack.length && indent <= classStack[classStack.length - 1].indent) {
        classStack.pop();
      }

      if (line.startsWith("@")) {
        decorators.push(line);
        continue;
      }

      const classMatch = line.match(/^class\s+([A-Za-z_][A-Za-z0-9_]*)(?:\(([^)]*)\))?:/);
      if (classMatch) {
        const name = classMatch[1];
        const moduleName = moduleNameFromPath(context.relativePath);
        const doc = this.extractDocstring(lines, index) || precedingDocumentation(lines, index);
        interfaces.push(
          makeInterface({
            name,
            qualifiedName: `${moduleName}.${name}`,
            namespace: moduleName,
            kind: "class",
            language: "python",
            relativePath: context.relativePath,
            line: index + 1,
            signature: line,
            definition: this.collectBlock(lines, index),
            documentation: doc,
            extends: splitCsv(classMatch[2]),
            attributes: [...decorators],
            members: this.extractClassMembers(lines, index, indent),
            relationships: splitCsv(classMatch[2]).map((target) => ({
              type: "extends",
              target,
              confidence: 0.9,
            })),
          }),
        );
        classStack.push({ name, indent });
        decorators.length = 0;
        continue;
      }

      const fnMatch = line.match(/^(async\s+def|def)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*(?:->\s*([^:]+))?:/);
      if (fnMatch) {
        const isAsync = fnMatch[1].startsWith("async");
        const name = fnMatch[2];
        const container = classStack[classStack.length - 1]?.name;
        const moduleName = moduleNameFromPath(context.relativePath);
        const qualifiedName = container
          ? `${moduleName}.${container}.${name}`
          : `${moduleName}.${name}`;
        interfaces.push(
          makeInterface({
            name,
            qualifiedName,
            namespace: container ? `${moduleName}.${container}` : moduleName,
            containerName: container,
            kind: container ? "method" : "function",
            language: "python",
            relativePath: context.relativePath,
            line: index + 1,
            signature: line,
            definition: this.collectBlock(lines, index),
            documentation: this.extractDocstring(lines, index) || precedingDocumentation(lines, index),
            parameters: splitCsv(fnMatch[3]).map((param) => parsePythonParameter(param)),
            returnType: fnMatch[4]?.trim(),
            attributes: [...decorators],
            modifiers: isAsync ? ["async"] : [],
          }),
        );
        decorators.length = 0;
        continue;
      }

      decorators.length = 0;
    }

    return {
      interfaces: dedupeInterfaces(interfaces),
      diagnostics,
      parser: processed ? "tree-sitter" : "fallback",
    };
  }

  private extractClassMembers(
    lines: string[],
    startIndex: number,
    classIndent: number,
  ): NonNullable<NormalizedCodeInterface["members"]> {
    const members: NonNullable<NormalizedCodeInterface["members"]> = [];
    for (let i = startIndex + 1; i < Math.min(lines.length, startIndex + 250); i++) {
      const raw = lines[i];
      const line = raw.trim();
      if (!line) continue;
      const indent = raw.length - raw.trimStart().length;
      if (indent <= classIndent) break;
      const method = line.match(/^(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*(?:->\s*([^:]+))?:/);
      if (method) {
        members.push({
          name: method[1],
          kind: "method",
          signature: line,
          type: method[3]?.trim(),
          visibility: method[1].startsWith("_") ? "private" : "public",
          line: i + 1,
        });
      }
    }
    return members.slice(0, 100);
  }

  private collectBlock(lines: string[], startIndex: number): string {
    const startIndent = lines[startIndex].length - lines[startIndex].trimStart().length;
    const block = [lines[startIndex]];
    for (let i = startIndex + 1; i < Math.min(lines.length, startIndex + 80); i++) {
      const raw = lines[i];
      if (raw.trim() && raw.length - raw.trimStart().length <= startIndent) break;
      block.push(raw);
    }
    return block.join("\n").slice(0, 4_000);
  }

  private extractDocstring(lines: string[], declarationLine: number): string | undefined {
    for (let i = declarationLine + 1; i < Math.min(lines.length, declarationLine + 6); i++) {
      const line = lines[i].trim();
      const single = line.match(/^([ruRUbfBF]*)(['"]{3})([\s\S]*?)(\2)/);
      if (single) return single[3].trim();
      if (/^[ruRUbfBF]*['"]{3}/.test(line)) {
        const quote = line.includes('"""') ? '"""' : "'''";
        const docs = [line.replace(/^[ruRUbfBF]*['"]{3}/, "")];
        for (let j = i + 1; j < Math.min(lines.length, i + 40); j++) {
          const docLine = lines[j];
          if (docLine.includes(quote)) {
            docs.push(docLine.replace(quote, ""));
            return docs.join("\n").trim();
          }
          docs.push(docLine);
        }
      }
      if (line) break;
    }
    return undefined;
  }
}

function moduleNameFromPath(relativePath: string): string {
  return relativePath
    .replace(/\\/g, "/")
    .replace(/\.[^.]+$/, "")
    .split("/")
    .filter((part) => part && part !== "__init__")
    .join(".");
}

function parsePythonParameter(param: string): { name: string; type?: string; defaultValue?: string } {
  const [withoutDefault, defaultValue] = param.split("=").map((part) => part.trim());
  const [name, type] = withoutDefault.split(":").map((part) => part.trim());
  return { name, type, defaultValue };
}
