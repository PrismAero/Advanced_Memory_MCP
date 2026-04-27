import type { Entity, Relation } from "../../memory-types.js";
import { round } from "./context-scorer.js";
import type {
  CompactContextEntity,
  IntelligenceEvidence,
} from "./evidence-types.js";

export function compactEntityForContext(
  entity: Entity,
  options: {
    maxObservations: number;
    evidence?: IntelligenceEvidence;
    score?: number;
  },
): CompactContextEntity {
  const observations = Array.isArray(entity.observations)
    ? entity.observations
    : [];
  const shown =
    options.maxObservations > 0
      ? observations.slice(0, options.maxObservations)
      : observations;
  const out: CompactContextEntity = {
    name: entity.name,
    type: entity.entityType,
    status: entity.status,
    score: {
      rel: round(entity.relevanceScore ?? 0.5),
      work: Boolean(entity.workingContext),
      evidence: options.score,
    },
    obs: shown,
  };
  if (options.evidence?.reasons.length) out.why = options.evidence.reasons;
  if (options.maxObservations > 0 && observations.length > shown.length) {
    out.more_obs = observations.length - shown.length;
  }
  return out;
}

export function compactRelations(relations: Relation[], limit = 20): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const relation of relations) {
    const key = `${relation.from}\0${relation.relationType}\0${relation.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      from: relation.from,
      rel: relation.relationType,
      to: relation.to,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function compactEvidence(evidence: IntelligenceEvidence): any {
  return {
    files: evidence.files.slice(0, 8).map((file) => ({
      path: file.relative_path || file.file_path,
      lang: file.language,
      cat: file.category,
    })),
    interfaces: evidence.interfaces.slice(0, 8).map((iface) => ({
      name: iface.qualified_name || iface.name,
      kind: iface.kind || iface.interface_type,
      lang: iface.language,
      line: iface.start_line || iface.line_number,
    })),
    deps: evidence.dependencies.slice(0, 8).map((dep) => ({
      src: dep.source_identifier,
      tgt: dep.target_identifier || dep.external_package,
      type: dep.dependency_type,
      ok: dep.resolution_status,
    })),
  };
}
