export type KeywordType =
  | "term"
  | "phrase"
  | "symbol"
  | "path"
  | "code_interface"
  | "dependency"
  | "decision"
  | "status"
  | "error"
  | "branch"
  | "relation";

export type KeywordSourceType =
  | "entity_name"
  | "entity_type"
  | "entity_content"
  | "observation"
  | "relation"
  | "branch"
  | "project_file"
  | "code_interface";

export interface KeywordLink {
  linkedType:
    | "entity"
    | "observation"
    | "relation"
    | "branch"
    | "project_file"
    | "code_interface"
    | "keyword";
  linkedId?: string | number;
  relationType: string;
  weight: number;
  metadata?: Record<string, any>;
}

export interface KeywordSignal {
  keyword: string;
  normalizedKeyword: string;
  keywordType: KeywordType;
  sourceType: KeywordSourceType;
  sourceId?: string | number;
  observationId?: number;
  branchId?: number;
  weight: number;
  confidence: number;
  position?: number;
  phraseLength: number;
  context?: string;
  metadata?: Record<string, any>;
  links?: KeywordLink[];
}

export interface KeywordExtractionInput {
  text: string;
  sourceType: KeywordSourceType;
  sourceId?: string | number;
  observationId?: number;
  branchId?: number;
  context?: string;
  baseWeight?: number;
  metadata?: Record<string, any>;
}
