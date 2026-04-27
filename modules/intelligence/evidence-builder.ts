import type { Entity, KnowledgeGraph, Relation } from "../../memory-types.js";
import type { ProjectAnalysisOperations } from "../sqlite/project-analysis-operations.js";
import type {
  CodeInterfaceRecord,
  ProjectDependencyRecord,
  ProjectFileRecord,
} from "../sqlite/project-analysis-records.js";
import type { IntelligenceEvidence } from "./evidence-types.js";

export class IntelligenceEvidenceBuilder {
  constructor(private readonly projectAnalysisOps: ProjectAnalysisOperations) {}

  async buildForEntity(
    entity: Entity,
    graph: KnowledgeGraph,
    options: { query?: string; currentFile?: string; maxPerType?: number } = {},
  ): Promise<IntelligenceEvidence> {
    const max = clamp(options.maxPerType, 1, 20, 8);
    const queryText = options.query || "";
    const text = `${entity.name} ${entity.entityType} ${entity.observations.join(" ")} ${queryText}`;
    const terms = importantTerms(text);
    const directRelations = graph.relations
      .filter(
        (relation) =>
          relation.from === entity.name || relation.to === entity.name,
      )
      .slice(0, max);
    const relatedNames = new Set(
      directRelations.flatMap((relation) => [relation.from, relation.to]),
    );
    relatedNames.delete(entity.name);

    const decisions = graph.entities
      .filter(
        (candidate) =>
          candidate.entityType === "decision" &&
          (relatedNames.has(candidate.name) ||
            containsAny(candidate.observations.join(" "), terms)),
      )
      .slice(0, max);
    const blockers = graph.entities
      .filter(
        (candidate) =>
          (candidate.entityType === "blocker" ||
            candidate.observations.some((obs) =>
              /block|fail|risk|error/i.test(obs),
            )) &&
          (relatedNames.has(candidate.name) ||
            containsAny(candidate.observations.join(" "), terms)),
      )
      .slice(0, max);

    const [interfaces, files, dependencies] = await Promise.all([
      this.findInterfaces(terms, options.currentFile, max),
      this.findFiles(terms, max),
      this.findDependencies(terms, max),
    ]);

    return {
      entity,
      query: queryText,
      directRelations,
      decisions,
      blockers,
      nextSteps: extractNextSteps([entity, ...decisions, ...blockers], max),
      files,
      interfaces,
      dependencies,
      reasons: buildReasons(
        entity,
        directRelations,
        interfaces,
        files,
        dependencies,
      ),
    };
  }

  async buildProjectEvidence(options: {
    currentFile?: string;
    searchQuery?: string;
    activeInterfaces?: string[];
    maxPerType?: number;
  }): Promise<IntelligenceEvidence> {
    const max = clamp(options.maxPerType, 1, 20, 10);
    const terms = importantTerms(
      `${options.currentFile || ""} ${options.searchQuery || ""} ${(options.activeInterfaces || []).join(" ")}`,
    );
    const [interfaces, files, dependencies] = await Promise.all([
      this.findInterfaces(
        [...terms, ...(options.activeInterfaces || [])],
        options.currentFile,
        max,
      ),
      this.findFiles(terms, max),
      this.findDependencies(terms, max),
    ]);

    return {
      query: options.searchQuery,
      directRelations: [],
      decisions: [],
      blockers: [],
      nextSteps: [],
      files,
      interfaces,
      dependencies,
      reasons: buildReasons(undefined, [], interfaces, files, dependencies),
    };
  }

  private async findInterfaces(
    terms: string[],
    currentFile: string | undefined,
    max: number,
  ): Promise<CodeInterfaceRecord[]> {
    const out = new Map<number, CodeInterfaceRecord>();
    if (currentFile) {
      const rows = await this.projectAnalysisOps.getCodeInterfaces({
        filePath: currentFile,
        limit: max,
      });
      rows.forEach((row) => row.id && out.set(row.id, row));
    }
    for (const term of terms.slice(0, 5)) {
      const rows = await this.projectAnalysisOps.getCodeInterfaces({
        name: term,
        limit: max,
      });
      rows.forEach((row) => row.id && out.set(row.id, row));
      if (out.size >= max) break;
    }
    return Array.from(out.values()).slice(0, max);
  }

  private async findFiles(
    terms: string[],
    max: number,
  ): Promise<ProjectFileRecord[]> {
    const rows = await this.projectAnalysisOps.getProjectFiles({ limit: 100 });
    if (terms.length === 0) return rows.slice(0, max);
    return rows
      .filter((row) =>
        containsAny(
          `${row.relative_path} ${row.file_type} ${row.language}`,
          terms,
        ),
      )
      .slice(0, max);
  }

  private async findDependencies(
    terms: string[],
    max: number,
  ): Promise<ProjectDependencyRecord[]> {
    const rows = await this.projectAnalysisOps.getProjectDependencies({
      limit: 200,
    });
    if (terms.length === 0) return rows.slice(0, max);
    return rows
      .filter((row) =>
        containsAny(
          `${row.source_identifier} ${row.target_identifier || ""} ${row.external_package || ""}`,
          terms,
        ),
      )
      .slice(0, max);
  }
}

export function importantTerms(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(/[^A-Za-z0-9_./:-]+/)
        .map((term) => term.trim())
        .filter(
          (term) => term.length >= 4 && !STOP_WORDS.has(term.toLowerCase()),
        )
        .slice(0, 24),
    ),
  );
}

function containsAny(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term.toLowerCase()));
}

function extractNextSteps(
  entities: Entity[],
  max: number,
): IntelligenceEvidence["nextSteps"] {
  const out: IntelligenceEvidence["nextSteps"] = [];
  for (const entity of entities) {
    for (const obs of entity.observations || []) {
      if (!/\b(next|todo|action|follow.?up|must|need|fix|risk)\b/i.test(obs)) {
        continue;
      }
      out.push({
        source: entity.name,
        text: obs,
        priority: /urgent|critical|block|fail|risk/i.test(obs)
          ? "high"
          : "normal",
      });
      if (out.length >= max) return out;
    }
  }
  return out;
}

function buildReasons(
  entity: Entity | undefined,
  relations: Relation[],
  interfaces: CodeInterfaceRecord[],
  files: ProjectFileRecord[],
  dependencies: ProjectDependencyRecord[],
): string[] {
  const reasons: string[] = [];
  if (entity?.workingContext) reasons.push("working_context");
  if (relations.length) reasons.push(`relations:${relations.length}`);
  if (interfaces.length) reasons.push(`interfaces:${interfaces.length}`);
  if (files.length) reasons.push(`files:${files.length}`);
  if (dependencies.length) reasons.push(`deps:${dependencies.length}`);
  return reasons.slice(0, 6);
}

function clamp(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (!Number.isFinite(value) || !value) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

const STOP_WORDS = new Set([
  "with",
  "from",
  "that",
  "this",
  "have",
  "into",
  "only",
  "current",
  "status",
  "active",
]);
