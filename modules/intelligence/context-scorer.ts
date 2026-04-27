import type { Entity } from "../../memory-types.js";
import type { IntelligenceEvidence, ScoredEvidence } from "./evidence-types.js";

export class ContextScorer {
  scoreEntity(
    entity: Entity,
    query = "",
    evidence?: IntelligenceEvidence,
  ): number {
    let score = entity.relevanceScore ?? 0.5;
    if (entity.workingContext) score += 0.25;
    if (entity.entityType === "blocker") score += 0.2;
    if (entity.entityType === "decision") score += 0.15;
    if (entity.lastAccessed) {
      const ageHours =
        (Date.now() - new Date(entity.lastAccessed).getTime()) /
        (1000 * 60 * 60);
      if (ageHours < 24) score += 0.1;
      else if (ageHours < 24 * 7) score += 0.05;
    }

    const q = query.trim().toLowerCase();
    if (q) {
      const text =
        `${entity.name} ${entity.entityType} ${entity.observations.join(" ")}`.toLowerCase();
      if (text.includes(q)) score += 0.25;
      else {
        const terms = q.split(/\s+/).filter((term) => term.length > 2);
        const hits = terms.filter((term) => text.includes(term)).length;
        score += Math.min(0.2, hits * 0.05);
      }
    }

    if (evidence) {
      score += Math.min(0.2, evidence.directRelations.length * 0.03);
      score += Math.min(0.2, evidence.interfaces.length * 0.04);
      score += Math.min(0.15, evidence.files.length * 0.03);
      score += Math.min(0.15, evidence.dependencies.length * 0.03);
      score += Math.min(0.15, evidence.decisions.length * 0.04);
      score += Math.min(0.2, evidence.blockers.length * 0.08);
    }

    return round(Math.max(0, Math.min(1.5, score)));
  }

  scoreEvidence(evidence: IntelligenceEvidence): ScoredEvidence[] {
    const out: ScoredEvidence[] = [];
    for (const blocker of evidence.blockers.slice(0, 5)) {
      out.push({
        kind: "blocker",
        name: blocker.name,
        score: 1,
        why: blocker.observations[0] || "active blocker",
        data: blocker,
      });
    }
    for (const step of evidence.nextSteps.slice(0, 5)) {
      out.push({
        kind: "next",
        name: step.source,
        score: step.priority === "high" ? 0.95 : 0.75,
        why: step.text,
        data: step,
      });
    }
    for (const iface of evidence.interfaces.slice(0, 8)) {
      out.push({
        kind: "interface",
        name: iface.qualified_name || iface.name,
        score: iface.usage_count ? 0.8 : 0.65,
        why: `${iface.kind || iface.interface_type || "interface"} ${iface.language || "unknown"}`,
        ref: iface.stable_id,
        data: iface,
      });
    }
    for (const dep of evidence.dependencies.slice(0, 8)) {
      out.push({
        kind: "dependency",
        name: dep.target_identifier || dep.source_identifier,
        score: dep.resolution_status === "resolved" ? 0.7 : 0.55,
        why: `${dep.dependency_type}:${dep.resolution_status}`,
        data: dep,
      });
    }
    for (const file of evidence.files.slice(0, 8)) {
      out.push({
        kind: "file",
        name: file.relative_path || file.file_path,
        score: file.is_entry_point ? 0.75 : 0.55,
        why: `${file.language}/${file.category}`,
        ref: file.file_path,
        data: file,
      });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 20);
  }
}

export function round(value: number): number {
  return Number(value.toFixed(3));
}
