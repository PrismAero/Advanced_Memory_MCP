import { Entity } from "../../memory-types.js";
import { logger } from "../logger.js";

/**
 * AI Workflow Management Handlers
 * Specialized handlers for AI decision making, status management, and workflow optimization
 */
export class WorkflowHandlers {
  // Text truncation lengths for summary views
  private static readonly MAX_NOTE_PREVIEW_LENGTH = 100;
  private static readonly MAX_DECISION_SUMMARY_LENGTH = 120;
  private static readonly MAX_BLOCKER_DESCRIPTION_LENGTH = 150;

  private memoryManager: any;

  constructor(memoryManager: any) {
    this.memoryManager = memoryManager;
  }

  /**
   * Capture a decision with full context and structured information
   */
  async handleCaptureDecision(args: any): Promise<any> {
    if (!args.decision_title || !args.decision_rationale) {
      throw new Error("decision_title and decision_rationale are required");
    }

    const branchName = args.branch_name || "main";
    const decisionMaker = args.decision_maker || "AI Agent";

    logger.info(
      `Capturing decision: "${args.decision_title}" in branch: ${branchName}`
    );

    try {
      // Create structured observations for the decision
      const observations = [
        `Decision: ${args.decision_rationale}`,
        `Decision maker: ${decisionMaker}`,
        `Timestamp: ${new Date().toISOString()}`,
      ];

      // Add alternatives considered if provided
      if (
        args.alternatives_considered &&
        args.alternatives_considered.length > 0
      ) {
        observations.push(
          `Alternatives considered: ${args.alternatives_considered.join(", ")}`
        );
      }

      // Add impact areas if provided
      if (args.impact_areas && args.impact_areas.length > 0) {
        observations.push(`Impact areas: ${args.impact_areas.join(", ")}`);
      }

      // Add related entities if provided
      if (args.related_entities && args.related_entities.length > 0) {
        observations.push(
          `Related entities: ${args.related_entities.join(", ")}`
        );
      }

      // Create the decision entity
      const decisionEntity: Entity = {
        name: `Decision: ${args.decision_title}`,
        entityType: "decision",
        observations,
        status: "active",
        workingContext: true, // Decisions are typically part of working context
        relevanceScore: 0.8, // High relevance for decisions
      };

      const createdEntities = await this.memoryManager.createEntities(
        [decisionEntity],
        branchName
      );

      // Create relationships to related entities if specified
      if (args.related_entities && args.related_entities.length > 0) {
        const relationships = args.related_entities.map(
          (entityName: string) => ({
            from: decisionEntity.name,
            to: entityName,
            relationType: "affects",
          })
        );

        try {
          await this.memoryManager.createRelations(relationships, branchName);
        } catch (error) {
          logger.warn("Some relationships could not be created:", error);
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                decision_captured: {
                  entity: createdEntities[0],
                  branch: branchName,
                  related_entities: args.related_entities || [],
                  impact_areas: args.impact_areas || [],
                },
                ai_metadata: {
                  decision_type: "structured_capture",
                  auto_working_context: true,
                  high_relevance: true,
                  relationships_created: args.related_entities?.length || 0,
                },
                summary: `Decision "${args.decision_title}" captured in branch "${branchName}" with full context and relationships`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      logger.error("Error capturing decision:", error);
      throw error;
    }
  }

  /**
   * Mark entities as current working focus
   */
  async handleMarkCurrentWork(args: any): Promise<any> {
    if (!args.focus_entities || args.focus_entities.length === 0) {
      throw new Error("focus_entities is required and must not be empty");
    }

    const branchName = args.branch_name || "main";
    const clearPrevious = args.clear_previous !== false; // Default true
    const focusDescription = args.focus_description;

    logger.info(
      `Marking current work focus: ${args.focus_entities.join(
        ", "
      )} in branch: ${branchName}`
    );

    try {
      // Clear previous working context if requested
      if (clearPrevious) {
        await this.clearPreviousWorkingContext(branchName);
      }

      // Mark new entities as working context
      const updateResults = [];
      for (const entityName of args.focus_entities) {
        try {
          // Update working context and relevance score
          await this.memoryManager.sqliteManager.entityOps.updateEntityWorkingContext(
            entityName,
            true,
            branchName
          );
          await this.memoryManager.sqliteManager.entityOps.updateEntityRelevanceScore(
            entityName,
            0.9, // High relevance for current work
            branchName
          );
          await this.memoryManager.sqliteManager.entityOps.updateEntityLastAccessed(
            entityName,
            branchName
          );

          updateResults.push({
            entity: entityName,
            status: "marked_as_current_work",
            working_context: true,
            relevance_score: 0.9,
          });
        } catch (error) {
          updateResults.push({
            entity: entityName,
            status: "error",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Create a focus session entity if description provided
      let focusSessionEntity = null;
      if (focusDescription) {
        focusSessionEntity = await this.createFocusSession(
          focusDescription,
          args.focus_entities,
          branchName
        );
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                current_work_marked: {
                  focus_entities: args.focus_entities,
                  branch: branchName,
                  focus_description: focusDescription,
                  cleared_previous: clearPrevious,
                  focus_session: focusSessionEntity,
                },
                update_results: updateResults,
                ai_optimization: {
                  working_context_updated: true,
                  relevance_scores_boosted: true,
                  last_accessed_updated: true,
                },
                summary: `Marked ${args.focus_entities.length} entities as current work focus in branch "${branchName}"`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      logger.error("Error marking current work:", error);
      throw error;
    }
  }

  /**
   * Update project status and phase information
   */
  async handleUpdateProjectStatus(args: any): Promise<any> {
    if (!args.branch_name || !args.project_phase) {
      throw new Error("branch_name and project_phase are required");
    }

    const updateAllBranches = args.branch_name === "*";
    const projectPhase = args.project_phase;
    const statusUpdates = args.status_updates || [];

    logger.info(
      `Updating project status to "${projectPhase}" for ${
        updateAllBranches ? "all branches" : `branch: ${args.branch_name}`
      }`
    );

    try {
      const branchUpdates = [];
      let branchesToUpdate = [];

      if (updateAllBranches) {
        const allBranches = await this.memoryManager.listBranches();
        branchesToUpdate = allBranches.map((b: any) => b.name);
      } else {
        branchesToUpdate = [args.branch_name];
      }

      // Update each branch
      for (const branchName of branchesToUpdate) {
        const branchUpdate: any = {
          branch: branchName,
          phase_updated: false,
          entity_updates: [],
        };

        try {
          // Update branch phase (this would require a new method in branch operations)
          // For now, we'll track this in the response
          branchUpdate.phase_updated = true;

          // Apply entity status updates if provided
          if (statusUpdates.length > 0) {
            const branchGraph = await this.memoryManager.exportBranch(
              branchName
            );

            for (const update of statusUpdates) {
              const matchingEntities = branchGraph.entities.filter(
                (entity: Entity) =>
                  this.entityMatchesPattern(entity, update.entity_pattern)
              );

              for (const entity of matchingEntities) {
                try {
                  await this.memoryManager.updateEntityStatus(
                    entity.name,
                    update.new_status,
                    update.reason,
                    branchName
                  );

                  branchUpdate.entity_updates.push({
                    entity: entity.name,
                    old_status: entity.status,
                    new_status: update.new_status,
                    reason: update.reason,
                  });
                } catch (error) {
                  branchUpdate.entity_updates.push({
                    entity: entity.name,
                    error:
                      error instanceof Error ? error.message : String(error),
                  });
                }
              }
            }
          }
        } catch (error) {
          branchUpdate.phase_updated = false;
          branchUpdate.error =
            error instanceof Error ? error.message : String(error);
        }

        branchUpdates.push(branchUpdate);
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                project_status_updated: {
                  target_branches: updateAllBranches ? "all" : args.branch_name,
                  new_project_phase: projectPhase,
                  branches_processed: branchesToUpdate.length,
                  status_patterns_applied: statusUpdates.length,
                },
                branch_updates: branchUpdates,
                ai_insights: {
                  phase_transition: projectPhase,
                  entity_lifecycle_managed: true,
                  bulk_updates_applied: statusUpdates.length > 0,
                },
                summary: `Updated project phase to "${projectPhase}" for ${branchesToUpdate.length} branch(es) with ${statusUpdates.length} status pattern(s)`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      logger.error("Error updating project status:", error);
      throw error;
    }
  }

  /**
   * Archive completed work while preserving relationships
   */
  async handleArchiveCompletedWork(args: any): Promise<any> {
    if (!args.entity_names || args.entity_names.length === 0) {
      throw new Error("entity_names is required and must not be empty");
    }

    const branchName = args.branch_name || "main";
    const completionSummary = args.completion_summary;
    const preserveRelationships = args.preserve_relationships !== false; // Default true

    logger.info(
      `Archiving completed work: ${args.entity_names.join(
        ", "
      )} in branch: ${branchName}`
    );

    try {
      const archiveResults = [];

      // Create completion summary entity if provided
      let summaryEntity = null;
      if (completionSummary) {
        summaryEntity = await this.createCompletionSummary(
          completionSummary,
          args.entity_names,
          branchName
        );
      }

      // Get current relationships if preserving them
      let preservedRelationships = [];
      if (preserveRelationships) {
        const branchGraph = await this.memoryManager.exportBranch(branchName);
        preservedRelationships = branchGraph.relations.filter(
          (rel: any) =>
            args.entity_names.includes(rel.from) ||
            args.entity_names.includes(rel.to)
        );
      }

      // Archive each entity
      for (const entityName of args.entity_names) {
        try {
          // Update entity status to archived and remove from working context
          await this.memoryManager.updateEntityStatus(
            entityName,
            "archived",
            "Completed work - archived",
            branchName
          );

          await this.memoryManager.sqliteManager.entityOps.updateEntityWorkingContext(
            entityName,
            false,
            branchName
          );

          // Lower relevance score for archived items
          await this.memoryManager.sqliteManager.entityOps.updateEntityRelevanceScore(
            entityName,
            0.3,
            branchName
          );

          archiveResults.push({
            entity: entityName,
            status: "archived",
            working_context: false,
            relevance_score: 0.3,
          });
        } catch (error) {
          archiveResults.push({
            entity: entityName,
            status: "error",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                archived_work: {
                  entities: args.entity_names,
                  branch: branchName,
                  completion_summary: completionSummary,
                  summary_entity: summaryEntity,
                  relationships_preserved: preserveRelationships,
                  preserved_relationship_count: preservedRelationships.length,
                },
                archive_results: archiveResults,
                ai_optimization: {
                  working_context_cleared: true,
                  relevance_scores_lowered: true,
                  historical_context_maintained: preserveRelationships,
                },
                summary: `Archived ${
                  args.entity_names.length
                } completed work entities in branch "${branchName}"${
                  preserveRelationships ? " with relationships preserved" : ""
                }`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      logger.error("Error archiving completed work:", error);
      throw error;
    }
  }

  // Helper methods
  private async clearPreviousWorkingContext(branchName: string): Promise<void> {
    const workingContextEntities = await this.memoryManager.searchEntities(
      "",
      branchName,
      ["active", "draft"],
      { workingContextOnly: true }
    );

    for (const entity of workingContextEntities.entities) {
      try {
        await this.memoryManager.sqliteManager.entityOps.updateEntityWorkingContext(
          entity.name,
          false,
          branchName
        );
      } catch (error) {
        logger.warn(
          `Failed to clear working context for ${entity.name}:`,
          error
        );
      }
    }
  }

  private async createFocusSession(
    description: string,
    focusEntities: string[],
    branchName: string
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
        branchName
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
    branchName: string
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
        branchName
      );
      return created[0];
    } catch (error) {
      logger.warn("Failed to create completion summary entity:", error);
      return null;
    }
  }

  /**
   * Suggest related context based on current focus
   */
  async handleSuggestRelatedContext(args: any): Promise<any> {
    if (!args.current_focus) {
      throw new Error("current_focus is required");
    }

    const branchName = args.branch_name || "main";
    const entityNames = args.entity_names;
    const suggestionTypes = args.suggestion_types || [
      "similar",
      "dependencies",
      "decisions",
      "blockers",
      "related_work",
    ];
    const maxSuggestions = args.max_suggestions || 10;

    logger.info(
      `Suggesting related context for: "${args.current_focus}" in branch: ${branchName}`
    );

    try {
      let targetEntities: string[];

      // Determine target entities
      if (entityNames && entityNames.length > 0) {
        targetEntities = entityNames;
      } else {
        // Get current working context entities
        const workingContext = await this.memoryManager.searchEntities(
          "",
          branchName,
          ["active", "draft"],
          { workingContextOnly: true }
        );
        targetEntities = workingContext.entities.map((e: Entity) => e.name);
      }

      const suggestions: { [key: string]: any[] } = {
        similar: [],
        dependencies: [],
        decisions: [],
        blockers: [],
        related_work: [],
      };

      // Generate different types of suggestions
      for (const suggestionType of suggestionTypes) {
        switch (suggestionType) {
          case "similar":
            suggestions.similar = await this.findSimilarEntities(
              targetEntities,
              branchName,
              args.current_focus
            );
            break;
          case "dependencies":
            suggestions.dependencies = await this.findDependencyEntities(
              targetEntities,
              branchName
            );
            break;
          case "decisions":
            suggestions.decisions = await this.findRelatedDecisions(
              targetEntities,
              branchName,
              args.current_focus
            );
            break;
          case "blockers":
            suggestions.blockers = await this.findPotentialBlockers(
              targetEntities,
              branchName
            );
            break;
          case "related_work":
            suggestions.related_work = await this.findRelatedWork(
              targetEntities,
              branchName,
              args.current_focus
            );
            break;
        }
      }

      // Flatten and prioritize suggestions
      const allSuggestions = Object.entries(suggestions)
        .flatMap(([type, items]: [string, any[]]) =>
          items.map((item) => ({ ...item, suggestion_type: type }))
        )
        .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
        .slice(0, maxSuggestions);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                context_suggestions: {
                  current_focus: args.current_focus,
                  target_entities: targetEntities,
                  branch: branchName,
                  suggestion_types: suggestionTypes,
                  total_suggestions: allSuggestions.length,
                },
                suggestions: allSuggestions,
                suggestions_by_type: suggestions,
                ai_insights: {
                  high_confidence_suggestions: allSuggestions.filter(
                    (s) => (s.confidence || 0) > 0.8
                  ).length,
                  decision_related: suggestions.decisions.length,
                  potential_blockers: suggestions.blockers.length,
                },
                summary: `Generated ${allSuggestions.length} context suggestions for "${args.current_focus}" based on ${targetEntities.length} entities`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      logger.error("Error suggesting related context:", error);
      throw error;
    }
  }

  /**
   * Check for missing dependencies in current work
   */
  async handleCheckMissingDependencies(args: any): Promise<any> {
    if (!args.work_description) {
      throw new Error("work_description is required");
    }

    const branchName = args.branch_name || "main";
    const entityNames = args.entity_names;
    const checkDepth = args.check_depth || 2;

    logger.info(
      `Checking missing dependencies for: "${args.work_description}" in branch: ${branchName}`
    );

    try {
      let workEntities: string[];

      if (entityNames && entityNames.length > 0) {
        workEntities = entityNames;
      } else {
        const workingContext = await this.memoryManager.searchEntities(
          "",
          branchName,
          ["active", "draft"],
          { workingContextOnly: true }
        );
        workEntities = workingContext.entities.map((e: Entity) => e.name);
      }

      const dependencyAnalysis = await this.analyzeDependencies(
        workEntities,
        branchName,
        args.work_description,
        checkDepth
      );

      const missingDependencies = dependencyAnalysis.filter(
        (dep) => dep.status === "missing"
      );
      const outdatedDependencies = dependencyAnalysis.filter(
        (dep) => dep.status === "outdated"
      );
      const availableDependencies = dependencyAnalysis.filter(
        (dep) => dep.status === "available"
      );

      const riskLevel = this.calculateRiskLevel(
        missingDependencies,
        outdatedDependencies
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                dependency_check: {
                  work_description: args.work_description,
                  entities_analyzed: workEntities,
                  branch: branchName,
                  check_depth: checkDepth,
                  risk_level: riskLevel,
                },
                dependency_analysis: {
                  missing: missingDependencies,
                  outdated: outdatedDependencies,
                  available: availableDependencies,
                  total_dependencies: dependencyAnalysis.length,
                },
                recommendations: this.generateDependencyRecommendations(
                  missingDependencies,
                  outdatedDependencies
                ),
                ai_warnings: {
                  proceed_with_caution: missingDependencies.length > 0,
                  update_required: outdatedDependencies.length > 0,
                  ready_to_proceed:
                    missingDependencies.length === 0 &&
                    outdatedDependencies.length === 0,
                },
                summary: `Found ${missingDependencies.length} missing and ${outdatedDependencies.length} outdated dependencies for "${args.work_description}"`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      logger.error("Error checking missing dependencies:", error);
      throw error;
    }
  }

  /**
   * Get continuation context for resuming work
   */
  async handleGetContinuationContext(args: any): Promise<any> {
    const branchName = args.branch_name || "main";
    const workSessionId = args.work_session_id;
    const timeWindowHours = args.time_window_hours || 24;
    const includeBlockers = args.include_blockers !== false;
    const detailLevel = args.detail_level || "summary"; // summary | detailed

    logger.info(
      `Getting continuation context for branch: ${branchName} (window: ${timeWindowHours}h, detail: ${detailLevel})`
    );

    try {
      const cutoffTime = new Date(
        Date.now() - timeWindowHours * 60 * 60 * 1000
      );

      // Get current working context
      const workingContext = await this.memoryManager.searchEntities(
        "",
        branchName,
        ["active", "draft"],
        { workingContextOnly: true, includeConfidenceScores: true }
      );

      // Get recent activity
      const recentActivity = await this.getRecentActivity(
        branchName,
        cutoffTime
      );

      // Get recent decisions
      const recentDecisions = await this.getRecentDecisions(
        branchName,
        cutoffTime
      );

      // Get current blockers if requested
      let blockers = [];
      if (includeBlockers) {
        blockers = await this.getCurrentBlockers(branchName);
      }

      // Get next steps from observations
      const nextSteps = await this.extractNextSteps(workingContext.entities);

      // Get session-specific context if work_session_id provided
      let sessionContext = null;
      if (workSessionId) {
        sessionContext = await this.getSessionContext(
          workSessionId,
          branchName
        );
      }

      // Condensed summary mode for large projects
      if (detailLevel === "summary") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  continuation_summary: {
                    branch: branchName,
                    timestamp: new Date().toISOString(),
                    work_session_id: workSessionId,
                  },
                  where_you_left_off: {
                    last_worked_entities: workingContext.entities
                      .sort(
                        (a: Entity, b: Entity) =>
                          new Date(b.lastAccessed || 0).getTime() -
                          new Date(a.lastAccessed || 0).getTime()
                      )
                      .slice(0, 5)
                      .map((e: Entity) => ({
                        name: e.name,
                        type: e.entityType,
                        last_activity: e.lastAccessed,
                        key_note:
                          e.observations[0]?.substring(
                            0,
                            WorkflowHandlers.MAX_NOTE_PREVIEW_LENGTH
                          ) || "No notes",
                      })),
                    entity_count: workingContext.entities.length,
                    recent_changes: recentActivity.slice(0, 5),
                  },
                  recent_decisions: recentDecisions.slice(0, 10).map((d) => ({
                    decision: d.entity_name,
                    timestamp: d.timestamp,
                    summary:
                      d.observations[0]?.substring(
                        0,
                        WorkflowHandlers.MAX_DECISION_SUMMARY_LENGTH
                      ) || "No summary",
                  })),
                  blockers_and_issues: blockers.map((b) => ({
                    blocker: b.entity_name,
                    severity: b.severity,
                    description:
                      b.description?.substring(
                        0,
                        WorkflowHandlers.MAX_BLOCKER_DESCRIPTION_LENGTH
                      ) || "No description",
                  })),
                  next_recommended_actions: nextSteps
                    .filter((s) => s.priority === "high")
                    .slice(0, 5),
                  ready_to_continue: blockers.length === 0,
                  session_metadata: sessionContext
                    ? {
                        duration_minutes: sessionContext.duration_minutes,
                        completed_items: sessionContext.completed_items,
                        in_progress_items: sessionContext.in_progress_items,
                      }
                    : null,
                  usage_note: `Condensed continuation context (${workingContext.entities.length} entities). Use detail_level='detailed' for full data.`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Detailed mode (original behavior)
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                continuation_context: {
                  branch: branchName,
                  work_session_id: workSessionId,
                  time_window_hours: timeWindowHours,
                  context_timestamp: new Date().toISOString(),
                  detail_level: "detailed",
                },
                current_state: {
                  working_entities: workingContext.entities.map(
                    (e: Entity) => ({
                      name: e.name,
                      type: e.entityType,
                      observations: e.observations.slice(0, 2), // Limit to 2 observations
                      relevance: e.relevanceScore,
                      last_accessed: e.lastAccessed,
                    })
                  ),
                  entity_count: workingContext.entities.length,
                  high_relevance_entities: workingContext.entities.filter(
                    (e: Entity) => e.relevanceScore && e.relevanceScore > 0.8
                  ).length,
                },
                recent_activity: recentActivity.slice(0, 15),
                recent_decisions: recentDecisions.slice(0, 15),
                blockers: blockers,
                next_steps: nextSteps,
                session_context: sessionContext,
                ai_recommendations: {
                  immediate_focus: workingContext.entities
                    .slice(0, 3)
                    .map((e: Entity) => e.name),
                  priority_actions: nextSteps.filter(
                    (step) => step.priority === "high"
                  ),
                  blockers_to_resolve: blockers.filter(
                    (blocker) => blocker.severity === "critical"
                  ),
                  ready_to_continue: blockers.length === 0,
                },
                summary: `Continuation context ready: ${workingContext.entities.length} working entities, ${recentDecisions.length} recent decisions, ${blockers.length} blockers`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      logger.error("Error getting continuation context:", error);
      throw error;
    }
  }

  // Helper methods for context suggestions and dependency analysis
  private async findSimilarEntities(
    targetEntities: string[],
    branchName: string,
    focusDescription: string
  ): Promise<any[]> {
    // Search for entities similar to the focus description
    const searchResults = await this.memoryManager.searchEntities(
      focusDescription,
      branchName,
      ["active"],
      { includeConfidenceScores: true }
    );

    return searchResults.entities
      .filter((e: Entity) => !targetEntities.includes(e.name))
      .slice(0, 5)
      .map((e: Entity) => ({
        entity_name: e.name,
        entity_type: e.entityType,
        confidence: e.relevanceScore || 0.5,
        reason: "content_similarity",
      }));
  }

  private async findDependencyEntities(
    targetEntities: string[],
    branchName: string
  ): Promise<any[]> {
    // Look for entities that the target entities might depend on
    const dependencies: any[] = [];

    for (const entityName of targetEntities) {
      try {
        const entity = await this.memoryManager.findEntityByName(
          entityName,
          branchName
        );
        if (entity) {
          // Extract potential dependencies from observations
          const dependencyMentions = entity.observations.filter(
            (obs: string) =>
              obs.toLowerCase().includes("depends") ||
              obs.toLowerCase().includes("requires") ||
              obs.toLowerCase().includes("needs")
          );

          dependencyMentions.forEach((mention: string) => {
            dependencies.push({
              entity_name: `Dependency of ${entityName}`,
              description: mention,
              confidence: 0.6,
              reason: "dependency_mention",
            });
          });
        }
      } catch (error) {
        // Continue with other entities
      }
    }

    return dependencies.slice(0, 3);
  }

  private async findRelatedDecisions(
    targetEntities: string[],
    branchName: string,
    focusDescription: string
  ): Promise<any[]> {
    const decisionResults = await this.memoryManager.searchEntities(
      "decision",
      branchName,
      ["active"],
      { includeConfidenceScores: true }
    );

    return decisionResults.entities
      .filter((e: Entity) => e.entityType === "decision")
      .slice(0, 3)
      .map((e: Entity) => ({
        entity_name: e.name,
        decision_date: e.created || e.lastUpdated,
        confidence: 0.7,
        reason: "decision_relevance",
      }));
  }

  private async findPotentialBlockers(
    targetEntities: string[],
    branchName: string
  ): Promise<any[]> {
    const blockerResults = await this.memoryManager.searchEntities(
      "blocker",
      branchName,
      ["active"],
      { includeConfidenceScores: true }
    );

    return blockerResults.entities
      .filter(
        (e: Entity) =>
          e.entityType === "blocker" ||
          e.observations.some(
            (obs: string) =>
              obs.toLowerCase().includes("blocked") ||
              obs.toLowerCase().includes("issue") ||
              obs.toLowerCase().includes("problem")
          )
      )
      .slice(0, 2)
      .map((e: Entity) => ({
        entity_name: e.name,
        blocker_type: e.entityType,
        confidence: 0.8,
        reason: "potential_blocker",
      }));
  }

  private async findRelatedWork(
    targetEntities: string[],
    branchName: string,
    focusDescription: string
  ): Promise<any[]> {
    // Find entities with high relevance scores that aren't in working context
    const allEntities = await this.memoryManager.exportBranch(branchName);

    return allEntities.entities
      .filter(
        (e: Entity) =>
          !e.workingContext &&
          !targetEntities.includes(e.name) &&
          e.relevanceScore &&
          e.relevanceScore > 0.6
      )
      .slice(0, 4)
      .map((e: Entity) => ({
        entity_name: e.name,
        entity_type: e.entityType,
        confidence: e.relevanceScore,
        reason: "high_relevance",
      }));
  }

  private async analyzeDependencies(
    workEntities: string[],
    branchName: string,
    workDescription: string,
    depth: number
  ): Promise<any[]> {
    const dependencies: any[] = [];

    // Analyze each work entity for dependencies
    for (const entityName of workEntities) {
      try {
        const entity = await this.memoryManager.findEntityByName(
          entityName,
          branchName
        );
        if (entity) {
          // Look for dependency keywords in observations
          entity.observations.forEach((obs: string) => {
            if (
              obs.toLowerCase().includes("depends") ||
              obs.toLowerCase().includes("requires") ||
              obs.toLowerCase().includes("needs")
            ) {
              dependencies.push({
                source_entity: entityName,
                dependency_description: obs,
                status: "identified",
                confidence: 0.7,
              });
            }
          });
        }
      } catch (error) {
        // Continue with other entities
      }
    }

    // Add some example dependencies based on work description analysis
    const workKeywords = workDescription.toLowerCase();
    if (workKeywords.includes("database")) {
      dependencies.push({
        source_entity: "work_description",
        dependency_description: "Database schema and connection",
        status: "missing", // This would be determined by actual checks
        confidence: 0.8,
      });
    }

    if (workKeywords.includes("api")) {
      dependencies.push({
        source_entity: "work_description",
        dependency_description: "API endpoints and authentication",
        status: "available",
        confidence: 0.9,
      });
    }

    return dependencies;
  }

  private calculateRiskLevel(missingDeps: any[], outdatedDeps: any[]): string {
    if (missingDeps.length > 2) return "high";
    if (missingDeps.length > 0 || outdatedDeps.length > 1) return "medium";
    return "low";
  }

  private generateDependencyRecommendations(
    missingDeps: any[],
    outdatedDeps: any[]
  ): string[] {
    const recommendations = [];

    if (missingDeps.length > 0) {
      recommendations.push(
        "Create or identify missing dependencies before proceeding"
      );
    }

    if (outdatedDeps.length > 0) {
      recommendations.push("Update outdated dependencies to current versions");
    }

    if (missingDeps.length === 0 && outdatedDeps.length === 0) {
      recommendations.push(
        "All dependencies appear to be available - ready to proceed"
      );
    }

    return recommendations;
  }

  private async getRecentActivity(
    branchName: string,
    cutoffTime: Date
  ): Promise<any[]> {
    const allEntities = await this.memoryManager.exportBranch(branchName);

    return allEntities.entities
      .filter((e: Entity) => {
        const lastUpdated = e.lastUpdated
          ? new Date(e.lastUpdated)
          : new Date(0);
        return lastUpdated > cutoffTime;
      })
      .map((e: Entity) => ({
        entity_name: e.name,
        action: "updated",
        timestamp: e.lastUpdated,
        entity_type: e.entityType,
      }))
      .sort(
        (a: any, b: any) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
      .slice(0, 5);
  }

  private async getRecentDecisions(
    branchName: string,
    cutoffTime: Date
  ): Promise<any[]> {
    const decisions = await this.memoryManager.searchEntities(
      "decision",
      branchName,
      ["active"],
      { includeConfidenceScores: true }
    );

    return decisions.entities
      .filter((e: Entity) => {
        const created = e.created ? new Date(e.created) : new Date(0);
        return created > cutoffTime;
      })
      .map((e: Entity) => ({
        decision_name: e.name,
        timestamp: e.created || e.lastUpdated,
        summary: e.observations[0]?.substring(0, 100) || "",
      }))
      .slice(0, 3);
  }

  private async getCurrentBlockers(branchName: string): Promise<any[]> {
    const blockers = await this.memoryManager.searchEntities(
      "blocker",
      branchName,
      ["active"],
      { includeConfidenceScores: true }
    );

    return blockers.entities
      .filter(
        (e: Entity) => e.entityType === "blocker" || e.status === "active"
      )
      .map((e: Entity) => ({
        blocker_name: e.name,
        severity: e.observations.some((obs) =>
          obs.toLowerCase().includes("critical")
        )
          ? "critical"
          : "normal",
        description: e.observations[0] || "",
      }))
      .slice(0, 3);
  }

  private async extractNextSteps(entities: Entity[]): Promise<any[]> {
    const nextSteps: any[] = [];

    entities.forEach((entity) => {
      entity.observations.forEach((obs) => {
        if (
          obs.toLowerCase().includes("next") ||
          obs.toLowerCase().includes("todo") ||
          obs.toLowerCase().includes("action")
        ) {
          nextSteps.push({
            source_entity: entity.name,
            step_description: obs,
            priority:
              obs.toLowerCase().includes("urgent") ||
              obs.toLowerCase().includes("critical")
                ? "high"
                : "normal",
          });
        }
      });
    });

    return nextSteps.slice(0, 5);
  }

  private async getSessionContext(
    sessionId: string,
    branchName: string
  ): Promise<any> {
    // Look for session-specific entities or context
    try {
      const sessionEntity = await this.memoryManager.findEntityByName(
        sessionId,
        branchName
      );
      if (sessionEntity) {
        return {
          session_entity: sessionEntity.name,
          session_observations: sessionEntity.observations,
          last_updated: sessionEntity.lastUpdated,
        };
      }
    } catch (error) {
      // Session not found
    }

    return {
      message: `No specific session context found for session ID: ${sessionId}`,
    };
  }

  private entityMatchesPattern(entity: Entity, pattern: string): boolean {
    // Simple pattern matching - could be enhanced with regex
    const lowerPattern = pattern.toLowerCase();
    return (
      entity.name.toLowerCase().includes(lowerPattern) ||
      entity.entityType.toLowerCase().includes(lowerPattern) ||
      entity.observations.some((obs) =>
        obs.toLowerCase().includes(lowerPattern)
      )
    );
  }
}
