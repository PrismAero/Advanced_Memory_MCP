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

export class CppTreeSitterExtractor implements LanguageInterfaceExtractor {
  readonly languages = ["c", "cpp"];

  supports(language: string): boolean {
    return this.languages.includes(language);
  }

  async extract(
    content: string,
    context: InterfaceExtractionContext,
  ): Promise<InterfaceExtractionResult> {
    const processed = await processWithTreeSitter(content, context.language);
    const diagnostics =
      processed?.diagnostics?.map(
        (diag) => `${diag.severity}: ${diag.message}`,
      ) || [];

    const lines = content.split("\n");
    const interfaces: NormalizedCodeInterface[] = [
      ...this.extractMacros(content, context, lines),
      ...this.extractDeclarations(content, context, lines),
      ...this.extractFunctions(content, context, lines),
    ];

    return {
      interfaces: dedupeInterfaces(interfaces),
      diagnostics,
      parser: processed ? "tree-sitter" : "fallback",
    };
  }

  private extractMacros(
    content: string,
    context: InterfaceExtractionContext,
    lines: string[],
  ): NormalizedCodeInterface[] {
    const results: NormalizedCodeInterface[] = [];
    const activeConditions: string[] = [];

    for (let index = 0; index < lines.length; index++) {
      const raw = lines[index];
      const line = raw.trim();
      const condition = line.match(/^#\s*(if|ifdef|ifndef)\s+(.+)/);
      if (condition) {
        activeConditions.push(`${condition[1]} ${condition[2].trim()}`);
        continue;
      }
      if (/^#\s*(endif|else|elif)\b/.test(line)) {
        if (/^#\s*endif\b/.test(line)) activeConditions.pop();
        continue;
      }

      const macro = line.match(
        /^#\s*define\s+([A-Za-z_][A-Za-z0-9_]*)(?:\(([^)]*)\))?\s*(.*)$/,
      );
      if (!macro) continue;

      const [, name, params, replacement] = macro;
      const signature =
        params === undefined
          ? `#define ${name}${replacement ? ` ${replacement}` : ""}`
          : `#define ${name}(${params})${replacement ? ` ${replacement}` : ""}`;
      results.push(
        makeInterface({
          name,
          kind: "macro",
          language: context.language,
          relativePath: context.relativePath,
          line: index + 1,
          signature,
          definition: raw.trim(),
          documentation: precedingDocumentation(lines, index),
          macroParameters: params ? splitCsv(params) : [],
          macroReplacement: replacement?.trim() || "",
          attributes: activeConditions.length ? [...activeConditions] : [],
          isExported: true,
        }),
      );
    }

    return results;
  }

  private extractDeclarations(
    content: string,
    context: InterfaceExtractionContext,
    lines: string[],
  ): NormalizedCodeInterface[] {
    const results: NormalizedCodeInterface[] = [];
    const namespaceStack: { name: string; depth: number }[] = [];
    let braceDepth = 0;

    for (let index = 0; index < lines.length; index++) {
      const raw = lines[index];
      const line = raw.trim();
      const currentNamespace = namespaceStack
        .map((entry) => entry.name)
        .join("::");

      const namespace = line.match(
        /^namespace\s+([A-Za-z_][A-Za-z0-9_]*)\s*{?/,
      );
      if (namespace) {
        namespaceStack.push({
          name: namespace[1],
          depth: braceDepth + (line.includes("{") ? 1 : 0),
        });
      }

      const template = line.match(/^template\s*<([^>]+)>/);
      const cTypedefCompound = line.match(
        /^typedef\s+(struct|enum)\s+([A-Za-z_][A-Za-z0-9_]*)\b/,
      );
      if (cTypedefCompound) {
        const kind = cTypedefCompound[1] === "struct" ? "struct" : "enum";
        const name = cTypedefCompound[2];
        results.push(
          makeInterface({
            name,
            namespace: currentNamespace || undefined,
            kind,
            language: context.language,
            relativePath: context.relativePath,
            line: index + 1,
            signature: line.replace(/\s*\{.*$/, ""),
            definition: this.collectDeclarationSnippet(lines, index),
            documentation: precedingDocumentation(lines, index),
          }),
        );
      }

      const declaration = line.match(
        /^(?:export\s+)?(?:template\s*<[^>]+>\s*)?(class|struct|enum\s+class|enum\s+struct|enum|concept)\s+([A-Za-z_][A-Za-z0-9_:]*)\s*(?::\s*([^{;]+))?/,
      );
      if (declaration) {
        const kindText = declaration[1];
        const name = declaration[2].split("::").pop() || declaration[2];
        const kind = kindText.includes("enum")
          ? "enum"
          : kindText === "concept"
            ? "concept"
            : kindText === "struct"
              ? "struct"
              : "class";
        const extendsList = splitCsv(declaration[3])
          .map((item) =>
            item.replace(/\b(public|protected|private|virtual)\b/g, "").trim(),
          )
          .filter(Boolean);
        results.push(
          makeInterface({
            name,
            qualifiedName: declaration[2].includes("::")
              ? declaration[2]
              : currentNamespace
                ? `${currentNamespace}::${name}`
                : name,
            namespace: currentNamespace || undefined,
            kind,
            language: context.language,
            relativePath: context.relativePath,
            line: index + 1,
            signature: line.replace(/\s*\{.*$/, "").trim(),
            definition: this.collectDeclarationSnippet(lines, index),
            documentation: precedingDocumentation(lines, index),
            extends: extendsList,
            templateParameters: template ? splitCsv(template[1]) : [],
            relationships: extendsList.map((target) => ({
              type: "extends",
              target,
              confidence: 0.9,
            })),
            members: this.extractMembers(lines, index),
          }),
        );
      }

      const alias = line.match(
        /^(?:typedef\s+(.+?)\s+([A-Za-z_][A-Za-z0-9_]*)|using\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+));/,
      );
      if (alias) {
        const name = alias[2] || alias[3];
        const target = alias[1] || alias[4];
        results.push(
          makeInterface({
            name,
            namespace: currentNamespace || undefined,
            kind: alias[2] ? "typedef" : "using",
            language: context.language,
            relativePath: context.relativePath,
            line: index + 1,
            signature: line,
            definition: line,
            documentation: precedingDocumentation(lines, index),
            relationships: target
              ? [{ type: "uses", target: target.trim(), confidence: 0.75 }]
              : [],
          }),
        );
      }

      braceDepth +=
        (raw.match(/{/g) || []).length - (raw.match(/}/g) || []).length;
      while (
        namespaceStack.length &&
        braceDepth < namespaceStack[namespaceStack.length - 1].depth
      ) {
        namespaceStack.pop();
      }
    }

    return results;
  }

  private extractFunctions(
    content: string,
    context: InterfaceExtractionContext,
    lines: string[],
  ): NormalizedCodeInterface[] {
    const results: NormalizedCodeInterface[] = [];
    const functionPattern =
      /(^|\n)\s*(?:(?:static|inline|constexpr|extern|virtual|explicit|friend|export)\s+)*([A-Za-z_~][\w:<>,\s*&]+?)\s+([A-Za-z_~][A-Za-z0-9_:~]*)\s*\(([^;{}()]*)\)\s*(?:const\s*)?(?:noexcept\s*)?(?:->\s*([^;{}]+))?\s*(?:[;{])/g;

    let match: RegExpExecArray | null;
    while ((match = functionPattern.exec(content)) !== null) {
      const returnType = match[2].trim();
      const fullName = match[3].trim();
      const name = fullName.split("::").pop() || fullName;
      if (/^(if|for|while|switch|return|catch)$/.test(name)) continue;
      const line = lineOf(content, match.index + match[1].length);
      results.push(
        makeInterface({
          name,
          qualifiedName: fullName,
          kind: name.startsWith("~") ? "destructor" : "function",
          language: context.language,
          relativePath: context.relativePath,
          line,
          signature: `${returnType} ${fullName}(${match[4].trim()})`,
          definition: lines[line - 1]?.trim() || fullName,
          documentation: precedingDocumentation(lines, line - 1),
          parameters: splitCsv(match[4]).map((param) => ({ name: param })),
          returnType: match[5]?.trim() || returnType,
        }),
      );
    }

    return results;
  }

  private extractMembers(
    lines: string[],
    startIndex: number,
  ): NormalizedCodeInterface["members"] {
    const members: NonNullable<NormalizedCodeInterface["members"]> = [];
    let depth = 0;
    let visibility: "public" | "protected" | "private" = "private";
    for (
      let i = startIndex;
      i < Math.min(lines.length, startIndex + 250);
      i++
    ) {
      const raw = lines[i];
      const line = raw.trim();
      depth += (raw.match(/{/g) || []).length - (raw.match(/}/g) || []).length;
      if (i > startIndex && depth <= 0) break;
      const access = line.match(/^(public|protected|private):$/);
      if (access) {
        visibility = access[1] as typeof visibility;
        continue;
      }
      const method = line.match(
        /^(?:virtual\s+)?([A-Za-z_~][\w:<>,\s*&]+?)\s+([A-Za-z_~][A-Za-z0-9_~]*)\s*\(([^)]*)\)/,
      );
      if (method) {
        members.push({
          name: method[2],
          kind: "method",
          type: method[1].trim(),
          signature: line.replace(/\s*[;{].*$/, ""),
          visibility,
          line: i + 1,
        });
      }
    }
    return members.slice(0, 100);
  }

  private collectDeclarationSnippet(
    lines: string[],
    startIndex: number,
  ): string {
    const snippet: string[] = [];
    let depth = 0;
    for (let i = startIndex; i < Math.min(lines.length, startIndex + 80); i++) {
      const raw = lines[i];
      snippet.push(raw);
      depth += (raw.match(/{/g) || []).length - (raw.match(/}/g) || []).length;
      if (snippet.length > 1 && depth <= 0) break;
      if (!raw.includes("{") && raw.includes(";")) break;
    }
    return snippet.join("\n").slice(0, 4_000);
  }
}
