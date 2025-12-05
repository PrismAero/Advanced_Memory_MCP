import { Entity, MemoryBranchInfo } from "../../memory-types.js";
import { logger } from "../logger.js";

/**
 * AI Context Retrieval Handlers
 * Specialized handlers for AI agent context management and workflow optimization
 */
export class ContextHandlers {
  private memoryManager: any;

  constructor(memoryManager: any) {
    this.memoryManager = memoryManager;
  }

  /**
   * Recall all entities currently marked as working context
   */
  async handleRecallWorkingContext(args: any): Promise<any> {
    const branchName = args.branch_name || "main";
    const includeRelated = args.include_related !== false; // Default true
    const maxRelated = args.max_related || 10;

    logger.info(`Recalling working context from branch: ${branchName}`);

    try {
      // Get all entities with working_context flag set
      const workingContextResults = await this.memoryManager.searchEntities(
        "", // Empty query to get all
        branchName,
        ["active", "draft"], // Include active and draft entities
        {
          workingContextOnly: true,
          includeConfidenceScores: true,
        }
      );

      let allEntities = workingContextResults.entities;
      let allRelations = workingContextResults.relations;

      // Add related entities if requested
      if (includeRelated && workingContextResults.entities.length > 0) {
        logger.info(
          `Expanding working context with related entities (max: ${maxRelated})`
        );

        // Get entities with high relevance scores or recent access
        const relatedResults = await this.memoryManager.searchEntities(
          "", // Empty query
          branchName,
          ["active"],
          {
            includeContext: true,
            includeConfidenceScores: true,
          }
        );

        // Filter and add top related entities not already in working context
        const workingEntityNames = new Set(
          workingContextResults.entities.map((e: Entity) => e.name)
        );
        const relatedEntities = relatedResults.entities
          .filter(
            (e: Entity) =>
              !workingEntityNames.has(e.name) &&
              ((e.relevanceScore && e.relevanceScore > 0.6) ||
                (e.lastAccessed &&
                  new Date(e.lastAccessed) >
                    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))) // Last 7 days
          )
          .slice(0, maxRelated);

        allEntities = [...allEntities, ...relatedEntities];

        // Get relations for related entities
        if (relatedEntities.length > 0) {
          const relatedEntityNames = relatedEntities.map((e: Entity) => e.name);
          const contextRelations = await this.getRelationsForEntities(
            relatedEntityNames,
            branchName
          );
          allRelations = [...allRelations, ...contextRelations];
        }
      }

      // Remove duplicate relations
      const uniqueRelations = this.removeDuplicateRelations(allRelations);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                working_context: {
                  entities: allEntities,
                  relations: uniqueRelations,
                },
                branch: branchName,
                context_expansion: includeRelated,
                confidence_scores:
                  workingContextResults.confidence_scores || [],
                summary: `Found ${
                  workingContextResults.entities.length
                } working context entities${
                  includeRelated
                    ? ` with ${
                        allEntities.length -
                        workingContextResults.entities.length
                      } related entities`
                    : ""
                } in branch "${branchName}"`,
                ai_hints: {
                  active_entities: allEntities.filter(
                    (e: Entity) => e.workingContext
                  ).length,
                  high_relevance_entities: allEntities.filter(
                    (e: Entity) => e.relevanceScore && e.relevanceScore > 0.8
                  ).length,
                  recent_activity: allEntities.filter(
                    (e: Entity) =>
                      e.lastAccessed &&
                      new Date(e.lastAccessed) >
                        new Date(Date.now() - 24 * 60 * 60 * 1000)
                  ).length,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      logger.error("Error recalling working context:", error);
      throw error;
    }
  }

  /**
   * Get structured summary of project status across branches
   */
  async handleGetProjectStatus(args: any): Promise<any> {
    const includeInactive = args.include_inactive || false;
    const detailLevel = args.detail_level || "summary";

    logger.info(
      `Getting project status (detail: ${detailLevel}, include_inactive: ${includeInactive})`
    );

    try {
      // Get all branches
      const allBranches = await this.memoryManager.listBranches();

      // Filter based on include_inactive setting
      let branches = allBranches;
      if (!includeInactive) {
        branches = allBranches.filter(
          (branch: MemoryBranchInfo) =>
            branch.currentFocus || branch.name === "main"
        );
      }

      const branchStatuses = [];

      for (const branch of branches) {
        const branchInfo = await this.getBranchStatus(branch, detailLevel);
        branchStatuses.push(branchInfo);
      }

      // Get cross-branch statistics
      const totalEntities = branchStatuses.reduce(
        (sum, branch) => sum + branch.entity_count,
        0
      );
      const totalWorkingEntities = branchStatuses.reduce(
        (sum, branch) => sum + branch.working_entities,
        0
      );
      const activeBranches = branchStatuses.filter(
        (branch) => branch.current_focus
      ).length;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                project_status: {
                  overview: {
                    total_branches: branchStatuses.length,
                    active_branches: activeBranches,
                    total_entities: totalEntities,
                    working_context_entities: totalWorkingEntities,
                    detail_level: detailLevel,
                  },
                  branches: branchStatuses,
                },
                ai_insights: {
                  primary_focus:
                    branchStatuses.find(
                      (b) => b.current_focus && b.name !== "main"
                    )?.name || "main",
                  recent_activity: branchStatuses.filter(
                    (b) =>
                      b.last_updated &&
                      new Date(b.last_updated) >
                        new Date(Date.now() - 24 * 60 * 60 * 1000)
                  ).length,
                  needs_attention: branchStatuses
                    .filter(
                      (b) => b.working_entities > 0 && b.recent_decisions === 0
                    )
                    .map((b) => b.name),
                },
                summary: `Project has ${activeBranches} active branches with ${totalWorkingEntities} entities in working context`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      logger.error("Error getting project status:", error);
      throw error;
    }
  }

  /**
   * Find dependencies for entities
   */
  async handleFindDependencies(args: any): Promise<any> {
    const entityNames = args.entity_names;
    const branchName = args.branch_name || "main";
    const dependencyDepth = args.dependency_depth || 2;

    logger.info(
      `Finding dependencies for entities in branch: ${branchName} (depth: ${dependencyDepth})`
    );

    try {
      let targetEntities: string[];

      // If no entities specified, use working context entities
      if (!entityNames || entityNames.length === 0) {
        const workingContext = await this.memoryManager.searchEntities(
          "",
          branchName,
          ["active", "draft"],
          { workingContextOnly: true }
        );
        targetEntities = workingContext.entities.map((e: Entity) => e.name);

        if (targetEntities.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    dependencies: [],
                    message:
                      "No working context entities found to analyze dependencies for",
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }
      } else {
        targetEntities = entityNames;
      }

      const dependencies = await this.traceDependencies(
        targetEntities,
        branchName,
        dependencyDepth
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                dependencies: {
                  target_entities: targetEntities,
                  dependency_chain: dependencies,
                  total_dependencies: dependencies.length,
                  branch: branchName,
                  depth_analyzed: dependencyDepth,
                },
                ai_analysis: {
                  critical_dependencies: dependencies.filter(
                    (dep) => dep.importance === "critical"
                  ).length,
                  missing_dependencies: dependencies.filter(
                    (dep) => dep.status === "missing"
                  ).length,
                  outdated_dependencies: dependencies.filter(
                    (dep) => dep.status === "outdated"
                  ).length,
                },
                summary: `Found ${dependencies.length} dependencies for ${targetEntities.length} entities in branch "${branchName}"`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      logger.error("Error finding dependencies:", error);
      throw error;
    }
  }

  /**
   * Trace decision chain for entities
   */
  async handleTraceDecisionChain(args: any): Promise<any> {
    const entityName = args.entity_name;
    const branchName = args.branch_name || "main";
    const maxDecisions = args.max_decisions || 10;
    const timeWindowDays = args.time_window_days || 30;

    logger.info(
      `Tracing decision chain in branch: ${branchName} (window: ${timeWindowDays} days)`
    );

    try {
      let decisions: any[];

      if (entityName) {
        // Trace decisions for specific entity
        decisions = await this.getDecisionChainForEntity(
          entityName,
          branchName,
          maxDecisions,
          timeWindowDays
        );
      } else {
        // Get recent decisions across working context
        decisions = await this.getRecentDecisions(
          branchName,
          maxDecisions,
          timeWindowDays
        );
      }

      // Analyze decision patterns
      const decisionAnalysis = this.analyzeDecisionChain(decisions);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                decision_chain: {
                  target_entity: entityName || "working_context",
                  decisions,
                  branch: branchName,
                  time_window_days: timeWindowDays,
                  total_decisions: decisions.length,
                },
                analysis: decisionAnalysis,
                ai_insights: {
                  decision_velocity:
                    decisions.length / Math.min(timeWindowDays, 30), // decisions per day
                  recent_trend: decisions
                    .slice(0, 3)
                    .map((d) => d.decision_type),
                  blocked_decisions: decisions.filter(
                    (d) => d.status === "blocked"
                  ).length,
                  pending_decisions: decisions.filter(
                    (d) => d.status === "pending"
                  ).length,
                },
                summary: `Traced ${
                  decisions.length
                } decisions in ${timeWindowDays}-day window for ${
                  entityName || "working context"
                } in branch "${branchName}"`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      logger.error("Error tracing decision chain:", error);
      throw error;
    }
  }

  // Helper methods
  private async getBranchStatus(
    branch: MemoryBranchInfo,
    detailLevel: string
  ): Promise<any> {
    const branchGraph = await this.memoryManager.exportBranch(branch.name);

    const workingEntities = branchGraph.entities.filter(
      (e: Entity) => e.workingContext
    ).length;
    const highRelevanceEntities = branchGraph.entities.filter(
      (e: Entity) => e.relevanceScore && e.relevanceScore > 0.7
    ).length;

    const recentDecisions = branchGraph.entities.filter(
      (e: Entity) =>
        e.entityType === "decision" &&
        e.lastUpdated &&
        new Date(e.lastUpdated) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    ).length;

    const baseInfo = {
      name: branch.name,
      purpose: branch.purpose,
      entity_count: branch.entityCount,
      working_entities: workingEntities,
      high_relevance_entities: highRelevanceEntities,
      recent_decisions: recentDecisions,
      current_focus: branch.currentFocus || false,
      project_phase: branch.projectPhase || "active-development",
      last_updated: branch.lastUpdated,
    };

    if (detailLevel === "comprehensive") {
      return {
        ...baseInfo,
        entities_by_type: this.groupEntitiesByType(branchGraph.entities),
        recent_activity: this.getRecentActivity(branchGraph.entities),
        relationship_density:
          branchGraph.relations.length /
          Math.max(branchGraph.entities.length, 1),
      };
    }

    return baseInfo;
  }

  private async getRelationsForEntities(
    entityNames: string[],
    branchName: string
  ): Promise<any[]> {
    // This would typically call the relation operations to get relations
    // For now, return empty array as placeholder
    return [];
  }

  private removeDuplicateRelations(relations: any[]): any[] {
    const seen = new Set();
    return relations.filter((relation) => {
      const key = `${relation.from}-${relation.to}-${relation.relationType}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private async traceDependencies(
    entityNames: string[],
    branchName: string,
    depth: number
  ): Promise<any[]> {
    // Placeholder for dependency tracing logic
    // Would analyze relationships and determine dependencies
    return [];
  }

  private async getDecisionChainForEntity(
    entityName: string,
    branchName: string,
    maxDecisions: number,
    timeWindowDays: number
  ): Promise<any[]> {
    // Placeholder for decision chain tracing
    return [];
  }

  private async getRecentDecisions(
    branchName: string,
    maxDecisions: number,
    timeWindowDays: number
  ): Promise<any[]> {
    const cutoffDate = new Date(
      Date.now() - timeWindowDays * 24 * 60 * 60 * 1000
    );

    // Search for entities with decision observation types
    const results = await this.memoryManager.searchEntities(
      "",
      branchName,
      ["active", "draft"],
      {
        includeConfidenceScores: true,
      }
    );

    // Filter for recent decisions and format
    return results.entities
      .filter(
        (entity: Entity) =>
          entity.lastUpdated &&
          new Date(entity.lastUpdated) > cutoffDate &&
          (entity.entityType === "decision" ||
            entity.observations.some(
              (obs) => obs.includes("decision") || obs.includes("decided")
            ))
      )
      .slice(0, maxDecisions)
      .map((entity: Entity) => ({
        entity_name: entity.name,
        decision_type: entity.entityType,
        timestamp: entity.lastUpdated,
        observations: entity.observations,
        status: entity.status,
        relevance_score: entity.relevanceScore,
      }));
  }

  private analyzeDecisionChain(decisions: any[]): any {
    const decisionTypes: { [key: string]: number } = decisions.reduce(
      (acc: { [key: string]: number }, decision) => {
        acc[decision.decision_type] = (acc[decision.decision_type] || 0) + 1;
        return acc;
      },
      {}
    );

    return {
      decision_types: decisionTypes,
      chronological_flow: decisions.map((d) => ({
        date: d.timestamp,
        type: d.decision_type,
        summary: d.observations[0]?.substring(0, 100) || "",
      })),
      patterns: {
        most_common_type:
          Object.entries(decisionTypes).sort(
            ([, a], [, b]) => (b as number) - (a as number)
          )[0]?.[0] || null,
        decision_frequency:
          decisions.length > 1 &&
          decisions[0].timestamp &&
          decisions[decisions.length - 1].timestamp
            ? Math.round(
                (new Date(decisions[0].timestamp).getTime() -
                  new Date(
                    decisions[decisions.length - 1].timestamp
                  ).getTime()) /
                  (1000 * 60 * 60 * 24) /
                  decisions.length
              )
            : 0,
      },
    };
  }

  private groupEntitiesByType(entities: Entity[]): { [key: string]: number } {
    return entities.reduce((acc: { [key: string]: number }, entity) => {
      acc[entity.entityType] = (acc[entity.entityType] || 0) + 1;
      return acc;
    }, {});
  }

  private getRecentActivity(entities: Entity[]): any[] {
    const recentCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    return entities
      .filter(
        (entity) =>
          entity.lastUpdated && new Date(entity.lastUpdated) > recentCutoff
      )
      .map((entity) => ({
        name: entity.name,
        type: entity.entityType,
        action: "updated",
        timestamp: entity.lastUpdated || "",
      }))
      .sort((a, b) => {
        const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 10);
  }
}
