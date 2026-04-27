import { logger } from "../logger.js";
import { TensorFlowModelManager } from "../similarity/tensorflow-model-manager.js";
import {
  CodeInterfaceRecord,
  ProjectFileRecord,
} from "../sqlite/project-analysis-operations.js";
import {
  AdaptiveModelTrainer,
  TrainingDataPoint,
} from "./adaptive-model-trainer.js";

/**
 * Code semantic types for better embeddings
 */
export type CodeSemanticType =
  | "interface_definition"
  | "function_signature"
  | "class_definition"
  | "import_statement"
  | "export_statement"
  | "variable_declaration"
  | "type_annotation"
  | "api_endpoint"
  | "database_schema"
  | "configuration"
  | "documentation"
  | "test_case"
  | "error_handling"
  | "business_logic"
  | "data_transformation";

/**
 * Enhanced embedding with metadata
 */
export interface ProjectEmbedding {
  embedding: number[];
  confidence: number;
  semantic_type?: CodeSemanticType;
  context_info: {
    file_path?: string;
    interface_name?: string;
    function_name?: string;
    class_name?: string;
    line_number?: number;
    project_context?: string;
  };
  related_embeddings?: {
    entity_id?: string;
    interface_id?: number;
    similarity_score: number;
  }[];
}

/**
 * Interface similarity result
 */
export interface InterfaceSimilarityResult {
  interface: CodeInterfaceRecord;
  similarity: number;
  confidence: "high" | "medium" | "low";
  reasoning: string;
  related_interfaces: Array<{
    interface: CodeInterfaceRecord;
    relationship: string;
    similarity: number;
  }>;
}

/**
 * Code context for embeddings
 */
export interface CodeContext {
  file_content?: string;
  surrounding_lines?: string[];
  imports?: string[];
  exports?: string[];
  class_context?: string;
  function_context?: string;
  project_type?: string;
  framework?: string;
  interface_name?: string;
  line_number?: number;
  file_path?: string;
}

/**
 * Project-Specific Embedding Engine
 * Generates enhanced embeddings optimized for code semantics and project context
 */
export class ProjectEmbeddingEngine {
  private baseModelManager: TensorFlowModelManager;
  private adaptiveTrainer: AdaptiveModelTrainer;
  private embeddingCache = new Map<string, ProjectEmbedding>();
  private cacheHitCount = 0;
  private cacheMissCount = 0;

  constructor(
    baseModelManager: TensorFlowModelManager,
    adaptiveTrainer: AdaptiveModelTrainer
  ) {
    this.baseModelManager = baseModelManager;
    this.adaptiveTrainer = adaptiveTrainer;

    logger.debug("Project embedding engine initialized");
  }

  /**
   * Generate project-aware embedding for code or interface
   */
  async generateProjectEmbedding(
    text: string,
    semanticType?: CodeSemanticType,
    context?: CodeContext
  ): Promise<ProjectEmbedding | null> {
    try {
      // Create cache key
      const cacheKey = this.createCacheKey(text, semanticType, context);

      // Check cache first
      const cached = this.embeddingCache.get(cacheKey);
      if (cached) {
        this.cacheHitCount++;
        return cached;
      }

      this.cacheMissCount++;

      // Prepare enhanced text with context
      const enhancedText = this.prepareEnhancedText(
        text,
        semanticType,
        context
      );

      // Generate embedding using trained model or fallback to base
      let embedding: number[] | null;
      let confidence = 0.8; // Base confidence

      try {
        // Try adaptive model first
        embedding = await this.adaptiveTrainer.generateEnhancedEmbedding(
          enhancedText
        );
        confidence = 0.9; // Higher confidence for trained model
      } catch (error) {
        logger.debug("Adaptive model unavailable, using base model:", error);
        const embeddings = await this.baseModelManager.generateEmbeddings([
          enhancedText,
        ]);
        embedding = embeddings[0];
        confidence = 0.7; // Lower confidence for base model
      }

      if (!embedding) {
        logger.warn(
          "Failed to generate embedding for text:",
          text.substring(0, 100)
        );
        return null;
      }

      // Apply semantic type adjustments
      if (semanticType) {
        embedding = this.applySemanticTypeAdjustment(embedding, semanticType);
        confidence += 0.05; // Slight boost for typed embeddings
      }

      const projectEmbedding: ProjectEmbedding = {
        embedding,
        confidence: Math.min(confidence, 1.0),
        semantic_type: semanticType,
        context_info: {
          file_path: context?.file_content ? "provided" : undefined,
          line_number: 0, // Would need to be provided in context
          project_context: context?.project_type,
        },
      };

      // Cache the result
      this.embeddingCache.set(cacheKey, projectEmbedding);

      // Limit cache size
      if (this.embeddingCache.size > 10000) {
        const firstKey = this.embeddingCache.keys().next().value;
        if (firstKey !== undefined) {
          this.embeddingCache.delete(firstKey);
        }
      }

      return projectEmbedding;
    } catch (error) {
      logger.error("Failed to generate project embedding:", error);
      return null;
    }
  }

  /**
   * Generate embedding for TypeScript/JavaScript interface
   */
  async generateInterfaceEmbedding(
    interfaceRecord: CodeInterfaceRecord,
    context?: CodeContext
  ): Promise<ProjectEmbedding | null> {
    // Create comprehensive interface text
    const interfaceText = this.createInterfaceText(interfaceRecord);

    return this.generateProjectEmbedding(
      interfaceText,
      "interface_definition",
      {
        ...context,
        interface_name: interfaceRecord.name,
        line_number: interfaceRecord.line_number,
      }
    );
  }

  /**
   * Generate embedding for project file
   */
  async generateFileEmbedding(
    fileRecord: ProjectFileRecord,
    context?: CodeContext
  ): Promise<ProjectEmbedding | null> {
    // Create file summary text
    const fileText = this.createFileText(fileRecord);

    const semanticType = this.determineFileSemanticType(fileRecord);

    return this.generateProjectEmbedding(fileText, semanticType, {
      ...context,
      file_path: fileRecord.relative_path,
      project_type: context?.project_type || fileRecord.language,
    });
  }

  /**
   * Find similar interfaces using enhanced embeddings
   */
  async findSimilarInterfaces(
    targetInterface: CodeInterfaceRecord,
    candidateInterfaces: CodeInterfaceRecord[],
    threshold: number = 0.7
  ): Promise<InterfaceSimilarityResult[]> {
    const results: InterfaceSimilarityResult[] = [];

    if (candidateInterfaces.length === 0) {
      return results;
    }

    // Generate embedding for target interface
    const targetEmbedding = await this.generateInterfaceEmbedding(
      targetInterface
    );
    if (!targetEmbedding) {
      logger.warn(
        `Could not generate embedding for target interface: ${targetInterface.name}`
      );
      return results;
    }

    // Generate embeddings for candidates and calculate similarities
    for (const candidate of candidateInterfaces) {
      if (candidate.id === targetInterface.id) continue;

      try {
        const candidateEmbedding = await this.generateInterfaceEmbedding(
          candidate
        );
        if (!candidateEmbedding) continue;

        const similarity = this.calculateCosineSimilarity(
          targetEmbedding.embedding,
          candidateEmbedding.embedding
        );

        if (similarity >= threshold) {
          const { confidence, reasoning } = this.determineInterfaceConfidence(
            similarity,
            targetInterface,
            candidate
          );

          // Find related interfaces (simplified - could be enhanced)
          const relatedInterfaces: InterfaceSimilarityResult["related_interfaces"] =
            [];

          results.push({
            interface: candidate,
            similarity,
            confidence,
            reasoning,
            related_interfaces: relatedInterfaces,
          });
        }
      } catch (error) {
        logger.warn(
          `Failed to process candidate interface ${candidate.name}:`,
          error
        );
      }
    }

    // Sort by similarity score
    results.sort((a, b) => b.similarity - a.similarity);

    return results.slice(0, 20); // Limit to top 20 results
  }

  /**
   * Enhanced similarity detection for code elements
   */
  async detectCodeSimilarities(
    targetText: string,
    candidateTexts: string[],
    semanticType?: CodeSemanticType,
    context?: CodeContext
  ): Promise<Array<{ text: string; similarity: number; confidence: number }>> {
    const results: Array<{
      text: string;
      similarity: number;
      confidence: number;
    }> = [];

    // Generate embedding for target
    const targetEmbedding = await this.generateProjectEmbedding(
      targetText,
      semanticType,
      context
    );
    if (!targetEmbedding) {
      return results;
    }

    // Process candidates
    for (const candidateText of candidateTexts) {
      try {
        const candidateEmbedding = await this.generateProjectEmbedding(
          candidateText,
          semanticType,
          context
        );

        if (candidateEmbedding) {
          const similarity = this.calculateCosineSimilarity(
            targetEmbedding.embedding,
            candidateEmbedding.embedding
          );

          results.push({
            text: candidateText,
            similarity,
            confidence:
              (targetEmbedding.confidence + candidateEmbedding.confidence) / 2,
          });
        }
      } catch (error) {
        logger.warn("Failed to process candidate text:", error);
      }
    }

    return results.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Learn from successful similarity matches
   */
  async learnFromSuccess(
    sourceText: string,
    targetText: string,
    similarity: number,
    userFeedback?: number, // 1-5 rating
    sessionId?: string
  ): Promise<void> {
    if (similarity < 0.5) return; // Only learn from good matches

    const trainingPoint: TrainingDataPoint = {
      id: `similarity_${Date.now()}_${Math.random()}`,
      input_text: `${sourceText} ||| ${targetText}`, // Concatenated for relationship learning
      context: "interface_similarity",
      source_type: userFeedback ? "user_feedback" : "relationship_discovery",
      confidence: userFeedback ? userFeedback / 5 : similarity,
      timestamp: new Date(),
      metadata: {
        user_rating: userFeedback,
        session_id: sessionId,
      },
    };

    await this.adaptiveTrainer.addTrainingData(trainingPoint);
    logger.debug(
      ` Added similarity training data: confidence=${trainingPoint.confidence}`
    );
  }

  /**
   * Learn from interface usage patterns
   */
  async learnFromInterfaceUsage(
    interfaceRecord: CodeInterfaceRecord,
    usageContext: string,
    successRate: number
  ): Promise<void> {
    const trainingPoint: TrainingDataPoint = {
      id: `interface_usage_${interfaceRecord.id}_${Date.now()}`,
      input_text: this.createInterfaceText(interfaceRecord),
      context: usageContext,
      source_type: "interface_usage",
      confidence: successRate,
      timestamp: new Date(),
      metadata: {
        interface_name: interfaceRecord.name,
        file_path: `file_id_${interfaceRecord.file_id}`,
      },
    };

    await this.adaptiveTrainer.addTrainingData(trainingPoint);
  }

  /**
   * Get embedding engine statistics
   */
  getStatistics(): {
    cache_size: number;
    cache_hit_rate: number;
    total_embeddings_generated: number;
    semantic_types_supported: CodeSemanticType[];
  } {
    const totalRequests = this.cacheHitCount + this.cacheMissCount;
    const cacheHitRate =
      totalRequests > 0 ? this.cacheHitCount / totalRequests : 0;

    return {
      cache_size: this.embeddingCache.size,
      cache_hit_rate: cacheHitRate,
      total_embeddings_generated: this.cacheMissCount,
      semantic_types_supported: [
        "interface_definition",
        "function_signature",
        "class_definition",
        "import_statement",
        "export_statement",
        "variable_declaration",
        "type_annotation",
        "api_endpoint",
        "database_schema",
        "configuration",
        "documentation",
        "test_case",
        "error_handling",
        "business_logic",
        "data_transformation",
      ],
    };
  }

  // Private helper methods

  /**
   * Create cache key for embedding
   */
  private createCacheKey(
    text: string,
    semanticType?: CodeSemanticType,
    context?: CodeContext
  ): string {
    const contextHash = context ? JSON.stringify(context).substring(0, 50) : "";
    return `${text.substring(0, 100)}_${
      semanticType || "generic"
    }_${contextHash}`;
  }

  /**
   * Prepare enhanced text with context
   */
  private prepareEnhancedText(
    text: string,
    semanticType?: CodeSemanticType,
    context?: CodeContext
  ): string {
    let enhancedText = text;

    // Add semantic type context
    if (semanticType) {
      enhancedText = `[${semanticType.toUpperCase()}] ${enhancedText}`;
    }

    // Add project context
    if (context?.project_type) {
      enhancedText = `[${context.project_type.toUpperCase()}] ${enhancedText}`;
    }

    // Add surrounding code context
    if (context?.surrounding_lines?.length) {
      const surroundingContext = context.surrounding_lines.join(" ");
      enhancedText += ` [CONTEXT: ${surroundingContext.substring(0, 200)}]`;
    }

    // Add import context
    if (context?.imports?.length) {
      const importContext = context.imports.join(", ");
      enhancedText += ` [IMPORTS: ${importContext.substring(0, 100)}]`;
    }

    return enhancedText;
  }

  /**
   * Apply semantic type adjustments to embeddings
   */
  private applySemanticTypeAdjustment(
    embedding: number[],
    semanticType: CodeSemanticType
  ): number[] {
    // Simple adjustment based on semantic type
    // In a more sophisticated implementation, this could use learned type vectors
    const adjustmentFactors: { [key in CodeSemanticType]: number } = {
      interface_definition: 1.1,
      function_signature: 1.05,
      class_definition: 1.08,
      import_statement: 0.95,
      export_statement: 0.98,
      variable_declaration: 0.9,
      type_annotation: 1.02,
      api_endpoint: 1.15,
      database_schema: 1.12,
      configuration: 0.88,
      documentation: 0.85,
      test_case: 0.92,
      error_handling: 1.03,
      business_logic: 1.05,
      data_transformation: 1.0,
    };

    const factor = adjustmentFactors[semanticType] || 1.0;
    return embedding.map((val) => val * factor);
  }

  /**
   * Create comprehensive interface text for embedding
   */
  private createInterfaceText(interfaceRecord: CodeInterfaceRecord): string {
    let text = `interface ${interfaceRecord.name}`;

    if (interfaceRecord.extends_interfaces) {
      try {
        const extendsInterfaces = JSON.parse(
          interfaceRecord.extends_interfaces
        );
        if (extendsInterfaces.length > 0) {
          text += ` extends ${extendsInterfaces.join(", ")}`;
        }
      } catch {
        // Ignore parsing errors
      }
    }

    if (interfaceRecord.properties) {
      try {
        const properties = JSON.parse(interfaceRecord.properties);
        text += ` { ${properties.join("; ")} }`;
      } catch {
        // Ignore parsing errors
      }
    }

    if (interfaceRecord.definition) {
      text += ` ${interfaceRecord.definition}`;
    }

    return text;
  }

  /**
   * Create file text for embedding
   */
  private createFileText(fileRecord: ProjectFileRecord): string {
    let text = `${fileRecord.language} file: ${fileRecord.relative_path}`;
    text += ` (${fileRecord.category}, ${fileRecord.line_count} lines)`;

    if (fileRecord.is_entry_point) {
      text += " [ENTRY_POINT]";
    }

    if (fileRecord.has_tests) {
      text += " [HAS_TESTS]";
    }

    text += ` complexity: ${fileRecord.complexity}`;

    return text;
  }

  /**
   * Determine semantic type for file
   */
  private determineFileSemanticType(
    fileRecord: ProjectFileRecord
  ): CodeSemanticType {
    if (fileRecord.category === "test") return "test_case";
    if (fileRecord.category === "config") return "configuration";
    if (fileRecord.category === "documentation") return "documentation";
    if (fileRecord.file_type === ".ts" || fileRecord.file_type === ".tsx")
      return "type_annotation";
    if (
      fileRecord.language === "javascript" ||
      fileRecord.language === "typescript"
    )
      return "business_logic";

    return "business_logic"; // Default
  }

  /**
   * Calculate cosine similarity between embeddings
   */
  private calculateCosineSimilarity(
    embedding1: number[],
    embedding2: number[]
  ): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error("Embeddings must have the same dimension");
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * Determine confidence level for interface similarity
   */
  private determineInterfaceConfidence(
    similarity: number,
    targetInterface: CodeInterfaceRecord,
    candidateInterface: CodeInterfaceRecord
  ): { confidence: "high" | "medium" | "low"; reasoning: string } {
    let confidence: "high" | "medium" | "low" = "low";
    const reasoningFactors: string[] = [];

    // Similarity-based confidence
    if (similarity >= 0.9) {
      confidence = "high";
      reasoningFactors.push(
        `Very high semantic similarity (${(similarity * 100).toFixed(1)}%)`
      );
    } else if (similarity >= 0.75) {
      confidence = "medium";
      reasoningFactors.push(
        `High semantic similarity (${(similarity * 100).toFixed(1)}%)`
      );
    } else {
      reasoningFactors.push(
        `Moderate semantic similarity (${(similarity * 100).toFixed(1)}%)`
      );
    }

    // Name similarity boost
    if (
      targetInterface.name
        .toLowerCase()
        .includes(candidateInterface.name.toLowerCase()) ||
      candidateInterface.name
        .toLowerCase()
        .includes(targetInterface.name.toLowerCase())
    ) {
      reasoningFactors.push("Similar interface names");
      if (confidence === "low") confidence = "medium";
    }

    // Export status matching
    if (targetInterface.is_exported === candidateInterface.is_exported) {
      reasoningFactors.push("Matching export status");
    }

    const reasoning = reasoningFactors.join("; ");

    return { confidence, reasoning };
  }

  /**
   * Clear embedding cache
   */
  clearCache(): void {
    this.embeddingCache.clear();
    this.cacheHitCount = 0;
    this.cacheMissCount = 0;
    logger.info(" Cleared embedding cache");
  }
}
