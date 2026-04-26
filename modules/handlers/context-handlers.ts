import { Entity, MemoryBranchInfo } from "../../memory-types.js";
import { BackgroundProcessor } from "../background-processor.js";
import { logger } from "../logger.js";
import {
  jsonResponse,
  sanitizeEntities,
  sanitizeEntity,
} from "./response-utils.js";

/**
 * AI Context Retrieval Handlers.
 *
 * The previous version exposed four overlapping tools (recall_working_context,
 * get_continuation_context, suggest_related_context, suggest_project_context).
 * They are now unified under a single `get_context` tool with a `mode`
 * parameter. The individual handler methods are kept and reused so that
 * each mode is a small, focused implementation.
 */
export class ContextHandlers {
  private memoryManager: any;
  private backgroundProcessor: BackgroundProcessor | null = null;

  constructor(memoryManager: any, backgroundProcessor?: BackgroundProcessor) {
    this.memoryManager = memoryManager;
    this.backgroundProcessor = backgroundProcessor || null;
  }

  /**
   * Unified `get_context` dispatcher.
   * mode: "working" | "continuation" | "related" | "project"
   */
  async handleGetContext(args: any): Promise<any> {
    const mode = args.mode || "working";
    switch (mode) {
      case "working":
        return this.handleRecallWorkingContext(args);
      case "continuation":
        return this.handleGetContinuationContext(args);
      case "related":
        return this.handleSuggestRelatedContext(args);
      case "project":
        return this.handleSuggestProjectContext(args);
      default:
        throw new Error(
          `Unknown context mode "${mode}". Expected one of: working, continuation, related, project.`,
        );
    }
  }

  async handleSuggestProjectContext(args: any): Promise<any> {
    const contextEngine = this.backgroundProcessor?.getContextEngine();
    if (!contextEngine) {
      return jsonResponse({
        error: "Context engine unavailable. Background processor not running.",
      });
    }

    try {
      const suggestions = await contextEngine.generateContextSuggestions(
        {
          current_file: args.current_file,
          search_query: args.search_query,
          working_interfaces: args.active_interfaces || [],
        },
        args.session_id,
      );
      return jsonResponse({
        mode: "project",
        suggestions,
        count: suggestions.length,
      });
    } catch (error) {
      logger.error("project context suggestion failed:", error);
      return jsonResponse({
        mode: "project",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async handleRecallWorkingContext(args: any): Promise<any> {
    const branchName = args.branch_name || "main";
    const includeRelated = args.include_related !== false;
    const maxRelated = args.max_related || 10;
    const maxObservations = args.max_observations ?? 5;

    const working = await this.memoryManager.searchEntities(
      "",
      branchName,
      ["active", "draft"],
      { workingContextOnly: true, includeConfidenceScores: true },
    );

    let allEntities: Entity[] = [...working.entities];
    let allRelations: any[] = [...working.relations];

    if (includeRelated && working.entities.length > 0) {
      const candidates = await this.memoryManager.searchEntities(
        "",
        branchName,
        ["active"],
        { includeContext: true },
      );
      const have = new Set(working.entities.map((e: Entity) => e.name));
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const related = candidates.entities
        .filter(
          (e: Entity) =>
            !have.has(e.name) &&
            ((e.relevanceScore && e.relevanceScore > 0.6) ||
              (e.lastAccessed && new Date(e.lastAccessed).getTime() > cutoff)),
        )
        .slice(0, maxRelated);
      allEntities.push(...related);
    }

    return jsonResponse({
      mode: "working",
      branch: branchName,
      entities: sanitizeEntities(allEntities, { maxObservations }),
      relations: this.dedupeRelations(allRelations),
      counts: {
        working: working.entities.length,
        related: allEntities.length - working.entities.length,
      },
    });
  }

  async handleGetProjectStatus(args: any): Promise<any> {
    const includeInactive = args.include_inactive || false;
    const detailLevel = args.detail_level || "summary";

    const allBranches = await this.memoryManager.listBranches();
    const branches = includeInactive
      ? allBranches
      : allBranches.filter(
          (b: MemoryBranchInfo) => b.currentFocus || b.name === "main",
        );

    const branchStatuses = [];
    for (const branch of branches) {
      branchStatuses.push(await this.getBranchStatus(branch, detailLevel));
    }

    const totals = branchStatuses.reduce(
      (acc, b) => {
        acc.entities += b.entity_count;
        acc.working += b.working_entities;
        if (b.current_focus) acc.active += 1;
        return acc;
      },
      { entities: 0, working: 0, active: 0 },
    );

    return jsonResponse({
      total_branches: branchStatuses.length,
      active_branches: totals.active,
      total_entities: totals.entities,
      working_entities: totals.working,
      detail_level: detailLevel,
      branches: branchStatuses,
    });
  }

  async handleFindDependencies(args: any): Promise<any> {
    const branchName = args.branch_name || "main";
    const dependencyDepth = args.dependency_depth || 2;
    let targetEntities: string[] = args.entity_names || [];

    if (targetEntities.length === 0) {
      const working = await this.memoryManager.searchEntities(
        "",
        branchName,
        ["active", "draft"],
        { workingContextOnly: true },
      );
      targetEntities = working.entities.map((e: Entity) => e.name);
    }

    if (targetEntities.length === 0) {
      return jsonResponse({
        branch: branchName,
        dependencies: [],
        note: "No working context entities to analyze",
      });
    }

    const dependencies = await this.traceDependencies(
      targetEntities,
      branchName,
      dependencyDepth,
    );

    return jsonResponse({
      branch: branchName,
      target_entities: targetEntities,
      depth_analyzed: dependencyDepth,
      dependencies,
      count: dependencies.length,
    });
  }

  async handleTraceDecisionChain(args: any): Promise<any> {
    const branchName = args.branch_name || "main";
    const maxDecisions = args.max_decisions || 10;
    const timeWindowDays = args.time_window_days || 30;
    const entityName = args.entity_name;

    const decisions = entityName
      ? await this.getDecisionChainForEntity(
          entityName,
          branchName,
          maxDecisions,
          timeWindowDays,
        )
      : await this.getRecentDecisions(branchName, maxDecisions, timeWindowDays);

    return jsonResponse({
      branch: branchName,
      target_entity: entityName || null,
      time_window_days: timeWindowDays,
      decisions,
      count: decisions.length,
    });
  }

  async handleGetContinuationContext(args: any): Promise<any> {
    const branchName = args.branch_name || "main";
    const timeWindowHours = args.time_window_hours || 24;
    const includeBlockers = args.include_blockers !== false;
    const maxObservations = args.max_observations ?? 5;
    const cutoff = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000);

    const working = await this.memoryManager.searchEntities(
      "",
      branchName,
      ["active", "draft"],
      { workingContextOnly: true },
    );

    const recentActivity = await this.getRecentActivity(branchName, cutoff);
    const recentDecisions = await this.getRecentDecisions(
      branchName,
      10,
      timeWindowHours / 24,
    );
    const blockers = includeBlockers
      ? await this.getCurrentBlockers(branchName)
      : [];
    const nextSteps = this.extractNextSteps(working.entities);

    return jsonResponse({
      mode: "continuation",
      branch: branchName,
      time_window_hours: timeWindowHours,
      working_entities: sanitizeEntities(working.entities, { maxObservations }),
      working_count: working.entities.length,
      recent_activity: recentActivity,
      recent_decisions: recentDecisions,
      blockers,
      next_steps: nextSteps,
    });
  }

  async handleSuggestRelatedContext(args: any): Promise<any> {
    if (!args.current_focus) {
      throw new Error("current_focus is required");
    }

    const branchName = args.branch_name || "main";
    const max = args.max_suggestions || 10;

    let targetEntities: string[] = args.entity_names || [];
    if (targetEntities.length === 0) {
      const working = await this.memoryManager.searchEntities(
        "",
        branchName,
        ["active", "draft"],
        { workingContextOnly: true },
      );
      targetEntities = working.entities.map((e: Entity) => e.name);
    }

    const results = await this.memoryManager.searchEntities(
      args.current_focus,
      branchName,
      ["active"],
      { includeContext: true, includeConfidenceScores: true },
    );

    const suggestions = sanitizeEntities(
      results.entities
        .filter((e: Entity) => !targetEntities.includes(e.name))
        .slice(0, max),
      { maxObservations: 3, keepSearchMeta: true },
    );

    return jsonResponse({
      mode: "related",
      branch: branchName,
      current_focus: args.current_focus,
      target_entities: targetEntities,
      suggestions,
      count: suggestions.length,
    });
  }

  // ---------- helpers ----------

  private async getBranchStatus(
    branch: MemoryBranchInfo,
    detailLevel: string,
  ): Promise<any> {
    const branchGraph = await this.memoryManager.exportBranch(branch.name);
    const workingEntities = branchGraph.entities.filter(
      (e: Entity) => e.workingContext,
    ).length;
    const recentDecisions = branchGraph.entities.filter(
      (e: Entity) =>
        e.entityType === "decision" &&
        e.lastUpdated &&
        new Date(e.lastUpdated) >
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    ).length;

    const base: any = {
      name: branch.name,
      purpose: branch.purpose,
      entity_count: branch.entityCount,
      working_entities: workingEntities,
      recent_decisions: recentDecisions,
      current_focus: branch.currentFocus || false,
      project_phase: branch.projectPhase || "active-development",
      last_updated: branch.lastUpdated,
    };

    if (detailLevel === "comprehensive") {
      base.entities_by_type = this.groupEntitiesByType(branchGraph.entities);
      base.relationship_density =
        branchGraph.relations.length / Math.max(branchGraph.entities.length, 1);
    }
    return base;
  }

  private dedupeRelations(relations: any[]): any[] {
    const seen = new Set<string>();
    return relations.filter((r) => {
      const k = `${r.from}-${r.to}-${r.relationType}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  /**
   * Trace dependencies via the relations graph: entities that the target
   * entities point to with relation types matching depends_on/requires/uses.
   * Honors `depth` for transitive traversal.
   */
  private async traceDependencies(
    entityNames: string[],
    branchName: string,
    depth: number,
  ): Promise<any[]> {
    const branchGraph = await this.memoryManager.exportBranch(branchName);
    const relations = branchGraph.relations as any[];
    const dependencyRelTypes = new Set([
      "depends_on",
      "requires",
      "uses",
      "needs",
      "imports",
      "extends",
      "implements",
    ]);

    const visited = new Set<string>();
    const out: any[] = [];

    let frontier = entityNames.slice();
    for (let lvl = 0; lvl < depth && frontier.length; lvl++) {
      const next: string[] = [];
      for (const name of frontier) {
        if (visited.has(name)) continue;
        visited.add(name);
        const outgoing = relations.filter(
          (r: any) => r.from === name && dependencyRelTypes.has(r.relationType),
        );
        for (const r of outgoing) {
          out.push({
            from: r.from,
            to: r.to,
            relation: r.relationType,
            depth: lvl + 1,
          });
          next.push(r.to);
        }
      }
      frontier = next;
    }
    return out;
  }

  /**
   * Get the chain of decision-type entities related to `entityName`
   * via "affects" / "decides" relations (or direct decision entities
   * within the time window if no relation exists).
   */
  private async getDecisionChainForEntity(
    entityName: string,
    branchName: string,
    maxDecisions: number,
    timeWindowDays: number,
  ): Promise<any[]> {
    const branchGraph = await this.memoryManager.exportBranch(branchName);
    const decisionTypes = new Set(["affects", "decides", "depends_on"]);
    const cutoff = new Date(Date.now() - timeWindowDays * 24 * 60 * 60 * 1000);

    const decisionNames = new Set<string>();
    for (const r of branchGraph.relations as any[]) {
      if (decisionTypes.has(r.relationType)) {
        if (r.to === entityName) decisionNames.add(r.from);
        if (r.from === entityName) decisionNames.add(r.to);
      }
    }

    return (branchGraph.entities as Entity[])
      .filter((e) => e.entityType === "decision")
      .filter(
        (e) =>
          decisionNames.has(e.name) ||
          (e.lastUpdated && new Date(e.lastUpdated) > cutoff),
      )
      .sort((a, b) => {
        const ta = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
        const tb = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
        return tb - ta;
      })
      .slice(0, maxDecisions)
      .map((e) => ({
        entity_name: e.name,
        timestamp: e.lastUpdated,
        status: e.status,
        observations: e.observations.slice(0, 3),
      }));
  }

  private async getRecentDecisions(
    branchName: string,
    maxDecisions: number,
    timeWindowDays: number,
  ): Promise<any[]> {
    const cutoff = new Date(Date.now() - timeWindowDays * 24 * 60 * 60 * 1000);
    const results = await this.memoryManager.searchEntities("", branchName, [
      "active",
      "draft",
    ]);

    return results.entities
      .filter(
        (e: Entity) =>
          e.lastUpdated &&
          new Date(e.lastUpdated) > cutoff &&
          (e.entityType === "decision" ||
            e.observations.some(
              (o) => o.includes("decision") || o.includes("decided"),
            )),
      )
      .slice(0, maxDecisions)
      .map((e: Entity) => ({
        entity_name: e.name,
        decision_type: e.entityType,
        timestamp: e.lastUpdated,
        observations: e.observations.slice(0, 3),
        status: e.status,
      }));
  }

  private async getRecentActivity(
    branchName: string,
    cutoff: Date,
  ): Promise<any[]> {
    const all = await this.memoryManager.exportBranch(branchName);
    return all.entities
      .filter((e: Entity) => e.lastUpdated && new Date(e.lastUpdated) > cutoff)
      .map((e: Entity) => ({
        entity_name: e.name,
        action: "updated",
        timestamp: e.lastUpdated,
        entity_type: e.entityType,
      }))
      .sort(
        (a: any, b: any) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      )
      .slice(0, 5);
  }

  private async getCurrentBlockers(branchName: string): Promise<any[]> {
    const blockers = await this.memoryManager.searchEntities(
      "blocker",
      branchName,
      ["active"],
    );
    return blockers.entities
      .filter(
        (e: Entity) => e.entityType === "blocker" || e.status === "active",
      )
      .slice(0, 5)
      .map((e: Entity) => ({
        blocker_name: e.name,
        severity: e.observations.some((o) =>
          o.toLowerCase().includes("critical"),
        )
          ? "critical"
          : "normal",
        description: e.observations[0] || "",
      }));
  }

  private extractNextSteps(entities: Entity[]): any[] {
    const steps: any[] = [];
    for (const entity of entities) {
      for (const obs of entity.observations) {
        const lower = obs.toLowerCase();
        if (
          lower.includes("next") ||
          lower.includes("todo") ||
          lower.includes("action")
        ) {
          steps.push({
            source_entity: entity.name,
            step_description: obs,
            priority:
              lower.includes("urgent") || lower.includes("critical")
                ? "high"
                : "normal",
          });
        }
      }
    }
    return steps.slice(0, 5);
  }

  private groupEntitiesByType(entities: Entity[]): { [key: string]: number } {
    return entities.reduce((acc: { [key: string]: number }, entity) => {
      acc[entity.entityType] = (acc[entity.entityType] || 0) + 1;
      return acc;
    }, {});
  }
}
