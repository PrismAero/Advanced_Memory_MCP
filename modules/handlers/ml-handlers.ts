import { logger } from "../logger.js";
import { AdaptiveModelTrainer } from "../ml/adaptive-model-trainer.js";
import { ProjectEmbeddingEngine } from "../ml/project-embedding-engine.js";
import { ModernSimilarityEngine } from "../similarity/similarity-engine.js";
import { ProjectAnalysisOperations } from "../sqlite/project-analysis-operations.js";
import { jsonResponse } from "./response-utils.js";

/**
 * Machine Learning Handlers.
 *
 * Three previously-separate tools (`generate_interface_embedding`,
 * `find_similar_code`, `backfill_embeddings`) are now grouped under
 * a single `embeddings` tool with `action: "generate" | "find_similar" | "backfill"`.
 * `train_project_model` remains its own tool because it has a long
 * lifetime and a distinct return shape (training session id + status).
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
    projectAnalysisOps: ProjectAnalysisOperations,
  ) {
    this.adaptiveModelTrainer = adaptiveModelTrainer;
    this.projectEmbeddingEngine = projectEmbeddingEngine;
    this.similarityEngine = similarityEngine;
    this.projectAnalysisOps = projectAnalysisOps;
  }

  async handleEmbeddings(args: any): Promise<any> {
    const action = args.action || "find_similar";
    switch (action) {
      case "generate":
        return this.handleGenerateInterfaceEmbedding(args);
      case "find_similar":
        return this.handleFindSimilarCode(args);
      case "backfill":
        return this.handleBackfillEmbeddings(args);
      default:
        throw new Error(
          `Unknown embeddings action "${action}". Expected one of: generate, find_similar, backfill.`,
        );
    }
  }

  async handleTrainProjectModel(args: any): Promise<any> {
    const epochs = clampNumber(
      args.epochs ?? args.training_config?.epochs,
      1,
      50,
      10,
    );
    const batchSize = clampNumber(
      args.batch_size ?? args.training_config?.batch_size,
      1,
      128,
      16,
    );
    const learningRate = clampNumber(
      args.learning_rate ?? args.training_config?.learning_rate,
      0.000001,
      0.1,
      0.001,
    );

    try {
      const session = await this.adaptiveModelTrainer.startTraining({
        epochs,
        batch_size: batchSize,
        learning_rate: learningRate,
      });
      return jsonResponse({
        session_id: session.id,
        status: session.status,
        config: session.config,
        data_points: session.data_points_count,
      });
    } catch (error) {
      logger.error("Failed to start training:", error);
      return jsonResponse({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async handleGenerateInterfaceEmbedding(args: any): Promise<any> {
    const interfaceNames = args.interface_names;
    if (!Array.isArray(interfaceNames)) {
      return jsonResponse({
        error: "interface_names must be an array of strings",
      });
    }

    const results: any[] = [];
    for (const name of interfaceNames) {
      const interfaces = await this.projectAnalysisOps.getCodeInterfaces({
        name,
        limit: 1,
      });
      const iface = interfaces[0];
      if (!iface) {
        results.push({ name, status: "not_found" });
        continue;
      }
      const embedding =
        await this.projectEmbeddingEngine.generateProjectEmbedding(
          iface.definition,
          "interface_definition",
          {
            interface_name: iface.name,
            file_path: "unknown",
            line_number: iface.line_number,
          },
        );
      results.push({
        name,
        status: "success",
        embedding_preview: embedding?.embedding.slice(0, 5),
        confidence: embedding?.confidence,
      });
    }
    return jsonResponse({ action: "generate", results, count: results.length });
  }

  async handleFindSimilarCode(args: any): Promise<any> {
    if (!args.code_snippet) {
      return jsonResponse({ error: "code_snippet is required" });
    }
    const limit = clampNumber(args.limit ?? args.max_results, 1, 50, 5);
    const offset = clampNumber(args.offset, 0, 10_000, 0);
    const maxDefinitionChars = clampNumber(
      args.max_definition_chars,
      80,
      4_000,
      240,
    );
    const maxMembers = clampNumber(args.max_members, 0, 100, 8);
    const includeDocs = args.include_docs === true;
    const includeMembers = args.include_members === true;
    const includeSnippet = args.include_snippet === true;

    try {
      const queryEmbedding =
        await this.projectEmbeddingEngine.generateProjectEmbedding(
          args.code_snippet,
          "business_logic",
        );
      if (!queryEmbedding) {
        throw new Error("Failed to generate embedding for query");
      }
      const similar = await this.projectAnalysisOps.findSimilarInterfaces(
        queryEmbedding.embedding,
        limit,
        typeof args.min_similarity === "number" ? args.min_similarity : -1,
        {
          language: args.language,
          kind: args.kind,
          filePath: args.file_path,
          qualifiedName: args.qualified_name,
          dedupe: args.dedupe !== false,
          offset,
        },
      );
      return jsonResponse({
        action: "find_similar",
        filters: {
          language: args.language,
          kind: args.kind,
          file_path: args.file_path,
          qualified_name: args.qualified_name,
          dedupe: args.dedupe !== false,
        },
        results: similar.map((r) =>
          formatCodeInterfaceResult(r.interface, r.similarity, {
            includeDocs,
            includeMembers,
            includeSnippet,
            maxDefinitionChars,
            maxMembers,
          }),
        ),
        count: similar.length,
      });
    } catch (error) {
      logger.error("Failed to find similar code:", error);
      return jsonResponse({
        action: "find_similar",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async handleBackfillEmbeddings(args: any): Promise<any> {
    const fileLimit = clampNumber(args.file_limit, 1, 500, 100);
    const interfaceLimit = clampNumber(args.interface_limit, 1, 500, 100);

    try {
      const status = await this.projectAnalysisOps.backfillMissingEmbeddings();

      const fileGen = async (fileContext: string) => {
        const r = await this.projectEmbeddingEngine.generateProjectEmbedding(
          fileContext,
          "documentation",
          {},
        );
        return r?.embedding || null;
      };
      const interfaceGen = async (interfaceContext: string) => {
        const r = await this.projectEmbeddingEngine.generateProjectEmbedding(
          interfaceContext,
          "interface_definition",
          {},
        );
        return r?.embedding || null;
      };

      const updatedFiles =
        await this.projectAnalysisOps.generateMissingFileEmbeddings(
          fileGen,
          fileLimit,
        );
      const updatedInterfaces =
        await this.projectAnalysisOps.generateMissingInterfaceEmbeddings(
          interfaceGen,
          interfaceLimit,
        );

      return jsonResponse({
        action: "backfill",
        before: {
          files_without_embeddings: status.filesWithoutEmbeddings,
          interfaces_without_embeddings: status.interfacesWithoutEmbeddings,
        },
        processed: {
          files: updatedFiles.length,
          interfaces: updatedInterfaces.length,
        },
        remaining: {
          files: Math.max(
            0,
            status.filesWithoutEmbeddings - updatedFiles.length,
          ),
          interfaces: Math.max(
            0,
            status.interfacesWithoutEmbeddings - updatedInterfaces.length,
          ),
        },
      });
    } catch (error) {
      logger.error("Failed to backfill embeddings:", error);
      return jsonResponse({
        action: "backfill",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function formatCodeInterfaceResult(
  iface: any,
  similarity: number,
  options: {
    includeDocs: boolean;
    includeMembers: boolean;
    includeSnippet: boolean;
    maxDefinitionChars: number;
    maxMembers: number;
  },
): any {
  const metadata = parseMetadata(iface.metadata);
  const out: any = {
    name: iface.name,
    qualified_name: iface.qualified_name || iface.name,
    kind: iface.kind || iface.interface_type,
    language: iface.language,
    similarity,
    score: similarity,
    file_id: iface.file_id,
    line_number: iface.start_line || iface.line_number,
    end_line: iface.end_line || iface.line_number,
    signature: iface.signature || iface.definition?.split("\n")[0],
    summary: iface.summary,
    why: buildWhy(iface, similarity),
  };
  if (options.includeDocs && iface.documentation) {
    out.documentation = truncate(
      iface.documentation,
      options.maxDefinitionChars,
    );
  } else if (iface.documentation) {
    out.documentation_preview = truncate(iface.documentation, 180);
  }
  if (options.includeMembers) {
    out.members = (metadata.members || []).slice(0, options.maxMembers);
    out.members_truncated = Math.max(
      0,
      (metadata.members || []).length - options.maxMembers,
    );
  }
  if (options.includeSnippet) {
    out.definition = truncate(
      iface.definition || "",
      options.maxDefinitionChars,
    );
  } else {
    out.definition_preview = truncate(
      iface.definition || "",
      Math.min(240, options.maxDefinitionChars),
    );
  }
  if (iface.kind === "macro" || iface.interface_type === "macro") {
    out.macro = {
      parameters: metadata.macroParameters || [],
      replacement: metadata.macroReplacement,
    };
  }
  return out;
}

function parseMetadata(input: string | undefined): any {
  if (!input) return {};
  try {
    return JSON.parse(input);
  } catch {
    return {};
  }
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 3))}...`;
}

function buildWhy(iface: any, similarity: number): string {
  const parts = [`semantic similarity ${similarity.toFixed(3)}`];
  if (iface.kind || iface.interface_type)
    parts.push(`kind ${iface.kind || iface.interface_type}`);
  if (iface.language) parts.push(`language ${iface.language}`);
  return parts.join("; ");
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}
