import type { Entity, KnowledgeGraph, MemoryBranchInfo } from "../../memory-types.js";
import type { ContextEngine } from "./context-engine.js";
import { compactEntityForContext, compactEvidence, compactRelations } from "./compact-context.js";
import { ContextScorer } from "./context-scorer.js";
import { IntelligenceEvidenceBuilder } from "./evidence-builder.js";

export class IntelligenceContextService {
  private scorer = new ContextScorer();

  constructor(
    private readonly memoryManager: any,
    private readonly getContextEngine: () => ContextEngine | null,
    private readonly recordAccess?: (name: string, coAccessed: string[]) => void,
  ) {}

  async getWorkingContext(args: any): Promise<any> {
    const branchName = args.branch_name || "main";
    const includeRelated = args.include_related !== false;
    const maxRelated = clampInteger(args.max_related, 1, 50, 10);
    const maxObservations = clampInteger(args.max_observations, 0, 100, 5);
    const working = await this.memoryManager.searchEntities("", branchName, ["active", "draft"], {
      workingContextOnly: true,
      includeConfidenceScores: true,
      maxResults: 25,
    });

    let allEntities: Entity[] = [...working.entities];
    let relations = [...working.relations];
    if (includeRelated && working.entities.length > 0) {
      const candidates = await this.memoryManager.searchEntities("", branchName, ["active"], {
        includeContext: true,
        maxResults: maxRelated + working.entities.length,
      });
      const have = new Set(working.entities.map((entity: Entity) => entity.name));
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const related = candidates.entities
        .filter(
          (entity: Entity) =>
            !have.has(entity.name) &&
            ((entity.relevanceScore && entity.relevanceScore > 0.6) ||
              (entity.lastAccessed && new Date(entity.lastAccessed).getTime() > cutoff)),
        )
        .slice(0, maxRelated);
      allEntities.push(...related);
      relations = [...relations, ...candidates.relations];
    }

    const graph = { entities: allEntities, relations };
    const entities = await this.compactEntities(allEntities, graph, "", maxObservations);
    this.recordReturnedAccess(allEntities);
    return {
      mode: "working",
      branch: branchName,
      entities,
      relations: compactRelations(relations),
      counts: {
        working: working.entities.length,
        related: allEntities.length - working.entities.length,
      },
    };
  }

  async getContinuationContext(args: any): Promise<any> {
    const branchName = args.branch_name || "main";
    const timeWindowHours = clampInteger(args.time_window_hours, 1, 24 * 30, 24);
    const includeBlockers = args.include_blockers !== false;
    const maxObservations = clampInteger(args.max_observations, 0, 100, 5);
    const cutoff = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000);
    const working = await this.memoryManager.searchEntities("", branchName, ["active", "draft"], {
      workingContextOnly: true,
      maxResults: 25,
    });
    const graph = await this.memoryManager.exportBranch(branchName);
    const workingEntities = await this.compactEntities(
      working.entities,
      graph,
      "",
      maxObservations,
    );
    return {
      mode: "continuation",
      branch: branchName,
      hours: timeWindowHours,
      working: workingEntities,
      activity: recentActivity(graph, cutoff),
      decisions: recentDecisions(graph, cutoff, 10),
      blockers: includeBlockers ? currentBlockers(graph, 5) : [],
      next: extractNextSteps(working.entities, 5),
    };
  }

  async getRelatedContext(args: any): Promise<any> {
    if (!args.current_focus) throw new Error("current_focus is required");
    const branchName = args.branch_name || "main";
    const max = clampInteger(args.max_suggestions, 1, 50, 10);
    const maxObservations = clampInteger(args.max_observations, 0, 100, 3);
    let targetEntities: string[] = args.entity_names || [];
    if (targetEntities.length === 0) {
      const working = await this.memoryManager.searchEntities("", branchName, ["active", "draft"], {
        workingContextOnly: true,
        maxResults: 25,
      });
      targetEntities = working.entities.map((entity: Entity) => entity.name);
    }
    const results = await this.memoryManager.searchEntities(
      args.current_focus,
      branchName,
      ["active"],
      {
        includeContext: true,
        includeConfidenceScores: true,
        maxResults: max * 2,
      },
    );
    const suggestions = results.entities
      .filter((entity: Entity) => !targetEntities.includes(entity.name))
      .slice(0, max);
    const graph = { entities: results.entities, relations: results.relations };
    return {
      mode: "related",
      branch: branchName,
      focus: args.current_focus,
      targets: targetEntities,
      suggestions: await this.compactEntities(
        suggestions,
        graph,
        args.current_focus,
        maxObservations,
      ),
      relations: compactRelations(results.relations),
    };
  }

  async getProjectContext(args: any): Promise<any> {
    const contextEngine = this.getContextEngine();
    if (!contextEngine) {
      return {
        mode: "project",
        error: "Context engine unavailable.",
      };
    }
    const suggestions = await contextEngine.generateContextSuggestions(
      {
        current_file: args.current_file,
        search_query: args.search_query,
        working_interfaces: args.active_interfaces || [],
      },
      args.session_id,
    );
    const evidence = await contextEngine.buildProjectEvidence({
      currentFile: args.current_file,
      searchQuery: args.search_query,
      activeInterfaces: args.active_interfaces || [],
    });
    return {
      mode: "project",
      suggestions: suggestions.map(compactSuggestion).slice(0, 12),
      evidence: compactEvidence(evidence),
      count: suggestions.length,
    };
  }

  async getProjectStatus(args: any): Promise<any> {
    const includeInactive = args.include_inactive || false;
    const detailLevel = args.detail_level || "summary";
    const allBranches = await this.memoryManager.listBranches();
    const branches = includeInactive
      ? allBranches
      : allBranches.filter(
          (branch: MemoryBranchInfo) => branch.currentFocus || branch.name === "main",
        );
    const branchStatuses = [];
    for (const branch of branches) {
      const branchGraph = await this.memoryManager.exportBranch(branch.name);
      const working = branchGraph.entities.filter((entity: Entity) => entity.workingContext).length;
      const recentDecisionCount = branchGraph.entities.filter(
        (entity: Entity) =>
          entity.entityType === "decision" &&
          entity.lastUpdated &&
          new Date(entity.lastUpdated) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      ).length;
      const base: any = {
        name: branch.name,
        entities: branch.entityCount,
        working,
        decisions_7d: recentDecisionCount,
        focus: branch.currentFocus || false,
        phase: branch.projectPhase || "active-development",
        updated: branch.lastUpdated,
      };
      if (detailLevel === "comprehensive") {
        base.types = groupEntitiesByType(branchGraph.entities);
        base.rel_density = branchGraph.relations.length / Math.max(branchGraph.entities.length, 1);
      }
      branchStatuses.push(base);
    }
    return {
      branches: branchStatuses,
      counts: {
        branches: branchStatuses.length,
        active: branchStatuses.filter((branch: any) => branch.focus).length,
        entities: branchStatuses.reduce((sum: number, branch: any) => sum + branch.entities, 0),
        working: branchStatuses.reduce((sum: number, branch: any) => sum + branch.working, 0),
      },
      detail: detailLevel,
    };
  }

  private async compactEntities(
    entities: Entity[],
    graph: KnowledgeGraph,
    query: string,
    maxObservations: number,
  ): Promise<any[]> {
    const contextEngine = this.getContextEngine();
    const evidenceBuilder = contextEngine?.getEvidenceBuilder();
    const out = [];
    for (const entity of entities.slice(0, 50)) {
      const evidence = evidenceBuilder
        ? await evidenceBuilder.buildForEntity(entity, graph, {
            query,
            maxPerType: 6,
          })
        : undefined;
      out.push(
        compactEntityForContext(entity, {
          maxObservations,
          evidence,
          score: this.scorer.scoreEntity(entity, query, evidence),
        }),
      );
    }
    return out.sort((a, b) => (b.score.evidence || 0) - (a.score.evidence || 0));
  }

  private recordReturnedAccess(entities: Entity[]): void {
    if (!this.recordAccess || entities.length === 0) return;
    const names = entities.map((entity) => entity.name);
    for (const name of names.slice(0, 10)) {
      this.recordAccess(name, names.filter((otherName) => otherName !== name).slice(0, 10));
    }
  }
}

function compactSuggestion(suggestion: any): any {
  return {
    type: suggestion.type,
    title: suggestion.title,
    score: Number((suggestion.relevance_score * suggestion.confidence).toFixed(3)),
    why: suggestion.reasoning || suggestion.description,
    act: suggestion.suggested_action,
    files: suggestion.related_files?.slice(0, 3),
    interfaces: suggestion.related_interfaces?.slice(0, 3),
    meta: suggestion.metadata,
  };
}

function recentActivity(graph: KnowledgeGraph, cutoff: Date): any[] {
  return graph.entities
    .filter((entity) => entity.lastUpdated && new Date(entity.lastUpdated) > cutoff)
    .sort((a, b) => new Date(b.lastUpdated || 0).getTime() - new Date(a.lastUpdated || 0).getTime())
    .slice(0, 8)
    .map((entity) => ({
      name: entity.name,
      type: entity.entityType,
      updated: entity.lastUpdated,
    }));
}

function recentDecisions(graph: KnowledgeGraph, cutoff: Date, limit: number): any[] {
  return graph.entities
    .filter(
      (entity) =>
        entity.lastUpdated &&
        new Date(entity.lastUpdated) > cutoff &&
        (entity.entityType === "decision" ||
          entity.observations.some((obs) => /decision|decided/i.test(obs))),
    )
    .slice(0, limit)
    .map((entity) => ({
      name: entity.name,
      status: entity.status,
      obs: entity.observations.slice(0, 2),
      updated: entity.lastUpdated,
    }));
}

function currentBlockers(graph: KnowledgeGraph, limit: number): any[] {
  return graph.entities
    .filter(
      (entity) =>
        entity.entityType === "blocker" ||
        entity.observations.some((obs) => /block|critical|risk|fail/i.test(obs)),
    )
    .slice(0, limit)
    .map((entity) => ({
      name: entity.name,
      severity: entity.observations.some((obs) => /critical|fail/i.test(obs)) ? "high" : "normal",
      obs: entity.observations.slice(0, 2),
    }));
}

function extractNextSteps(entities: Entity[], limit: number): any[] {
  const steps = [];
  for (const entity of entities) {
    for (const obs of entity.observations) {
      if (!/\b(next|todo|action|follow.?up|must|need|fix)\b/i.test(obs)) continue;
      steps.push({
        source: entity.name,
        text: obs,
        priority: /urgent|critical|block|fail|risk/i.test(obs) ? "high" : "normal",
      });
      if (steps.length >= limit) return steps;
    }
  }
  return steps;
}

function groupEntitiesByType(entities: Entity[]): Record<string, number> {
  return entities.reduce((acc: Record<string, number>, entity) => {
    acc[entity.entityType] = (acc[entity.entityType] || 0) + 1;
    return acc;
  }, {});
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(numeric)));
}
