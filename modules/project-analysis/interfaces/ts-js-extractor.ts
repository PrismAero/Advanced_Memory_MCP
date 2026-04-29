import type {
  InterfaceExtractionContext,
  InterfaceExtractionResult,
  LanguageInterfaceExtractor,
  NormalizedCodeInterface,
} from "./interface-types.js";
import {
  dedupeInterfaces,
  lineOf,
  makeInterface,
  precedingDocumentation,
  splitCsv,
} from "./extractor-utils.js";
import { processWithTreeSitter } from "./tree-sitter-service.js";

export class TsJsTreeSitterExtractor implements LanguageInterfaceExtractor {
  readonly languages = ["typescript", "javascript"];

  supports(language: string): boolean {
    return this.languages.includes(language);
  }

  async extract(
    content: string,
    context: InterfaceExtractionContext,
  ): Promise<InterfaceExtractionResult> {
    const parserLanguage = context.extension === ".tsx" ? "tsx" : context.language;
    const processed = await processWithTreeSitter(content, parserLanguage);
    const diagnostics =
      processed?.diagnostics?.map((diag) => `${diag.severity}: ${diag.message}`) || [];
    const lines = content.split("\n");
    const interfaces: NormalizedCodeInterface[] = [
      ...this.extractTypeScriptContracts(content, context, lines),
      ...this.extractClassesAndFunctions(content, context, lines),
      ...this.extractJsDocContracts(content, context, lines),
    ];
    return {
      interfaces: dedupeInterfaces(interfaces),
      diagnostics,
      parser: processed ? "tree-sitter" : "fallback",
    };
  }

  private extractTypeScriptContracts(
    content: string,
    context: InterfaceExtractionContext,
    lines: string[],
  ): NormalizedCodeInterface[] {
    const results: NormalizedCodeInterface[] = [];
    const interfacePattern =
      /(?:^|\n)\s*(export\s+)?(?:declare\s+)?(interface|type)\s+([A-Za-z_$][\w$]*)(?:<([^>{=]+)>)?\s*(?:extends\s+([^{=]+))?\s*(?:=\s*)?({[\s\S]*?}\s*;?)/g;

    let match: RegExpExecArray | null;
    while ((match = interfacePattern.exec(content)) !== null) {
      const kind = match[2] === "type" ? "type" : "interface";
      const name = match[3];
      const line = lineOf(content, match.index + 1);
      const body = match[6];
      const properties = this.extractProperties(body);
      results.push(
        makeInterface({
          name,
          kind,
          language: context.language,
          relativePath: context.relativePath,
          line,
          signature: `${match[2]} ${name}${match[4] ? `<${match[4]}>` : ""}`,
          definition: match[0].trim().slice(0, 4_000),
          documentation: precedingDocumentation(lines, line - 1),
          isExported: Boolean(match[1]),
          properties: properties.map((property) => property.name),
          members: properties,
          extends: splitCsv(match[5]),
          templateParameters: splitCsv(match[4]),
          relationships: splitCsv(match[5]).map((target) => ({
            type: "extends",
            target,
            confidence: 0.9,
          })),
        }),
      );
    }
    return results;
  }

  private extractClassesAndFunctions(
    content: string,
    context: InterfaceExtractionContext,
    lines: string[],
  ): NormalizedCodeInterface[] {
    const results: NormalizedCodeInterface[] = [];
    const classPattern =
      /(?:^|\n)\s*(export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)(?:<([^>{]+)>)?(?:\s+extends\s+([A-Za-z_$][\w$.]*))?(?:\s+implements\s+([^{]+))?\s*{/g;
    let match: RegExpExecArray | null;
    while ((match = classPattern.exec(content)) !== null) {
      const name = match[2];
      const line = lineOf(content, match.index + 1);
      const relationships = [
        ...splitCsv(match[4]).map((target) => ({
          type: "extends" as const,
          target,
          confidence: 0.9,
        })),
        ...splitCsv(match[5]).map((target) => ({
          type: "implements" as const,
          target,
          confidence: 0.9,
        })),
      ];
      results.push(
        makeInterface({
          name,
          kind: "class",
          language: context.language,
          relativePath: context.relativePath,
          line,
          signature: lines[line - 1]?.trim(),
          definition: this.collectBlock(lines, line - 1),
          documentation: precedingDocumentation(lines, line - 1),
          isExported: Boolean(match[1]),
          extends: [...splitCsv(match[4]), ...splitCsv(match[5])],
          templateParameters: splitCsv(match[3]),
          relationships,
          members: this.extractClassMembers(lines, line - 1),
        }),
      );
    }

    const functionPattern =
      /(?:^|\n)\s*(export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*(?:<([^>{]+)>)?\s*\(([^)]*)\)\s*(?::\s*([^{]+))?\s*{/g;
    while ((match = functionPattern.exec(content)) !== null) {
      const name = match[2];
      const line = lineOf(content, match.index + 1);
      results.push(
        makeInterface({
          name,
          kind: "function",
          language: context.language,
          relativePath: context.relativePath,
          line,
          signature: lines[line - 1]?.trim(),
          definition: lines[line - 1]?.trim(),
          documentation: precedingDocumentation(lines, line - 1),
          isExported: Boolean(match[1]),
          parameters: splitCsv(match[4]).map((param) => parseTsParameter(param)),
          returnType: match[5]?.trim(),
          templateParameters: splitCsv(match[3]),
        }),
      );
    }

    return results;
  }

  private extractJsDocContracts(
    content: string,
    context: InterfaceExtractionContext,
    lines: string[],
  ): NormalizedCodeInterface[] {
    const results: NormalizedCodeInterface[] = [];
    const typedefPattern =
      /\/\*\*([\s\S]*?)\*\/\s*(?:export\s+)?(?:const|let|var|function|class)?\s*([A-Za-z_$][\w$]*)?/g;
    let match: RegExpExecArray | null;
    while ((match = typedefPattern.exec(content)) !== null) {
      const doc = match[1];
      const typedef = doc.match(/@typedef\s+(?:{([^}]+)}\s*)?([A-Za-z_$][\w$]*)/);
      const callback = doc.match(/@callback\s+([A-Za-z_$][\w$]*)/);
      const name = typedef?.[2] || callback?.[1];
      if (!name) continue;
      const line = lineOf(content, match.index);
      results.push(
        makeInterface({
          name,
          kind: typedef ? "type" : "function",
          language: context.language,
          relativePath: context.relativePath,
          line,
          signature: typedef ? `@typedef ${name}` : `@callback ${name}`,
          definition: match[0].slice(0, 4_000),
          documentation: doc.replace(/^\s*\*\s?/gm, "").trim(),
          properties: [...doc.matchAll(/@property\s+{([^}]+)}\s+([\w.$]+)/g)].map(
            (property) => property[2],
          ),
          members: [...doc.matchAll(/@property\s+{([^}]+)}\s+([\w.$]+)/g)].map((property) => ({
            name: property[2],
            kind: "property",
            type: property[1],
          })),
          returnType: doc.match(/@returns?\s+{([^}]+)}/)?.[1],
        }),
      );
    }
    return results;
  }

  private extractProperties(body: string): NonNullable<NormalizedCodeInterface["members"]> {
    const clean = body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const members: NonNullable<NormalizedCodeInterface["members"]> = [];
    const propertyPattern = /(?:readonly\s+)?([A-Za-z_$][\w$]*)\??\s*:\s*([^;,\n}]+)/g;
    let match: RegExpExecArray | null;
    while ((match = propertyPattern.exec(clean)) !== null) {
      members.push({
        name: match[1],
        kind: "property",
        type: match[2].trim(),
        isOptional: clean.slice(Math.max(0, match.index - 20), match.index + 40).includes("?"),
        isReadonly: clean.slice(Math.max(0, match.index - 20), match.index).includes("readonly"),
      });
    }
    const methodPattern = /([A-Za-z_$][\w$]*)\??\s*\(([^)]*)\)\s*:\s*([^;,\n}]+)/g;
    while ((match = methodPattern.exec(clean)) !== null) {
      members.push({
        name: match[1],
        kind: "method",
        type: match[3].trim(),
        signature: `${match[1]}(${match[2]}): ${match[3].trim()}`,
      });
    }
    return members.slice(0, 100);
  }

  private extractClassMembers(
    lines: string[],
    startIndex: number,
  ): NonNullable<NormalizedCodeInterface["members"]> {
    const members: NonNullable<NormalizedCodeInterface["members"]> = [];
    let depth = 0;
    for (let i = startIndex; i < Math.min(lines.length, startIndex + 250); i++) {
      const raw = lines[i];
      const line = raw.trim();
      depth += (raw.match(/{/g) || []).length - (raw.match(/}/g) || []).length;
      if (i > startIndex && depth <= 0) break;
      const method = line.match(
        /^(public\s+|private\s+|protected\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*(?::\s*([^{;]+))?/,
      );
      if (method) {
        members.push({
          name: method[2],
          kind: "method",
          signature: line.replace(/\s*[{;].*$/, ""),
          type: method[4]?.trim(),
          visibility: method[1]?.trim() as any,
          line: i + 1,
        });
      }
    }
    return members.slice(0, 100);
  }

  private collectBlock(lines: string[], startIndex: number): string {
    const block: string[] = [];
    let depth = 0;
    for (let i = startIndex; i < Math.min(lines.length, startIndex + 80); i++) {
      const raw = lines[i];
      block.push(raw);
      depth += (raw.match(/{/g) || []).length - (raw.match(/}/g) || []).length;
      if (block.length > 1 && depth <= 0) break;
    }
    return block.join("\n").slice(0, 4_000);
  }
}

function parseTsParameter(param: string): {
  name: string;
  type?: string;
  defaultValue?: string;
} {
  const [withoutDefault, defaultValue] = param.split("=").map((part) => part.trim());
  const [name, type] = withoutDefault.split(":").map((part) => part.trim());
  return { name, type, defaultValue };
}
