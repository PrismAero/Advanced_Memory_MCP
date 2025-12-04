import { Entity, EntityStatus, Relation } from "../../memory-types.js";
import { logger } from "../logger.js";
import { ModernSimilarityEngine } from "../similarity/similarity-engine.js";

/**
 * Entity Management Handlers
 * Handles entity creation, updates, and deletion with automatic similarity detection
 */
export class EntityHandlers {
  private memoryManager: any;
  private modernSimilarity: ModernSimilarityEngine;
  private relationshipIndexer?: any;

  constructor(
    memoryManager: any,
    modernSimilarity: ModernSimilarityEngine,
    relationshipIndexer?: any
  ) {
    this.memoryManager = memoryManager;
    this.modernSimilarity = modernSimilarity;
    this.relationshipIndexer = relationshipIndexer;
  }

  async handleCreateEntities(args: any): Promise<any> {
    let createBranch = args.branch_name as string;
    if (!createBranch && args.entities && (args.entities as any[]).length > 0) {
      // Auto-suggest branch based on first entity
      const firstEntity = (args.entities as any[])[0];
      createBranch = await this.memoryManager.suggestBranch(
        firstEntity.entityType,
        firstEntity.observations?.join(" ")
      );
    }

    const createdEntities = await this.memoryManager.createEntities(
      args.entities as Entity[],
      createBranch
    );

    let autoRelationsResults: any[] = [];

    // Handle auto_create_relations if enabled (defaults to true in SMART_MEMORY_TOOLS)
    if (args.auto_create_relations !== false) {
      logger.info("Starting automatic relationship detection...");

      try {
        // Get existing entities from the branch to compare against
        const branchGraph = await this.memoryManager.readGraph(
          createBranch,
          ["active", "draft"], // Include both active and draft entities for comparison
          false // Don't include cross-context for similarity detection
        );

        const existingEntities = branchGraph.entities;
        let totalRelationsCreated = 0;

        // Process each created entity for similarity detection
        for (const newEntity of createdEntities) {
          logger.debug(`Analyzing "${newEntity.name}" for similar entities...`);

          // Use statistical similarity engine to detect similar entities
          const similarEntities =
            await this.modernSimilarity.detectSimilarEntities(
              newEntity,
              existingEntities.filter((e: Entity) => e.name !== newEntity.name) // Exclude self
            );

          if (similarEntities.length > 0) {
            logger.info(
              `Found ${similarEntities.length} similar entities for "${newEntity.name}"`
            );

            // Create relationships with high-confidence matches
            const relationsToCreate: Relation[] = [];

            for (const match of similarEntities) {
              // Only auto-create relationships for high confidence matches
              logger.debug(
                `Match: "${
                  match.entity.name
                }" similarity=${match.similarity.toFixed(3)} confidence=${
                  match.confidence
                } type=${match.suggestedRelationType}`
              );
              if (match.confidence === "high" || match.similarity > 0.5) {
                relationsToCreate.push({
                  from: newEntity.name,
                  to: match.entity.name,
                  relationType: match.suggestedRelationType,
                });

                autoRelationsResults.push({
                  from: newEntity.name,
                  to: match.entity.name,
                  relationType: match.suggestedRelationType,
                  similarity_score: match.similarity,
                  confidence: match.confidence,
                  reasoning: match.reasoning,
                  auto_created: true,
                });
              } else {
                // Log medium/low confidence matches for reference
                autoRelationsResults.push({
                  from: newEntity.name,
                  to: match.entity.name,
                  relationType: match.suggestedRelationType,
                  similarity_score: match.similarity,
                  confidence: match.confidence,
                  reasoning: match.reasoning,
                  auto_created: false,
                  note: "Low confidence - relation suggested but not auto-created",
                });
              }
            }

            // Create the high-confidence relations
            if (relationsToCreate.length > 0) {
              const createdRelations = await this.memoryManager.createRelations(
                relationsToCreate,
                createBranch
              );
              totalRelationsCreated += createdRelations.length;
              logger.info(
                `Auto-created ${createdRelations.length} high-confidence relations for "${newEntity.name}"`
              );
            }
          } else {
            logger.info(`No similar entities found for "${newEntity.name}"`);
            logger.debug(
              `Similarity analysis for "${newEntity.name}": found ${similarEntities.length} candidates, threshold: 0.78`
            );
            autoRelationsResults.push({
              entity: newEntity.name,
              message: "No similar entities found above similarity threshold",
              similarity_threshold: 0.5,
              candidates_analyzed: existingEntities.length,
              similarity_results: similarEntities.length,
            });
          }
        }

        logger.info(
          `Auto-relationship detection complete: ${totalRelationsCreated} relations created`
        );

        // Add summary to results
        autoRelationsResults.unshift({
          summary: `Auto-relationship detection complete`,
          total_relations_created: totalRelationsCreated,
          entities_processed: createdEntities.length,
          similarity_engine: "ModernSimilarityEngine",
          similarity_threshold: 0.65,
          high_confidence_threshold: 0.85,
        });

        // Notify background indexer about new entities
        if (this.relationshipIndexer) {
          for (const entity of createdEntities) {
            this.relationshipIndexer.onEntityCreated(entity.name, createBranch);
          }
        }
      } catch (error) {
        logger.error("Error during automatic relationship detection:", error);
        autoRelationsResults.push({
          error: "Auto-relationship detection failed",
          message: error instanceof Error ? error.message : String(error),
          fallback: "Relations can still be created manually",
        });
      }
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              created_entities: createdEntities,
              branch: createBranch || "main",
              auto_relations_enabled: args.auto_create_relations !== false,
              auto_relations_results: autoRelationsResults,
              message: `Created ${createdEntities.length} entities in branch "${
                createBranch || "main"
              }"${
                args.auto_create_relations !== false
                  ? " with auto-relationship detection enabled"
                  : ""
              }`,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  async handleAddObservations(args: any): Promise<any> {
    if (!args.observations) {
      throw new Error("observations array is required");
    }
    const results = await this.memoryManager.addObservations(
      args.observations,
      args.branch_name as string
    );
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              results,
              branch: args.branch_name || "main",
              message: `Added observations to ${
                results.length
              } entities in branch "${args.branch_name || "main"}"`,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  async handleUpdateEntityStatus(args: any): Promise<any> {
    if (!args.entity_name || !args.status) {
      throw new Error("entity_name and status are required");
    }
    await this.memoryManager.updateEntityStatus(
      args.entity_name as string,
      args.status as EntityStatus,
      args.status_reason as string,
      args.branch_name as string
    );
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              message: `Updated entity "${args.entity_name}" status to "${
                args.status
              }" in branch "${args.branch_name || "main"}"`,
              entity_name: args.entity_name,
              new_status: args.status,
              status_reason: args.status_reason,
              branch: args.branch_name || "main",
            },
            null,
            2
          ),
        },
      ],
    };
  }

  async handleDeleteEntities(args: any): Promise<any> {
    if (!args.entity_names) {
      throw new Error("entity_names array is required");
    }
    await this.memoryManager.deleteEntities(
      args.entity_names as string[],
      args.branch_name as string
    );
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              message: `Deleted ${
                (args.entity_names as string[]).length
              } entities from branch "${args.branch_name || "main"}"`,
              deleted_entities: args.entity_names,
              branch: args.branch_name || "main",
            },
            null,
            2
          ),
        },
      ],
    };
  }
}
