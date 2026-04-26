import { createHash } from "crypto";
import type {
  CodeInterfaceKind,
  NormalizedCodeInterface,
} from "./interface-types.js";

export function lineOf(content: string, index: number): number {
  if (index <= 0) return 1;
  return content.slice(0, index).split("\n").length;
}

export function lineSlice(content: string, startLine: number, endLine: number): string {
  const lines = content.split("\n");
  return lines.slice(Math.max(0, startLine - 1), Math.max(startLine, endLine)).join("\n");
}

export function precedingDocumentation(lines: string[], zeroBasedLine: number): string | undefined {
  const docs: string[] = [];
  for (let i = zeroBasedLine - 1; i >= 0; i--) {
    const line = lines[i]?.trim() || "";
    if (!line) {
      if (docs.length > 0) break;
      continue;
    }
    if (
      line.startsWith("///") ||
      line.startsWith("//!") ||
      line.startsWith("//") ||
      line.startsWith("*") ||
      line.startsWith("/**") ||
      line.startsWith("/*") ||
      line.startsWith("#") ||
      line.startsWith('"""') ||
      line.startsWith("'''")
    ) {
      docs.unshift(cleanDocLine(line));
      continue;
    }
    break;
  }
  const text = docs.join("\n").trim();
  return text || undefined;
}

export function cleanDocLine(line: string): string {
  return line
    .replace(/^\/\*\*?/, "")
    .replace(/\*\/$/, "")
    .replace(/^\s*\*\s?/, "")
    .replace(/^\/\/\/?<?!?\s?/, "")
    .replace(/^#\s?/, "")
    .replace(/^['"]{3}/, "")
    .replace(/['"]{3}$/, "")
    .trim();
}

export function splitCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function stableHash(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}

export function buildStableId(
  language: string,
  relativePath: string,
  qualifiedName: string,
  kind: string,
): string {
  return `${language}:${relativePath}:${kind}:${qualifiedName}`;
}

export function makeInterface(
  input: {
    name: string;
    kind: CodeInterfaceKind;
    language: string;
    relativePath: string;
    line: number;
    signature?: string;
    definition?: string;
    documentation?: string;
    namespace?: string;
    qualifiedName?: string;
    endLine?: number;
    isExported?: boolean;
    properties?: string[];
    extends?: string[];
    members?: NormalizedCodeInterface["members"];
    parameters?: NormalizedCodeInterface["parameters"];
    returnType?: string;
    templateParameters?: string[];
    attributes?: string[];
    modifiers?: string[];
    macroParameters?: string[];
    macroReplacement?: string;
    relationships?: NormalizedCodeInterface["relationships"];
    containerName?: string;
    visibility?: NormalizedCodeInterface["visibility"];
  },
): NormalizedCodeInterface {
  const qualifiedName = input.qualifiedName || qualify(input.namespace, input.name);
  const signature = input.signature || input.definition || `${input.kind} ${qualifiedName}`;
  const definition = input.definition || signature;
  const summary = summarize(input.documentation, signature);
  const stableId = buildStableId(
    input.language,
    input.relativePath,
    qualifiedName,
    input.kind,
  );
  return {
    name: input.name,
    properties: input.properties || [],
    extends: input.extends || [],
    line: input.line,
    isExported: input.isExported ?? true,
    qualifiedName,
    namespace: input.namespace,
    language: input.language,
    kind: input.kind,
    signature,
    definition,
    documentation: input.documentation,
    startLine: input.line,
    endLine: input.endLine || input.line,
    containerName: input.containerName,
    stableId,
    bodyHash: stableHash(definition),
    parameters: input.parameters || [],
    returnType: input.returnType,
    members: input.members || [],
    templateParameters: input.templateParameters || [],
    attributes: input.attributes || [],
    modifiers: input.modifiers || [],
    macroParameters: input.macroParameters,
    macroReplacement: input.macroReplacement,
    relationships: input.relationships || [],
    summary,
    rankText: [
      qualifiedName,
      input.kind,
      signature,
      summary,
      input.documentation,
      input.members?.map((member) => member.name).join(" "),
    ]
      .filter(Boolean)
      .join("\n"),
    sourceHash: stableHash(`${input.relativePath}:${input.line}:${definition}`),
    visibility: input.visibility,
  };
}

export function qualify(namespace: string | undefined, name: string): string {
  return namespace ? `${namespace}::${name}` : name;
}

export function summarize(doc: string | undefined, fallback: string): string {
  const text = (doc || fallback).replace(/\s+/g, " ").trim();
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

export function dedupeInterfaces<T extends NormalizedCodeInterface>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key =
      item.stableId ||
      `${item.language || ""}:${item.qualifiedName || item.name}:${item.kind || ""}:${item.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
