import { Entity, MemoryBranchInfo } from "../../memory-types.js";
import { BackgroundProcessor } from "../background-processor.js";
import { logger } from "../logger.js";

/**
 * AI Context Retrieval Handlers
 * Specialized handlers for AI agent context management and workflow optimization
 */
export class ContextHandlers {
  private memoryManager: any;
  private backgroundProcessor: BackgroundProcessor | null = null;

  constructor(memoryManager: any, backgroundProcessor?: BackgroundProcessor) {
    this.memoryManager = memoryManager;
    this.backgroundProcessor = backgroundProcessor || null;
  }

  /**
   * Suggest project context based on current work
   */
  async handleSuggestProjectContext(args: any): Promise<any> {
    const currentFile = args.current_file;
    const searchQuery = args.search_query;
    const activeInterfaces = args.active_interfaces || [];
    const sessionId = args.session_id;

    logger.info("Generating project context suggestions...");

    try {
      const contextEngine = this.backgroundProcessor?.getContextEngine();

      if (!contextEngine) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error:
                    "Context engine not available. Ensure background processor is running with project analysis enabled.",
                  status: "unavailable",
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }

      const suggestions = await contextEngine.generateContextSuggestions(
        {
          current_file: currentFile,
          search_query: searchQuery,
          working_interfaces: activeInterfaces,
        },
        sessionId
      );

      if (suggestions.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  suggestions: [],
                  count: 0,
                  context_source: "ml_context_engine",
                  diagnostics: {
                    context_engine_available: true,
                    current_file_provided: !!currentFile,
                    search_query_provided: !!searchQuery,
                    active_interfaces_count: activeInterfaces.length,
                    note: "No suggestions generated. This could mean: 1) Project hasn't been analyzed yet, 2) No embeddings exist for the codebase, or 3) Current context doesn't match any known patterns.",
                    suggestion:
                      "Try running analyze_project_structure first, or provide more specific context (file path, interfaces, or search query).",
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                suggestions,
                count: suggestions.length,
                context_source: "ml_context_engine",
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      logger.error("Error generating context suggestions:", error);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                error: error instanceof Error ? error.message : String(error),
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Recall all entities currently marked as working context
   * Returns condensed summary to minimize token usage on large projects
   */
  async handleRecallWorkingContext(args: any): Promise<any> {
    const branchName = args.branch_name || "main";
    const detailLevel = args.detail_level || "summary"; // summary | detailed | full
    const maxEntitiesSummary = args.max_entities || 10;

    logger.info(
      `Recalling working context from branch: ${branchName} (detail: ${detailLevel})`
    );

    try {
      // Get all entities with working_context flag set
      const workingContextResults = await this.memoryManager.searchEntities(
        "",
        branchName,
        ["active", "draft"],
        {
          workingContextOnly: true,
          includeConfidenceScores: true,
        }
      );

      const allEntities = workingContextResults.entities;

      // Generate condensed summary for large projects
      if (
        detailLevel === "summary" ||
        (detailLevel === "detailed" && allEntities.length > 50)
      ) {
        return this.generateContextSummary(
          allEntities,
          branchName,
          maxEntitiesSummary,
          workingContextResults.relations
        );
      }

      // Detailed mode: Include more entities but still limit data
      if (detailLevel === "detailed") {
        return this.generateDetailedContext(
          allEntities,
          branchName,
          workingContextResults.relations
        );
      }

      // Full mode: Return everything (legacy behavior)
      const uniqueRelations = this.removeDuplicateRelations(
        workingContextResults.relations
      );
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
                detail_level: "full",
                warning:
                  "Full detail mode may use significant tokens on large projects. Consider using detail_level='summary'.",
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
   * Generate condensed context summary (optimized for large projects)
   */
  private async generateContextSummary(
    entities: Entity[],
    branchName: string,
    maxEntities: number,
    relations: any[]
  ): Promise<any> {
    // Group entities by type and extract key info
    const byType = this.groupEntitiesByType(entities);
    const recentlyWorked = entities
      .filter((e) => e.lastAccessed)
      .sort(
        (a, b) =>
          new Date(b.lastAccessed!).getTime() -
          new Date(a.lastAccessed!).getTime()
      )
      .slice(0, maxEntities);

    const highPriority = entities
      .filter((e) => e.relevanceScore && e.relevanceScore > 0.8)
      .slice(0, maxEntities);

    // Extract rules and structures
    const rules = entities.filter(
      (e) =>
        e.entityType === "rule" ||
        e.entityType === "guideline" ||
        e.observations.some(
          (obs) =>
            obs.toLowerCase().includes("must") ||
            obs.toLowerCase().includes("rule")
        )
    );

    const knownIssues = entities.filter(
      (e) =>
        e.entityType === "issue" ||
        e.entityType === "blocker" ||
        e.observations.some(
          (obs) =>
            obs.toLowerCase().includes("bug") ||
            obs.toLowerCase().includes("issue")
        )
    );

    const structures = entities.filter(
      (e) =>
        e.entityType === "architecture" ||
        e.entityType === "pattern" ||
        e.entityType === "interface"
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              project_outline: {
                branch: branchName,
                total_entities: entities.length,
                entity_types: byType,
                detail_level: "summary",
              },
              last_worked_areas: recentlyWorked.map((e) => ({
                name: e.name,
                type: e.entityType,
                last_accessed: e.lastAccessed,
                relevance: e.relevanceScore,
                summary:
                  e.observations[0]?.substring(0, 150) || "No description",
              })),
              high_priority_items: highPriority.map((e) => ({
                name: e.name,
                type: e.entityType,
                relevance: e.relevanceScore,
                summary:
                  e.observations[0]?.substring(0, 150) || "No description",
              })),
              must_know_rules: rules.map((e) => ({
                name: e.name,
                rule: e.observations[0] || "See entity for details",
                importance: e.relevanceScore || 0.5,
              })),
              coding_structures: structures.slice(0, 10).map((e) => ({
                name: e.name,
                type: e.entityType,
                description:
                  e.observations[0]?.substring(0, 100) || "No description",
              })),
              known_issues: knownIssues.map((e) => ({
                name: e.name,
                issue:
                  e.observations[0]?.substring(0, 150) ||
                  "See entity for details",
                status: e.status,
              })),
              key_relationships: {
                total_relations: relations.length,
                relationship_types: this.countRelationTypes(relations),
                critical_dependencies: relations.filter(
                  (r) =>
                    r.relationType === "depends_on" ||
                    r.relationType === "requires"
                ).length,
              },
              usage_note: `Using summary mode to reduce token usage. ${entities.length} total entities condensed. Use detail_level='detailed' for more info or specify entity names directly.`,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  /**
   * Generate detailed context (middle ground between summary and full)
   */
  private async generateDetailedContext(
    entities: Entity[],
    branchName: string,
    relations: any[]
  ): Promise<any> {
    const byType = this.groupEntitiesByType(entities);
    const recentlyWorked = entities
      .filter((e) => e.lastAccessed)
      .sort(
        (a, b) =>
          new Date(b.lastAccessed!).getTime() -
          new Date(a.lastAccessed!).getTime()
      )
      .slice(0, 20);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              working_context: {
                branch: branchName,
                total_entities: entities.length,
                entity_types: byType,
                detail_level: "detailed",
              },
              recently_worked: recentlyWorked.map((e) => ({
                name: e.name,
                type: e.entityType,
                observations: e.observations.slice(0, 3), // Limit observations
                relevance: e.relevanceScore,
                last_accessed: e.lastAccessed,
                status: e.status,
              })),
              entity_summary_by_type: Object.entries(byType).map(
                ([type, count]) => ({
                  type,
                  count,
                  top_entities: entities
                    .filter((e) => e.entityType === type)
                    .slice(0, 5)
                    .map((e) => e.name),
                })
              ),
              relationships: {
                total: relations.length,
                types: this.countRelationTypes(relations),
                sample: relations.slice(0, 20), // Limit relation samples
              },
              usage_note: `Detailed mode active. Use detail_level='summary' for condensed view or detail_level='full' for complete data.`,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  private countRelationTypes(relations: any[]): { [key: string]: number } {
    return relations.reduce((acc, rel) => {
      acc[rel.relationType] = (acc[rel.relationType] || 0) + 1;
      return acc;
    }, {});
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
    try {
      // Get the SQLite relation operations from memory manager
      const relationOps = this.memoryManager.sqliteOps?.relationOps;

      if (!relationOps) {
        logger.warn("Relation operations not available");
        return [];
      }

      const branchId =
        await this.memoryManager.sqliteOps.connection.getBranchId(branchName);
      return await relationOps.getRelationsForEntities(entityNames, branchId);
    } catch (error) {
      logger.warn("Failed to fetch relations for entities:", error);
      return [];
    }
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
    try {
      const dependencies: any[] = [];
      const visited = new Set<string>();
      const queue: Array<{
        entity: string;
        currentDepth: number;
        path: string[];
      }> = entityNames.map((name) => ({
        entity: name,
        currentDepth: 0,
        path: [name],
      }));

      while (queue.length > 0) {
        const { entity, currentDepth, path } = queue.shift()!;

        if (visited.has(entity) || currentDepth >= depth) {
          continue;
        }

        visited.add(entity);

        // Get relations for this entity
        const relations = await this.getRelationsForEntities(
          [entity],
          branchName
        );

        for (const relation of relations) {
          // Track both dependencies (from -> to) and dependents (to -> from)
          if (relation.from === entity && !visited.has(relation.to)) {
            dependencies.push({
              from: relation.from,
              to: relation.to,
              type: relation.relationType,
              depth: currentDepth + 1,
              path: [...path, relation.to],
              direction: "depends_on",
              importance: this.assessDependencyImportance(
                relation.relationType
              ),
              status: "active",
            });

            if (currentDepth + 1 < depth) {
              queue.push({
                entity: relation.to,
                currentDepth: currentDepth + 1,
                path: [...path, relation.to],
              });
            }
          } else if (relation.to === entity && !visited.has(relation.from)) {
            dependencies.push({
              from: relation.from,
              to: relation.to,
              type: relation.relationType,
              depth: currentDepth + 1,
              path: [...path, relation.from],
              direction: "depended_by",
              importance: this.assessDependencyImportance(
                relation.relationType
              ),
              status: "active",
            });
          }
        }
      }

      return dependencies;
    } catch (error) {
      logger.error("Failed to trace dependencies:", error);
      return [];
    }
  }

  private assessDependencyImportance(relationType: string): string {
    const criticalTypes = ["requires", "depends_on", "implements", "extends"];
    const importantTypes = ["uses", "calls", "references"];

    if (criticalTypes.includes(relationType)) return "critical";
    if (importantTypes.includes(relationType)) return "important";
    return "optional";
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
