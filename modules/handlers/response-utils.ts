/**
 * Response utilities shared by all handlers.
 *
 * - sanitizeEntity / sanitizeEntities: strip large or internal-only fields
 *   (embedding vectors, keyword optimization metadata, search-time scratch
 *   fields) from entities before they leave the server.
 * - jsonResponse: wrap a payload in the MCP `{content:[{type:"text",text}]}`
 *   shape with compact (non-indented) JSON. Indented JSON in tool responses
 *   roughly doubles the token cost for no human benefit -- the agent reads
 *   it as text either way.
 */
import { Entity } from "../../memory-types.js";

export interface SanitizeOptions {
  /** Cap each entity's observations array. 0 / undefined = no cap. */
  maxObservations?: number;
  /** Keep the `content` field. Default: drop it. The optimized content
   *  is rarely useful to a calling agent and bloats responses. */
  keepContent?: boolean;
  /** Keep search-time metadata (semanticSimilarity, searchType, etc.). */
  keepSearchMeta?: boolean;
}

/**
 * Strip large/internal-only fields from a single entity.
 * Always strips: embedding, _keywordData, crossReferences (raw JSON),
 * semanticReasoning, textMatch.
 */
export function sanitizeEntity(
  entity: Entity,
  options: SanitizeOptions = {},
): any {
  if (!entity) return entity;

  const {
    maxObservations,
    keepContent = false,
    keepSearchMeta = false,
  } = options;

  const {
    embedding,
    _keywordData,
    crossReferences,
    semanticReasoning,
    textMatch,
    searchType,
    semanticSimilarity,
    semanticConfidence,
    keywordMatchScore,
    matchedKeywords,
    keywordSources,
    keywordCouplings,
    content,
    observations,
    ...rest
  } = entity as any;

  const out: any = { ...rest };

  if (keepContent && content !== undefined) {
    out.content = content;
  }

  if (keepSearchMeta) {
    if (searchType !== undefined) out.searchType = searchType;
    if (semanticSimilarity !== undefined)
      out.semanticSimilarity = semanticSimilarity;
    if (semanticConfidence !== undefined)
      out.semanticConfidence = semanticConfidence;
    if (keywordMatchScore !== undefined)
      out.keywordMatchScore = keywordMatchScore;
    if (Array.isArray(matchedKeywords)) {
      out.matchedKeywords = matchedKeywords.slice(0, 12);
    }
    if (Array.isArray(keywordSources)) {
      out.keywordSources = keywordSources.slice(0, 12);
    }
    if (Array.isArray(keywordCouplings)) {
      out.keywordCouplings = keywordCouplings.slice(0, 8);
    }
  }

  if (Array.isArray(observations)) {
    if (typeof maxObservations === "number" && maxObservations > 0) {
      const truncated = observations.slice(0, maxObservations);
      out.observations = truncated;
      if (observations.length > maxObservations) {
        out.observations_truncated = observations.length - maxObservations;
      }
    } else {
      out.observations = observations;
    }
  }

  return out;
}

export function sanitizeEntities(
  entities: Entity[] | undefined | null,
  options: SanitizeOptions = {},
): any[] {
  if (!Array.isArray(entities)) return [];
  return entities.map((e) => sanitizeEntity(e, options));
}

/**
 * Build the standard MCP text response with compact JSON.
 */
export function jsonResponse(payload: any) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload),
      },
    ],
  };
}
