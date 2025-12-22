import { logger } from "../logger.js";
import { AdaptiveModelTrainer } from "../ml/adaptive-model-trainer.js";
import { ProjectEmbeddingEngine } from "../ml/project-embedding-engine.js";
import { ModernSimilarityEngine } from "../similarity/similarity-engine.js";
import { ProjectAnalysisOperations } from "../sqlite/project-analysis-operations.js";

/**
 * Machine Learning Handlers
 * Handles advanced ML operations like model training, embedding generation, and semantic code search
 */
export class MLHandlers {
  private adaptiveModelTrainer: AdaptiveModelTrainer;
  private projectEmbeddingEngine: ProjectEmbeddingEngine;
  private similarityEngine: ModernSimilarityEngine;
  private projectAnalysisOps: ProjectAnalysisOperations;

  constructor(
    adaptiveModelTrainer: AdaptiveModelTrainer,
    projectEmbeddingEngine: ProjectEmbeddingEngine,
    similarityEngine: ModernSimilarityEngine,
    projectAnalysisOps: ProjectAnalysisOperations
  ) {
    this.adaptiveModelTrainer = adaptiveModelTrainer;
    this.projectEmbeddingEngine = projectEmbeddingEngine;
    this.similarityEngine = similarityEngine;
    this.projectAnalysisOps = projectAnalysisOps;
  }

  /**
   * Train project-specific model
   */
  async handleTrainProjectModel(args: any): Promise<any> {
    const epochs = args.epochs || 10;
    const batchSize = args.batch_size || 16;
    const learningRate = args.learning_rate || 0.001;

    logger.info("Starting project model training...");

    try {
      const session = await this.adaptiveModelTrainer.startTraining({
        epochs,
        batch_size: batchSize,
        learning_rate: learningRate,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                message: "Training session started successfully",
                session_id: session.id,
                config: session.config,
                status: session.status,
                data_points: session.data_points_count,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      logger.error("Failed to start training:", error);
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
   * Generate embedding for an interface
   */
  async handleGenerateInterfaceEmbedding(args: any): Promise<any> {
    const interfaceNames = args.interface_names;
    const branchName = args.branch_name || "main";
    const updateDatabase = args.update_database !== false;

    if (!interfaceNames || !Array.isArray(interfaceNames)) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { error: "interface_names must be an array of strings" },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }

    logger.info(
      `Generating embeddings for ${interfaceNames.length} interfaces`
    );

    try {
      const results = [];

      for (const name of interfaceNames) {
        // Find interface definition
        const interfaces = await this.projectAnalysisOps.getCodeInterfaces({
          name,
          limit: 1,
        });

        const iface = interfaces.length > 0 ? interfaces[0] : null;

        if (!iface) {
          results.push({ name, status: "not_found" });
          continue;
        }

        // Generate embedding
        const embedding =
          await this.projectEmbeddingEngine.generateProjectEmbedding(
            iface.definition,
            "interface_definition",
            {
              interface_name: iface.name,
              file_path: "unknown", // We might need to fetch file path
              line_number: iface.line_number,
            }
          );

        if (embedding && updateDatabase) {
          // Update database with new embedding
          // Note: We need a method to update interface embedding in projectAnalysisOps
          // For now, we'll assume it's handled or just return the embedding
        }

        results.push({
          name,
          status: "success",
          embedding_preview: embedding?.embedding.slice(0, 5),
          confidence: embedding?.confidence,
        });
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                results,
                count: results.length,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      logger.error("Failed to generate interface embeddings:", error);
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
   * Find similar code using semantic search
   */
  async handleFindSimilarCode(args: any): Promise<any> {
    const codeSnippet = args.code_snippet;
    const language = args.language || "typescript";
    const limit = args.limit || 5;

    if (!codeSnippet) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { error: "code_snippet is required" },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }

    logger.info("Finding similar code...");

    try {
      // 1. Generate embedding for query
      const queryEmbedding =
        await this.projectEmbeddingEngine.generateProjectEmbedding(
          codeSnippet,
          "business_logic" // Default type
        );

      if (!queryEmbedding) {
        throw new Error("Failed to generate embedding for query");
      }

      // 2. Search for similar interfaces using vector similarity
      const similarInterfaces =
        await this.projectAnalysisOps.findSimilarInterfaces(
          queryEmbedding.embedding,
          limit
        );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                message: "Semantic code search completed",
                query_embedding_generated: true,
                results: similarInterfaces.map((r) => ({
                  name: r.interface.name,
                  similarity: r.similarity,
                  file_id: r.interface.file_id,
                  line_number: r.interface.line_number,
                  definition: r.interface.definition.substring(0, 100) + "...",
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      logger.error("Failed to find similar code:", error);
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
}
