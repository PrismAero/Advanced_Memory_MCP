import type { Entity, Relation } from "../../memory-types.js";
import type {
  CodeInterfaceRecord,
  ProjectDependencyRecord,
  ProjectFileRecord,
} from "../sqlite/project-analysis-records.js";

export interface IntelligenceEvidence {
  entity?: Entity;
  query?: string;
  directRelations: Relation[];
  decisions: Entity[];
  blockers: Entity[];
  nextSteps: Array<{ source: string; text: string; priority: "normal" | "high" }>;
  files: ProjectFileRecord[];
  interfaces: CodeInterfaceRecord[];
  dependencies: ProjectDependencyRecord[];
  reasons: string[];
}

export interface ScoredEvidence {
  score: number;
  kind:
    | "entity"
    | "relation"
    | "decision"
    | "blocker"
    | "next"
    | "file"
    | "interface"
    | "dependency";
  name: string;
  why: string;
  ref?: string;
  data?: unknown;
}

export interface CompactContextEntity {
  name: string;
  type: string;
  status?: string;
  score: {
    rel: number;
    work: boolean;
    evidence?: number;
  };
  obs: string[];
  why?: string[];
  more_obs?: number;
}
