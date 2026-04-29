import type { InterfaceInfo } from "../project-types.js";

export type CodeInterfaceKind =
  | "interface"
  | "type"
  | "class"
  | "struct"
  | "enum"
  | "concept"
  | "function"
  | "method"
  | "constructor"
  | "destructor"
  | "typedef"
  | "using"
  | "macro"
  | "module"
  | "variable"
  | "object";

export interface CodeInterfaceMember {
  name: string;
  kind: CodeInterfaceKind | "property" | "parameter" | "field";
  type?: string;
  signature?: string;
  visibility?: "public" | "protected" | "private" | "internal" | "package";
  isOptional?: boolean;
  isReadonly?: boolean;
  line?: number;
}

export interface CodeInterfaceParameter {
  name: string;
  type?: string;
  defaultValue?: string;
}

export interface CodeInterfaceRelationship {
  type:
    | "extends"
    | "implements"
    | "contains"
    | "uses"
    | "includes"
    | "overrides"
    | "declares"
    | "defines";
  target: string;
  confidence?: number;
}

export interface NormalizedCodeInterface extends InterfaceInfo {
  qualifiedName?: string;
  namespace?: string;
  language?: string;
  kind?: CodeInterfaceKind;
  signature?: string;
  definition?: string;
  documentation?: string;
  visibility?: "public" | "protected" | "private" | "internal" | "package";
  startLine?: number;
  endLine?: number;
  containerName?: string;
  stableId?: string;
  bodyHash?: string;
  parameters?: CodeInterfaceParameter[];
  returnType?: string;
  members?: CodeInterfaceMember[];
  templateParameters?: string[];
  attributes?: string[];
  modifiers?: string[];
  macroParameters?: string[];
  macroReplacement?: string;
  relationships?: CodeInterfaceRelationship[];
  summary?: string;
  rankText?: string;
  sourceHash?: string;
  diagnostics?: string[];
}

export interface InterfaceExtractionContext {
  language: string;
  filePath: string;
  relativePath: string;
  extension: string;
}

export interface InterfaceExtractionResult {
  interfaces: NormalizedCodeInterface[];
  diagnostics: string[];
  parser: "tree-sitter" | "fallback";
}

export interface LanguageInterfaceExtractor {
  readonly languages: string[];
  supports(language: string): boolean;
  extract(content: string, context: InterfaceExtractionContext): Promise<InterfaceExtractionResult>;
}
