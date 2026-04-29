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
  /** Emit an agent-optimized search hit: compact, ranked, evidence-first. */
  compactSearch?: boolean;
}

/**
 * Strip large/internal-only fields from a single entity.
 * Always strips: embedding, _keywordData, crossReferences (raw JSON),
 * semanticReasoning, textMatch.
 */
export function sanitizeEntity(entity: Entity, options: SanitizeOptions = {}): any {
  if (!entity) return entity;

  const {
    maxObservations,
    keepContent = false,
    keepSearchMeta = false,
    compactSearch = false,
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
    if (semanticSimilarity !== undefined) out.semanticSimilarity = semanticSimilarity;
    if (semanticConfidence !== undefined) out.semanticConfidence = semanticConfidence;
    if (keywordMatchScore !== undefined) out.keywordMatchScore = keywordMatchScore;
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

  if (compactSearch) {
    return compactSearchEntity({
      entity: out,
      searchType,
      semanticSimilarity,
      semanticConfidence,
      keywordMatchScore,
      matchedKeywords,
      keywordSources,
      keywordCouplings,
      keepSearchMeta,
    });
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

function compactSearchEntity(input: {
  entity: any;
  searchType?: string;
  semanticSimilarity?: number;
  semanticConfidence?: string;
  keywordMatchScore?: number;
  matchedKeywords?: string[];
  keywordSources?: string[];
  keywordCouplings?: Array<Record<string, any>>;
  keepSearchMeta: boolean;
}): any {
  const { entity } = input;
  const out: any = {};

  if (entity.name !== undefined) out.name = entity.name;
  if (entity.entityType !== undefined) out.type = entity.entityType;
  if (entity.status !== undefined) out.status = entity.status;

  const score: any = {};
  if (entity.relevanceScore !== undefined) score.rel = roundScore(entity.relevanceScore);
  if (entity.workingContext !== undefined) score.work = Boolean(entity.workingContext);
  if (input.searchType !== undefined) score.match = input.searchType;
  if (input.keywordMatchScore !== undefined) score.key = roundScore(input.keywordMatchScore);
  if (input.semanticSimilarity !== undefined) score.sem = roundScore(input.semanticSimilarity);
  if (input.keepSearchMeta && input.semanticConfidence !== undefined) {
    score.conf = input.semanticConfidence;
  }
  if (Object.keys(score).length > 0) out.score = score;

  const why: any = {};
  if (Array.isArray(input.matchedKeywords) && input.matchedKeywords.length > 0) {
    why.kw = input.matchedKeywords.slice(0, input.keepSearchMeta ? 8 : 4);
  }
  if (
    input.keepSearchMeta &&
    Array.isArray(input.keywordSources) &&
    input.keywordSources.length > 0
  ) {
    why.src = input.keywordSources.slice(0, 6);
  }
  if (
    input.keepSearchMeta &&
    Array.isArray(input.keywordCouplings) &&
    input.keywordCouplings.length > 0
  ) {
    why.links = input.keywordCouplings.slice(0, 4).map((link) => ({
      kw: link.keyword,
      type: link.linked_type,
      rel: link.relation_type,
      w: roundScore(link.weight),
    }));
  }
  if (Object.keys(why).length > 0) out.why = why;

  if (Array.isArray(entity.observations)) out.obs = entity.observations;
  if (entity.observations_truncated !== undefined) {
    out.more_obs = entity.observations_truncated;
  }

  const meta: any = {};
  if (entity.statusReason !== undefined && entity.statusReason !== null) {
    meta.reason = entity.statusReason;
  }
  if (entity.lastUpdated !== undefined) meta.updated = entity.lastUpdated;
  if (entity.lastAccessed !== undefined) meta.accessed = entity.lastAccessed;
  if (entity.created !== undefined) meta.created = entity.created;
  if (Object.keys(meta).length > 0) out.meta = meta;

  if (entity.content !== undefined) out.content = entity.content;

  return out;
}

function roundScore(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(3));
}
