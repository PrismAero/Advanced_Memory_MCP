import { Entity } from "../../memory-types.js";
import { logger } from "../logger.js";
import {
  jsonResponse,
  sanitizeEntity,
  sanitizeEntities,
} from "./response-utils.js";

/**
 * AI Workflow Management Handlers.
 *
 * The previous version had two overlapping tools (`update_project_status`
 * and `archive_completed_work`) plus several handlers that injected
 * pseudo-AI insights ("ai_metadata", "ai_optimization", "ai_warnings",
 * "ai_recommendations") and hallucinated dependencies (e.g. claiming a
 * "Database schema" was missing whenever the work_description happened
 * to contain the word "database"). Both have been removed: status
 * mutations now flow through a single `handleUpdateStatus` dispatcher
 * with `mode: "phase" | "archive"`, and dependency analysis only
 * surfaces dependencies that are actually mentioned in observations.
 */
export class WorkflowHandlers {
  private memoryManager: any;

  constructor(memoryManager: any) {
    this.memoryManager = memoryManager;
  }

  // ---------- decision capture ----------

  async handleCaptureDecision(args: any): Promise<any> {
    if (!args.decision_title || !args.decision_rationale) {
      throw new Error("decision_title and decision_rationale are required");
    }

    const branchName = args.branch_name || "main";
    const decisionMaker = args.decision_maker || "AI Agent";

    const observations = [
      `Decision: ${args.decision_rationale}`,
      `Decision maker: ${decisionMaker}`,
      `Timestamp: ${new Date().toISOString()}`,
    ];
    if (args.alternatives_considered?.length) {
      observations.push(
        `Alternatives considered: ${args.alternatives_considered.join(", ")}`,
      );
    }
    if (args.impact_areas?.length) {
      observations.push(`Impact areas: ${args.impact_areas.join(", ")}`);
    }
    if (args.related_entities?.length) {
      observations.push(
        `Related entities: ${args.related_entities.join(", ")}`,
      );
    }

    const decisionEntity: Entity = {
      name: `Decision: ${args.decision_title}`,
      entityType: "decision",
      observations,
      status: "active",
      workingContext: true,
      relevanceScore: 0.8,
    };

    const created = await this.memoryManager.createEntities(
      [decisionEntity],
      branchName,
    );

    let relationshipsCreated = 0;
    if (args.related_entities?.length) {
      const relationships = args.related_entities.map((entityName: string) => ({
        from: decisionEntity.name,
        to: entityName,
        relationType: "affects",
      }));
      try {
        await this.memoryManager.createRelations(relationships, branchName);
        relationshipsCreated = relationships.length;
      } catch (error) {
        logger.warn("Some relationships could not be created:", error);
      }
    }

    return jsonResponse({
      branch: branchName,
      entity: sanitizeEntity(created[0], { maxObservations: 10 }),
      relationships_created: relationshipsCreated,
    });
  }

  // ---------- working context focus ----------

  async handleMarkCurrentWork(args: any): Promise<any> {
    if (!args.focus_entities?.length) {
      throw new Error("focus_entities is required and must not be empty");
    }

    const branchName = args.branch_name || "main";
    const clearPrevious = args.clear_previous !== false;

    if (clearPrevious) {
      await this.clearPreviousWorkingContext(branchName);
    }

    const updateResults: any[] = [];

    for (const entityName of args.focus_entities) {
      try {
        // Use the public memory-manager API instead of poking at a
        // private `entityOps` field on the SQLite layer. The legacy
        // `sqliteManager?.entityOps` access resolved to undefined on
        // HybridMemoryManager and made these calls silently throw.
        await this.memoryManager.updateEntityWorkingContext(
          entityName,
          true,
          branchName,
        );
        await this.memoryManager.updateEntityRelevanceScore(
          entityName,
          0.9,
          branchName,
        );
        await this.memoryManager.updateEntityLastAccessed(
          entityName,
          branchName,
        );
        updateResults.push({ entity: entityName, marked: true });
      } catch (error) {
        updateResults.push({
          entity: entityName,
          marked: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    let focusSession = null;
    if (args.focus_description) {
      focusSession = await this.createFocusSession(
        args.focus_description,
        args.focus_entities,
        branchName,
      );
    }

    return jsonResponse({
      branch: branchName,
      cleared_previous: clearPrevious,
      focus_entities: args.focus_entities,
      focus_session: focusSession ? sanitizeEntity(focusSession) : null,
      results: updateResults,
    });
  }

  // ---------- unified status updates ----------

  /**
   * `update_status` dispatcher.
   * mode "phase":   update branch project_phase + bulk entity status updates.
   * mode "archive": archive specific entities while preserving relationships.
   */
  async handleUpdateStatus(args: any): Promise<any> {
    const mode = args.mode || (args.entity_names ? "archive" : "phase");
    if (mode === "archive") return this.handleArchiveCompletedWork(args);
    if (mode === "phase") return this.handleUpdateProjectStatus(args);
    throw new Error(
      `Unknown status mode "${mode}". Expected "phase" or "archive".`,
    );
  }

  async handleUpdateProjectStatus(args: any): Promise<any> {
    if (!args.branch_name || !args.project_phase) {
      throw new Error("branch_name and project_phase are required");
    }

    const updateAllBranches = args.branch_name === "*";
    const projectPhase = args.project_phase;
    const statusUpdates = args.status_updates || [];

    let branchesToUpdate: string[];
    if (updateAllBranches) {
      const allBranches = await this.memoryManager.listBranches();
      branchesToUpdate = allBranches.map((b: any) => b.name);
    } else {
      branchesToUpdate = [args.branch_name];
    }

    const branchUpdates: any[] = [];
    for (const branchName of branchesToUpdate) {
      const update: any = {
        branch: branchName,
        new_phase: projectPhase,
        entity_updates: [] as any[],
      };

      try {
        if (statusUpdates.length > 0) {
          const branchGraph = await this.memoryManager.exportBranch(branchName);
          for (const su of statusUpdates) {
            const matching = branchGraph.entities.filter((e: Entity) =>
              this.entityMatchesPattern(e, su.entity_pattern),
            );
            for (const entity of matching) {
              try {
                await this.memoryManager.updateEntityStatus(
                  entity.name,
                  su.new_status,
                  su.reason,
                  branchName,
                );
                update.entity_updates.push({
                  entity: entity.name,
                  old_status: entity.status,
                  new_status: su.new_status,
                  reason: su.reason,
                });
              } catch (error) {
                update.entity_updates.push({
                  entity: entity.name,
                  error: error instanceof Error ? error.message : String(error),
                });
              }
            }
          }
        }
      } catch (error) {
        update.error = error instanceof Error ? error.message : String(error);
      }
      branchUpdates.push(update);
    }

    return jsonResponse({
      mode: "phase",
      target_branches: updateAllBranches ? "all" : args.branch_name,
      new_phase: projectPhase,
      branches_processed: branchesToUpdate.length,
      patterns_applied: statusUpdates.length,
      branch_updates: branchUpdates,
    });
  }

  async handleArchiveCompletedWork(args: any): Promise<any> {
    if (!args.entity_names?.length) {
      throw new Error("entity_names is required and must not be empty");
    }

    const branchName = args.branch_name || "main";
    const completionSummary = args.completion_summary;
    const preserveRelationships = args.preserve_relationships !== false;

    let summaryEntity: Entity | null = null;
    if (completionSummary) {
      summaryEntity = await this.createCompletionSummary(
        completionSummary,
        args.entity_names,
        branchName,
      );
    }

    let preservedRelationCount = 0;
    if (preserveRelationships) {
      const branchGraph = await this.memoryManager.exportBranch(branchName);
      preservedRelationCount = branchGraph.relations.filter(
        (rel: any) =>
          args.entity_names.includes(rel.from) ||
          args.entity_names.includes(rel.to),
      ).length;
    }

    const archiveResults: any[] = [];
    for (const entityName of args.entity_names) {
      try {
        await this.memoryManager.updateEntityStatus(
          entityName,
          "archived",
          "Completed work - archived",
          branchName,
        );
        await this.memoryManager.updateEntityWorkingContext(
          entityName,
          false,
          branchName,
        );
        await this.memoryManager.updateEntityRelevanceScore(
          entityName,
          0.3,
          branchName,
        );
        archiveResults.push({ entity: entityName, archived: true });
      } catch (error) {
        archiveResults.push({
          entity: entityName,
          archived: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return jsonResponse({
      mode: "archive",
      branch: branchName,
      archived_count: archiveResults.filter((r) => r.archived).length,
      preserved_relations: preservedRelationCount,
      summary_entity: summaryEntity ? sanitizeEntity(summaryEntity) : null,
      results: archiveResults,
    });
  }

  // ---------- dependency check (real, no hallucination) ----------

  async handleCheckMissingDependencies(args: any): Promise<any> {
    if (!args.work_description) {
      throw new Error("work_description is required");
    }

    const branchName = args.branch_name || "main";
    let workEntities: string[] = args.entity_names || [];
    if (workEntities.length === 0) {
      const working = await this.memoryManager.searchEntities(
        "",
        branchName,
        ["active", "draft"],
        { workingContextOnly: true },
      );
      workEntities = working.entities.map((e: Entity) => e.name);
    }

    const dependencies: any[] = [];
    for (const entityName of workEntities) {
      try {
        const entity = await this.memoryManager.findEntityByName(
          entityName,
          branchName,
        );
        if (!entity) continue;
        for (const obs of entity.observations) {
          const lower = obs.toLowerCase();
          if (
            lower.includes("depends") ||
            lower.includes("requires") ||
            lower.includes("needs ")
          ) {
            dependencies.push({
              source_entity: entityName,
              dependency_description: obs,
              status: "identified",
            });
          }
        }
      } catch {
        // skip missing entities silently
      }
    }

    return jsonResponse({
      branch: branchName,
      work_description: args.work_description,
      entities_analyzed: workEntities,
      dependencies,
      count: dependencies.length,
      note:
        dependencies.length === 0
          ? "No dependency keywords (depends/requires/needs) found in observations of analyzed entities."
          : undefined,
    });
  }

  // ---------- helpers ----------

  private async clearPreviousWorkingContext(branchName: string): Promise<void> {
    const working = await this.memoryManager.searchEntities(
      "",
      branchName,
      ["active", "draft"],
      { workingContextOnly: true },
    );
    for (const entity of working.entities) {
      try {
        await this.memoryManager.updateEntityWorkingContext(
          entity.name,
          false,
          branchName,
        );
      } catch (error) {
        logger.warn(
          `Failed to clear working context for ${entity.name}:`,
          error,
        );
      }
    }
  }

  private async createFocusSession(
    description: string,
    focusEntities: string[],
    branchName: string,
  ): Promise<Entity | null> {
    try {
      const focusEntity: Entity = {
        name: `Focus Session: ${new Date().toISOString().split("T")[0]}`,
        entityType: "current-status",
        observations: [
          `Focus: ${description}`,
          `Entities in focus: ${focusEntities.join(", ")}`,
          `Started: ${new Date().toISOString()}`,
        ],
        status: "active",
        workingContext: true,
      };
      const created = await this.memoryManager.createEntities(
        [focusEntity],
        branchName,
      );
      return created[0];
    } catch (error) {
      logger.warn("Failed to create focus session entity:", error);
      return null;
    }
  }

  private async createCompletionSummary(
    summary: string,
    completedEntities: string[],
    branchName: string,
  ): Promise<Entity | null> {
    try {
      const summaryEntity: Entity = {
        name: `Completion Summary: ${new Date().toISOString().split("T")[0]}`,
        entityType: "reference",
        observations: [
          `Summary: ${summary}`,
          `Completed entities: ${completedEntities.join(", ")}`,
          `Completed: ${new Date().toISOString()}`,
        ],
        status: "active",
        relevanceScore: 0.6,
      };
      const created = await this.memoryManager.createEntities(
        [summaryEntity],
        branchName,
      );
      return created[0];
    } catch (error) {
      logger.warn("Failed to create completion summary entity:", error);
      return null;
    }
  }

  private entityMatchesPattern(entity: Entity, pattern: string): boolean {
    const lower = pattern.toLowerCase();
    return (
      entity.name.toLowerCase().includes(lower) ||
      entity.entityType.toLowerCase().includes(lower) ||
      entity.observations.some((o) => o.toLowerCase().includes(lower))
    );
  }
}
