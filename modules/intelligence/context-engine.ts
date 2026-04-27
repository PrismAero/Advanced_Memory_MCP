import { Entity, KnowledgeGraph } from "../../memory-types.js";
import { logger } from "../logger.js";
import { ProjectEmbeddingEngine } from "../ml/project-embedding-engine.js";
import { InterfaceMapper } from "../project-analysis/interface-mapper.js";
import {
  CodeInterfaceRecord,
  ProjectAnalysisOperations,
} from "../sqlite/project-analysis-operations.js";
import { ContextScorer } from "./context-scorer.js";
import { IntelligenceEvidenceBuilder } from "./evidence-builder.js";
import type { IntelligenceEvidence } from "./evidence-types.js";

/**
 * Context suggestion types
 */
export type ContextSuggestionType =
  | "interface_context"
  | "import_suggestion"
  | "dependency_prediction"
  | "related_component"
  | "monorepo_module"
  | "api_integration"
  | "state_management"
  | "similar_implementation"
  | "refactoring_opportunity";

/**
 * Context suggestion
 */
export interface ContextSuggestion {
  type: ContextSuggestionType;
  title: string;
  description: string;
  relevance_score: number;
  confidence: number;
  suggested_action?: string;
  code_examples?: string[];
  related_files?: string[];
  related_interfaces?: string[];
  reasoning: string;
  metadata?: {
    import_path?: string;
    package_name?: string;
    interface_name?: string;
    similarity_score?: number;
    usage_frequency?: number;
  };
}

/**
 * Context search result
 */
export interface EnhancedSearchResult extends Entity {
  context_suggestions: ContextSuggestion[];
  related_interfaces: Array<{
    interface: CodeInterfaceRecord;
    relationship: string;
    relevance_score: number;
  }>;
  suggested_imports: Array<{
    import_path: string;
    symbols: string[];
    reasoning: string;
  }>;
  monorepo_connections: Array<{
    module_name: string;
    module_path: string;
    connection_type: string;
    shared_interfaces?: string[];
  }>;
}

/**
 * Working context
 */
export interface WorkingContext {
  current_files: string[];
  active_interfaces: string[];
  recent_searches: string[];
  working_entities: Entity[];
  project_focus: string;
  session_id: string;
  context_graph: {
    nodes: Array<{ id: string; type: string; relevance: number }>;
    edges: Array<{
      from: string;
      to: string;
      relationship: string;
      strength: number;
    }>;
  };
}

/**
 * Context prediction
 */
export interface ContextPrediction {
  predicted_needs: Array<{
    type: "interface" | "import" | "component" | "utility";
    name: string;
    confidence: number;
    reasoning: string;
    suggested_location?: string;
  }>;
  potential_integrations: Array<{
    target_system: string;
    integration_type: string;
    required_interfaces: string[];
    complexity_estimate: "low" | "medium" | "high";
  }>;
  refactoring_opportunities: Array<{
    opportunity_type: string;
    affected_files: string[];
    potential_benefit: string;
    effort_estimate: "low" | "medium" | "high";
  }>;
}

/**
 * Context Engine
 * Provides intelligent, proactive context suggestions for development workflows
 */
export class ContextEngine {
  private embeddingEngine: ProjectEmbeddingEngine;
  private interfaceMapper: InterfaceMapper;
  private projectAnalysisOps: ProjectAnalysisOperations;
  private evidenceBuilder: IntelligenceEvidenceBuilder;
  private scorer = new ContextScorer();
  private workingContexts = new Map<string, WorkingContext>();
  private suggestionCache = new Map<string, ContextSuggestion[]>();
  private contextPredictionCache = new Map<string, ContextPrediction>();
  private maxWorkingContexts = 100;
  private maxSuggestionCacheEntries = 200;
  private maxPredictionCacheEntries = 100;

  constructor(
    embeddingEngine: ProjectEmbeddingEngine,
    interfaceMapper: InterfaceMapper,
    projectAnalysisOps: ProjectAnalysisOperations,
  ) {
    this.embeddingEngine = embeddingEngine;
    this.interfaceMapper = interfaceMapper;
    this.projectAnalysisOps = projectAnalysisOps;
    this.evidenceBuilder = new IntelligenceEvidenceBuilder(projectAnalysisOps);

    logger.debug("Context engine initialized");
  }

  getEvidenceBuilder(): IntelligenceEvidenceBuilder {
    return this.evidenceBuilder;
  }

  buildProjectEvidence(options: {
    currentFile?: string;
    searchQuery?: string;
    activeInterfaces?: string[];
  }): Promise<IntelligenceEvidence> {
    return this.evidenceBuilder.buildProjectEvidence(options);
  }

  /**
   * Enhance search results with contextual information
   */
  async enhanceSearchResults(
    originalResults: KnowledgeGraph,
    searchQuery: string,
    sessionId?: string,
  ): Promise<EnhancedSearchResult[]> {
    const enhancedResults: EnhancedSearchResult[] = [];

    for (const entity of originalResults.entities) {
      try {
        const enhanced = await this.enhanceEntityWithContext(
          entity,
          searchQuery,
          sessionId,
        );
        enhancedResults.push(enhanced);
      } catch (error) {
        logger.warn(`Failed to enhance entity ${entity.name}:`, error);
        // Fallback to original entity with empty context
        enhancedResults.push({
          ...entity,
          context_suggestions: [],
          related_interfaces: [],
          suggested_imports: [],
          monorepo_connections: [],
        });
      }
    }

    return enhancedResults;
  }

  /**
   * Generate proactive context suggestions for current work
   */
  async generateContextSuggestions(
    currentContext: {
      current_file?: string;
      search_query?: string;
      active_entities?: Entity[];
      working_interfaces?: string[];
    },
    sessionId?: string,
  ): Promise<ContextSuggestion[]> {
    const cacheKey = this.createSuggestionCacheKey(currentContext, sessionId);

    // Check cache
    if (this.suggestionCache.has(cacheKey)) {
      return this.suggestionCache.get(cacheKey)!;
    }

    const suggestions: ContextSuggestion[] = [];

    // Generate different types of suggestions
    const interfaceContextSuggestions =
      await this.generateInterfaceContextSuggestions(currentContext);
    const importSuggestions =
      await this.generateImportSuggestions(currentContext);
    const dependencySuggestions =
      await this.generateDependencyPredictions(currentContext);
    const componentSuggestions =
      await this.generateRelatedComponentSuggestions(currentContext);
    const monorepoSuggestions =
      await this.generateMonorepoModuleSuggestions(currentContext);
    const evidenceSuggestions =
      await this.generateEvidenceSuggestions(currentContext);

    suggestions.push(
      ...interfaceContextSuggestions,
      ...importSuggestions,
      ...dependencySuggestions,
      ...componentSuggestions,
      ...monorepoSuggestions,
      ...evidenceSuggestions,
    );

    // Sort by relevance and confidence
    const sortedSuggestions = suggestions
      .sort(
        (a, b) =>
          b.relevance_score * b.confidence - a.relevance_score * a.confidence,
      )
      .slice(0, 20); // Limit to top 20 suggestions

    // Cache the results
    this.suggestionCache.set(cacheKey, sortedSuggestions);
    this.trimMap(this.suggestionCache, this.maxSuggestionCacheEntries);

    return sortedSuggestions;
  }

  /**
   * Predict context needs based on current development patterns
   */
  async predictContextNeeds(
    workingContext: WorkingContext,
  ): Promise<ContextPrediction> {
    const cacheKey = `prediction_${
      workingContext.session_id
    }_${workingContext.current_files.join(",")}`;

    if (this.contextPredictionCache.has(cacheKey)) {
      return this.contextPredictionCache.get(cacheKey)!;
    }

    const prediction: ContextPrediction = {
      predicted_needs: [],
      potential_integrations: [],
      refactoring_opportunities: [],
    };

    // Analyze current working patterns
    const patterns = await this.analyzeWorkingPatterns(workingContext);

    // Predict interface needs
    prediction.predicted_needs.push(
      ...(await this.predictInterfaceNeeds(patterns)),
    );

    // Predict import needs
    prediction.predicted_needs.push(
      ...(await this.predictImportNeeds(patterns)),
    );

    // Find integration opportunities
    prediction.potential_integrations.push(
      ...(await this.findIntegrationOpportunities(workingContext)),
    );

    // Identify refactoring opportunities
    prediction.refactoring_opportunities.push(
      ...(await this.identifyRefactoringOpportunities(workingContext)),
    );

    // Cache the prediction
    this.contextPredictionCache.set(cacheKey, prediction);
    this.trimMap(this.contextPredictionCache, this.maxPredictionCacheEntries);

    return prediction;
  }

  /**
   * Update working context
   */
  updateWorkingContext(
    sessionId: string,
    updates: Partial<WorkingContext>,
  ): void {
    const existing = this.workingContexts.get(sessionId) || {
      current_files: [],
      active_interfaces: [],
      recent_searches: [],
      working_entities: [],
      project_focus: "",
      session_id: sessionId,
      context_graph: { nodes: [], edges: [] },
    };

    const updated = { ...existing, ...updates, session_id: sessionId };
    this.workingContexts.set(sessionId, updated);
    this.trimMap(this.workingContexts, this.maxWorkingContexts);

    // Clear related caches
    this.clearCachesForSession(sessionId);
  }

  /**
   * Get working context for session
   */
  getWorkingContext(sessionId: string): WorkingContext | null {
    return this.workingContexts.get(sessionId) || null;
  }

  // Private helper methods

  /**
   * Enhance single entity with context
   */
  private async enhanceEntityWithContext(
    entity: Entity,
    searchQuery: string,
    sessionId?: string,
  ): Promise<EnhancedSearchResult> {
    const enhanced: EnhancedSearchResult = {
      ...entity,
      context_suggestions: [],
      related_interfaces: [],
      suggested_imports: [],
      monorepo_connections: [],
    };

    // Find related interfaces
    enhanced.related_interfaces =
      await this.findRelatedInterfacesForEntity(entity);

    // Generate context suggestions
    enhanced.context_suggestions = await this.generateEntityContextSuggestions(
      entity,
      searchQuery,
    );

    // Suggest imports
    enhanced.suggested_imports = await this.suggestImportsForEntity(entity);

    // Find monorepo connections
    enhanced.monorepo_connections =
      await this.findMonorepoConnectionsForEntity(entity);

    return enhanced;
  }

  /**
   * Generate interface context suggestions
   */
  private async generateInterfaceContextSuggestions(currentContext: {
    current_file?: string;
    search_query?: string;
    active_entities?: Entity[];
    working_interfaces?: string[];
  }): Promise<ContextSuggestion[]> {
    const suggestions: ContextSuggestion[] = [];

    if (
      currentContext.working_interfaces &&
      currentContext.working_interfaces.length > 0
    ) {
      // Find interfaces related to current working interfaces
      for (const interfaceName of currentContext.working_interfaces) {
        try {
          const interfaces = await this.projectAnalysisOps.getCodeInterfaces({
            name: interfaceName,
            limit: 5,
          });

          for (const iface of interfaces) {
            // Find similar interfaces
            const similarInterfaces = await this.findSimilarInterfaces(iface);

            for (const similar of similarInterfaces.slice(0, 3)) {
              suggestions.push({
                type: "interface_context",
                title: `Related Interface: ${similar.interface.name}`,
                description: `Interface similar to ${interfaceName} with ${similar.shared_properties.length} shared properties`,
                relevance_score: similar.similarity_score,
                confidence: 0.8,
                suggested_action: `Consider using ${similar.interface.name} for consistency`,
                reasoning: similar.reasoning,
                metadata: {
                  interface_name: similar.interface.name,
                  similarity_score: similar.similarity_score,
                },
              });
            }
          }
        } catch (error) {
          logger.debug(
            `Failed to find related interfaces for ${interfaceName}:`,
            error,
          );
        }
      }
    }

    return suggestions;
  }

  /**
   * Generate import suggestions
   */
  private async generateImportSuggestions(currentContext: {
    current_file?: string;
    search_query?: string;
    active_entities?: Entity[];
    working_interfaces?: string[];
  }): Promise<ContextSuggestion[]> {
    const suggestions: ContextSuggestion[] = [];

    if (currentContext.current_file) {
      try {
        // Analyze current file dependencies
        const dependencies =
          await this.projectAnalysisOps.getProjectDependencies({
            // This would need the file ID - simplified for now
            limit: 20,
          });

        // Find commonly used imports that might be missing
        const commonImports = this.analyzeCommonImportPatterns(dependencies);

        for (const commonImport of commonImports.slice(0, 5)) {
          suggestions.push({
            type: "import_suggestion",
            title: `Suggested Import: ${commonImport.symbol}`,
            description: `Commonly imported from ${commonImport.package}`,
            relevance_score: commonImport.frequency / 100, // Normalize frequency
            confidence: 0.7,
            suggested_action: `Add: import { ${commonImport.symbol} } from '${commonImport.package}'`,
            reasoning: `Used in ${commonImport.frequency} similar contexts`,
            metadata: {
              import_path: commonImport.package,
              package_name: commonImport.package,
            },
          });
        }
      } catch (error) {
        logger.debug("Failed to generate import suggestions:", error);
      }
    }

    return suggestions;
  }

  /**
   * Generate dependency predictions
   */
  private async generateDependencyPredictions(currentContext: {
    current_file?: string;
    search_query?: string;
    active_entities?: Entity[];
    working_interfaces?: string[];
  }): Promise<ContextSuggestion[]> {
    const suggestions: ContextSuggestion[] = [];

    // This would analyze patterns and predict needed dependencies
    // For now, providing a simplified implementation

    if (currentContext.search_query) {
      const query = currentContext.search_query.toLowerCase();

      // Predict based on query content
      if (
        query.includes("api") ||
        query.includes("fetch") ||
        query.includes("request")
      ) {
        suggestions.push({
          type: "dependency_prediction",
          title: "HTTP Client Dependency",
          description: "You might need an HTTP client library for API requests",
          relevance_score: 0.8,
          confidence: 0.6,
          suggested_action: "Consider adding axios or fetch utilities",
          reasoning: "Query suggests API integration work",
          metadata: {
            package_name: "axios",
          },
        });
      }

      if (
        query.includes("state") ||
        query.includes("store") ||
        query.includes("redux")
      ) {
        suggestions.push({
          type: "dependency_prediction",
          title: "State Management",
          description: "State management solution might be needed",
          relevance_score: 0.7,
          confidence: 0.6,
          suggested_action: "Consider Redux, Zustand, or React Context",
          reasoning: "Query suggests state management requirements",
        });
      }
    }

    return suggestions;
  }

  /**
   * Generate related component suggestions
   */
  private async generateRelatedComponentSuggestions(currentContext: {
    current_file?: string;
    search_query?: string;
    active_entities?: Entity[];
    working_interfaces?: string[];
  }): Promise<ContextSuggestion[]> {
    const suggestions: ContextSuggestion[] = [];

    if (currentContext.active_entities) {
      for (const entity of currentContext.active_entities.slice(0, 3)) {
        if (entity.entityType === "component") {
          // Find similar components using embedding similarity
          try {
            const similarEntities =
              await this.findSimilarEntitiesByEmbedding(entity);

            for (const similar of similarEntities.slice(0, 2)) {
              suggestions.push({
                type: "related_component",
                title: `Related Component: ${similar.entity.name}`,
                description: `Similar component with ${(
                  similar.similarity * 100
                ).toFixed(0)}% similarity`,
                relevance_score: similar.similarity,
                confidence: similar.confidence,
                suggested_action: `Review ${similar.entity.name} for reusable patterns`,
                reasoning: similar.reasoning,
                metadata: {
                  similarity_score: similar.similarity,
                },
              });
            }
          } catch (error) {
            logger.debug(
              `Failed to find similar entities for ${entity.name}:`,
              error,
            );
          }
        }
      }
    }

    return suggestions;
  }

  /**
   * Generate monorepo module suggestions
   */
  private async generateMonorepoModuleSuggestions(currentContext: {
    current_file?: string;
    search_query?: string;
    active_entities?: Entity[];
    working_interfaces?: string[];
  }): Promise<ContextSuggestion[]> {
    const suggestions: ContextSuggestion[] = [];

    // Get workspace context to check for monorepo structure
    try {
      const workspaceContexts = await this.projectAnalysisOps.getProjectFiles({
        category: "config",
        limit: 10,
      });

      // Look for package.json files that indicate workspaces
      const workspaceFiles = workspaceContexts.filter(
        (f) =>
          f.file_path.includes("package.json") && f.relative_path.includes("/"),
      );

      for (const workspace of workspaceFiles.slice(0, 3)) {
        const moduleName = workspace.relative_path.split("/")[0];

        suggestions.push({
          type: "monorepo_module",
          title: `Related Module: ${moduleName}`,
          description: `Workspace module that might have shared utilities`,
          relevance_score: 0.6,
          confidence: 0.5,
          suggested_action: `Explore ${moduleName} for reusable components`,
          reasoning: "Found in monorepo workspace structure",
          metadata: {
            package_name: moduleName,
          },
        });
      }
    } catch (error) {
      logger.debug("Failed to generate monorepo suggestions:", error);
    }

    return suggestions;
  }

  private async generateEvidenceSuggestions(currentContext: {
    current_file?: string;
    search_query?: string;
    active_entities?: Entity[];
    working_interfaces?: string[];
  }): Promise<ContextSuggestion[]> {
    const evidence = await this.evidenceBuilder.buildProjectEvidence({
      currentFile: currentContext.current_file,
      searchQuery: currentContext.search_query,
      activeInterfaces: currentContext.working_interfaces || [],
    });
    return this.scorer
      .scoreEvidence(evidence)
      .slice(0, 8)
      .map((item) => ({
        type:
          item.kind === "interface"
            ? "interface_context"
            : item.kind === "dependency"
              ? "dependency_prediction"
              : item.kind === "file"
                ? "similar_implementation"
                : "related_component",
        title: `${item.kind}: ${item.name}`,
        description: item.why,
        relevance_score: item.score,
        confidence: 0.75,
        suggested_action: `Review ${item.name}`,
        related_files: item.kind === "file" && item.ref ? [item.ref] : undefined,
        related_interfaces:
          item.kind === "interface" ? [item.name] : undefined,
        reasoning: item.why,
      }));
  }

  // Additional helper methods would go here...

  private async findRelatedInterfacesForEntity(entity: Entity): Promise<any[]> {
    const terms = [entity.name, entity.entityType, ...entity.observations]
      .join(" ")
      .split(/[^A-Za-z0-9_:]+/)
      .filter((term) => term.length >= 4)
      .slice(0, 6);
    const byId = new Map<number, CodeInterfaceRecord>();
    for (const term of terms) {
      const interfaces = await this.projectAnalysisOps.getCodeInterfaces({
        name: term,
        limit: 5,
      });
      for (const iface of interfaces) {
        if (iface.id) byId.set(iface.id, iface);
      }
      if (byId.size >= 10) break;
    }
    return Array.from(byId.values())
      .slice(0, 10)
      .map((iface) => ({
        interface: iface,
        relationship: "text_evidence",
        relevance_score: 0.65,
      }));
  }

  private async generateEntityContextSuggestions(
    entity: Entity,
    searchQuery: string,
  ): Promise<ContextSuggestion[]> {
    const suggestions: ContextSuggestion[] = [];
    for (const observation of entity.observations.slice(0, 8)) {
      if (/block|risk|fail|error/i.test(observation)) {
        suggestions.push({
          type: "refactoring_opportunity",
          title: `Risk: ${entity.name}`,
          description: observation,
          relevance_score: 0.9,
          confidence: 0.75,
          suggested_action: "Inspect blocker before changing related code",
          reasoning: "Observation contains blocker/risk language",
        });
      } else if (/next|todo|action|need|must/i.test(observation)) {
        suggestions.push({
          type: "related_component",
          title: `Next action: ${entity.name}`,
          description: observation,
          relevance_score: 0.8,
          confidence: 0.7,
          suggested_action: observation,
          reasoning: "Observation contains next-action language",
        });
      }
    }
    if (
      searchQuery &&
      entity.observations.some((obs) =>
        obs.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    ) {
      suggestions.push({
        type: "similar_implementation",
        title: `Direct memory hit: ${entity.name}`,
        description: `${entity.name} directly mentions the query`,
        relevance_score: 0.9,
        confidence: 0.85,
        reasoning: "Query text appears in entity observations",
      });
    }
    return suggestions.slice(0, 5);
  }

  private async suggestImportsForEntity(entity: Entity): Promise<any[]> {
    const terms = [entity.name, ...entity.observations]
      .join(" ")
      .split(/[^A-Za-z0-9_./:-]+/)
      .filter((term) => term.length >= 4)
      .slice(0, 8);
    const deps = await this.projectAnalysisOps.getProjectDependencies({ limit: 100 });
    return deps
      .filter((dep) =>
        terms.some((term) =>
          `${dep.source_identifier} ${dep.target_identifier || ""} ${
            dep.external_package || ""
          }`
            .toLowerCase()
            .includes(term.toLowerCase()),
        ),
      )
      .slice(0, 5)
      .map((dep) => ({
        import_path: dep.external_package || dep.source_identifier,
        symbols: [dep.target_identifier || dep.source_identifier].filter(Boolean),
        reasoning: `${dep.dependency_type}:${dep.resolution_status}`,
      }));
  }

  private async findMonorepoConnectionsForEntity(
    entity: Entity,
  ): Promise<any[]> {
    const files = await this.projectAnalysisOps.getProjectFiles({
      category: "config",
      limit: 50,
    });
    const entityText = `${entity.name} ${entity.observations.join(" ")}`.toLowerCase();
    return files
      .filter((file) => {
        const moduleName = file.relative_path.split(/[\\/]/)[0]?.toLowerCase();
        return moduleName && entityText.includes(moduleName);
      })
      .slice(0, 5)
      .map((file) => ({
        module_name: file.relative_path.split(/[\\/]/)[0],
        module_path: file.relative_path,
        connection_type: "text_reference",
      }));
  }

  private async findSimilarInterfaces(
    iface: CodeInterfaceRecord,
  ): Promise<any[]> {
    const candidates = await this.projectAnalysisOps.getCodeInterfaces({
      language: iface.language,
      kind: iface.kind,
      limit: 50,
    });
    const similar = await this.embeddingEngine.findSimilarInterfaces(
      iface,
      candidates.filter((candidate) => candidate.id !== iface.id),
      0.65,
    );
    return similar.slice(0, 5).map((result) => ({
      interface: result.interface,
      shared_properties: [],
      similarity_score: result.similarity,
      reasoning: result.reasoning,
    }));
  }

  private analyzeCommonImportPatterns(dependencies: any[]): Array<{
    symbol: string;
    package: string;
    frequency: number;
  }> {
    const counts = new Map<
      string,
      { symbol: string; package: string; frequency: number }
    >();
    for (const dep of dependencies) {
      const pkg = dep.external_package || dep.source_identifier;
      if (!pkg) continue;
      const symbol = dep.target_identifier || dep.source_identifier;
      const key = `${pkg}:${symbol}`;
      const current = counts.get(key) || { symbol, package: pkg, frequency: 0 };
      current.frequency++;
      counts.set(key, current);
    }
    return Array.from(counts.values()).sort((a, b) => b.frequency - a.frequency);
  }

  private async findSimilarEntitiesByEmbedding(entity: Entity): Promise<
    Array<{
      entity: Entity;
      similarity: number;
      confidence: number;
      reasoning: string;
    }>
  > {
    const related = await this.findRelatedInterfacesForEntity(entity);
    return related.slice(0, 5).map((item) => ({
      entity,
      similarity: item.relevance_score,
      confidence: Math.min(0.9, item.relevance_score),
      reasoning: `Related code interface: ${item.interface.name}`,
    }));
  }

  private async analyzeWorkingPatterns(
    workingContext: WorkingContext,
  ): Promise<any> {
    return {
      files: workingContext.current_files,
      interfaces: workingContext.active_interfaces,
      searches: workingContext.recent_searches,
      entities: workingContext.working_entities.map((entity) => entity.name),
      focus: workingContext.project_focus,
    };
  }

  private async predictInterfaceNeeds(patterns: any): Promise<any[]> {
    return (patterns.interfaces || []).slice(0, 5).map((name: string) => ({
      type: "interface",
      name,
      confidence: 0.75,
      reasoning: "Interface is active in the working context",
    }));
  }

  private async predictImportNeeds(patterns: any): Promise<any[]> {
    const deps = await this.projectAnalysisOps.getProjectDependencies({ limit: 100 });
    const focusText = `${patterns.focus || ""} ${(patterns.searches || []).join(" ")}`;
    return this.analyzeCommonImportPatterns(deps)
      .filter((item) => focusText.toLowerCase().includes(item.symbol.toLowerCase()))
      .slice(0, 5)
      .map((item) => ({
        type: "import",
        name: item.symbol,
        confidence: Math.min(0.9, item.frequency / 10),
        reasoning: `Frequently imported from ${item.package}`,
        suggested_location: item.package,
      }));
  }

  private async findIntegrationOpportunities(
    workingContext: WorkingContext,
  ): Promise<any[]> {
    const evidence = await this.evidenceBuilder.buildProjectEvidence({
      searchQuery: workingContext.project_focus,
      activeInterfaces: workingContext.active_interfaces,
      currentFile: workingContext.current_files[0],
    });
    return evidence.dependencies.slice(0, 5).map((dep) => ({
      target_system: dep.external_package || dep.target_identifier || dep.source_identifier,
      integration_type: dep.dependency_type,
      required_interfaces: evidence.interfaces
        .map((iface) => iface.qualified_name || iface.name)
        .slice(0, 3),
      complexity_estimate: dep.resolution_status === "unresolved" ? "medium" : "low",
    }));
  }

  private async identifyRefactoringOpportunities(
    workingContext: WorkingContext,
  ): Promise<any[]> {
    const files = await this.projectAnalysisOps.getProjectFiles({ limit: 100 });
    return files
      .filter(
        (file) =>
          file.complexity === "high" ||
          (file.documentation_percentage !== undefined &&
            file.documentation_percentage < 20),
      )
      .slice(0, 5)
      .map((file) => ({
        opportunity_type:
          file.complexity === "high" ? "reduce_complexity" : "improve_docs",
        affected_files: [file.relative_path || file.file_path],
        potential_benefit:
          file.complexity === "high"
            ? "Lower risk before changing related code"
            : "Improve retrievability and future context quality",
        effort_estimate: file.complexity === "high" ? "medium" : "low",
      }));
  }

  private createSuggestionCacheKey(
    currentContext: any,
    sessionId?: string,
  ): string {
    const contextStr = JSON.stringify(currentContext).substring(0, 100);
    return `${sessionId || "default"}_${contextStr}`;
  }

  private clearCachesForSession(sessionId: string): void {
    // Clear caches that contain this session ID
    for (const [key, _] of this.suggestionCache) {
      if (key.startsWith(sessionId)) {
        this.suggestionCache.delete(key);
      }
    }

    for (const [key, _] of this.contextPredictionCache) {
      if (key.includes(sessionId)) {
        this.contextPredictionCache.delete(key);
      }
    }
  }

  /**
   * Get engine statistics
   */
  getStatistics(): {
    active_contexts: number;
    suggestion_cache_size: number;
    prediction_cache_size: number;
    total_suggestions_generated: number;
  } {
    return {
      active_contexts: this.workingContexts.size,
      suggestion_cache_size: this.suggestionCache.size,
      prediction_cache_size: this.contextPredictionCache.size,
      total_suggestions_generated: Array.from(
        this.suggestionCache.values(),
      ).reduce((sum, suggestions) => sum + suggestions.length, 0),
    };
  }

  /**
   * Clear all caches
   */
  clearAllCaches(): void {
    this.suggestionCache.clear();
    this.contextPredictionCache.clear();
    logger.info(" Cleared context engine caches");
  }

  dispose(): void {
    this.workingContexts.clear();
    this.clearAllCaches();
  }

  private trimMap<K, V>(map: Map<K, V>, maxEntries: number): void {
    while (map.size > maxEntries) {
      const oldestKey = map.keys().next().value as K;
      map.delete(oldestKey);
    }
  }
}
