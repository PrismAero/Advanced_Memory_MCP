import { ContextualKeywordExtractor, normalizeKeyword } from "../keywords/keyword-extractor.js";
import type { KeywordLink, KeywordSignal } from "../keywords/keyword-types.js";
import { SQLiteConnection } from "./sqlite-connection.js";

export interface KeywordMatchSummary {
  entityId: number;
  keywordMatchScore: number;
  matchedKeywords: string[];
  keywordSources: string[];
  keywordCouplings: Array<{
    keyword: string;
    linked_type: string;
    relation_type: string;
    weight: number;
  }>;
}

export class KeywordOperations {
  private extractor = new ContextualKeywordExtractor();

  constructor(private connection: SQLiteConnection) {}

  async refreshEntityKeywords(entityId: number, branchId: number): Promise<void> {
    const entity = await this.connection.getQuery(
      "SELECT * FROM entities WHERE id = ? AND branch_id = ?",
      [entityId, branchId],
    );
    if (!entity) return;

    const observations = await this.connection.runQuery(
      "SELECT id, content, observation_type, priority, sequence_order FROM observations WHERE entity_id = ? ORDER BY sequence_order",
      [entityId],
    );

    const signals: KeywordSignal[] = [
      ...this.extractor.extract({
        text: entity.name,
        sourceType: "entity_name",
        sourceId: entityId,
        branchId,
        context: entity.entity_type,
        baseWeight: 2,
      }),
      ...this.extractor.extract({
        text: entity.entity_type,
        sourceType: "entity_type",
        sourceId: entityId,
        branchId,
        context: entity.name,
        baseWeight: 1.5,
      }),
      ...this.extractor.extract({
        text: entity.original_content || "",
        sourceType: "entity_content",
        sourceId: entityId,
        branchId,
        context: entity.name,
      }),
      ...(observations || []).flatMap((obs: any) =>
        this.extractor.extract({
          text: obs.content || "",
          sourceType: "observation",
          sourceId: obs.id,
          observationId: obs.id,
          branchId,
          context: entity.name,
          baseWeight: observationWeight(obs),
          metadata: {
            observation_type: obs.observation_type,
            priority: obs.priority,
            sequence_order: obs.sequence_order,
          },
        }),
      ),
    ];

    await this.connection.execute("DELETE FROM keyword_links WHERE entity_id = ?", [
      entityId,
    ]);
    await this.connection.execute("DELETE FROM keywords WHERE entity_id = ?", [
      entityId,
    ]);
    await this.upsertSignals(entityId, branchId, signals);
  }

  async addRelationKeywords(
    relationId: number,
    branchId: number,
    fromEntityId: number,
    toEntityId: number,
    relationText: string,
  ): Promise<void> {
    const signals = this.extractor.extract({
      text: relationText,
      sourceType: "relation",
      sourceId: relationId,
      branchId,
      baseWeight: 2,
      context: "relation",
    });

    await this.upsertSignals(fromEntityId, branchId, signals, relationId);
    await this.upsertSignals(toEntityId, branchId, signals, relationId);
  }

  async findEntityKeywordMatches(
    query: string,
    options: { branchId?: number | null; statuses?: string[]; limit?: number } = {},
  ): Promise<Map<number, KeywordMatchSummary>> {
    const normalizedQuery = normalizeKeyword(query);
    const queryTerms = this.extractor
      .extractText(query)
      .map((signal) => signal.normalizedKeyword)
      .concat(normalizedQuery)
      .filter((value) => value.length >= 3);
    const uniqueTerms = Array.from(new Set(queryTerms)).slice(0, 16);
    if (uniqueTerms.length === 0) return new Map();

    let whereClause = `WHERE k.normalized_keyword IN (${uniqueTerms
      .map(() => "?")
      .join(",")})`;
    const params: any[] = [...uniqueTerms];

    if (options.branchId) {
      whereClause += " AND e.branch_id = ?";
      params.push(options.branchId);
    }

    const statuses = options.statuses?.length ? options.statuses : ["active"];
    whereClause += ` AND e.status IN (${statuses.map(() => "?").join(",")})`;
    params.push(...statuses);

    const rows = await this.connection.runQuery(
      `
      SELECT k.*, e.id as matched_entity_id, kl.linked_type, kl.relation_type as link_relation_type, kl.weight as link_weight
      FROM keywords k
      JOIN entities e ON e.id = k.entity_id
      LEFT JOIN keyword_links kl ON kl.keyword_id = k.id
      ${whereClause}
      ORDER BY (k.weight * k.confidence) DESC, k.last_seen DESC
      LIMIT ?
      `,
      [...params, options.limit || 100],
    );

    const summaries = new Map<number, KeywordMatchSummary>();
    for (const row of rows || []) {
      const entityId = row.matched_entity_id;
      const summary =
        summaries.get(entityId) ||
        ({
          entityId,
          keywordMatchScore: 0,
          matchedKeywords: [] as string[],
          keywordSources: [] as string[],
          keywordCouplings: [] as KeywordMatchSummary["keywordCouplings"],
        } satisfies KeywordMatchSummary);

      const score =
        Number(row.weight || 1) *
        Number(row.confidence || 1) *
        sourceBoost(row.source_type) *
        typeBoost(row.keyword_type);
      summary.keywordMatchScore += score;
      pushUnique(summary.matchedKeywords, row.keyword);
      pushUnique(summary.keywordSources, `${row.source_type}:${row.keyword_type}`);
      if (row.linked_type && summary.keywordCouplings.length < 8) {
        summary.keywordCouplings.push({
          keyword: row.keyword,
          linked_type: row.linked_type,
          relation_type: row.link_relation_type,
          weight: Number(row.link_weight || 1),
        });
      }
      summaries.set(entityId, summary);
    }

    for (const summary of summaries.values()) {
      summary.keywordMatchScore = Number(summary.keywordMatchScore.toFixed(3));
      summary.matchedKeywords = summary.matchedKeywords.slice(0, 12);
      summary.keywordSources = summary.keywordSources.slice(0, 12);
    }
    return summaries;
  }

  private async upsertSignals(
    entityId: number,
    branchId: number,
    signals: KeywordSignal[],
    relationId?: number,
  ): Promise<void> {
    const byKey = new Map<string, KeywordSignal>();
    for (const signal of signals) {
      const normalized = signal.normalizedKeyword || normalizeKeyword(signal.keyword);
      if (!normalized || normalized.length < 2) continue;
      const key = [
        normalized,
        signal.sourceType,
        signal.sourceId ?? entityId,
        signal.observationId ?? "",
        signal.keywordType,
      ].join("|");
      const existing = byKey.get(key);
      if (!existing || signal.weight > existing.weight) {
        byKey.set(key, { ...signal, normalizedKeyword: normalized });
      }
    }

    for (const signal of byKey.values()) {
      const sourceId = String(signal.sourceId ?? entityId);
      const existing = await this.connection.getQuery(
        `SELECT id FROM keywords
         WHERE entity_id = ? AND normalized_keyword = ? AND source_type = ? AND source_id = ?
           AND ((observation_id IS NULL AND ? IS NULL) OR observation_id = ?)
           AND keyword_type = ?`,
        [
          entityId,
          signal.normalizedKeyword,
          signal.sourceType,
          sourceId,
          signal.observationId ?? null,
          signal.observationId ?? null,
          signal.keywordType,
        ],
      );

      const metadata = JSON.stringify(signal.metadata || {});
      let keywordId = existing?.id;
      if (keywordId) {
        await this.connection.execute(
          `UPDATE keywords
           SET keyword = ?, weight = MAX(weight, ?), confidence = MAX(confidence, ?),
               context = ?, position = ?, phrase_length = ?, last_seen = CURRENT_TIMESTAMP,
               metadata = ?
           WHERE id = ?`,
          [
            signal.keyword,
            signal.weight,
            signal.confidence,
            signal.context || null,
            signal.position ?? null,
            signal.phraseLength,
            metadata,
            keywordId,
          ],
        );
      } else {
        const inserted = await this.connection.execute(
          `INSERT INTO keywords (
            keyword, normalized_keyword, entity_id, weight, context, source_type,
            source_id, branch_id, observation_id, keyword_type, confidence, position,
            phrase_length, last_seen, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
          [
            signal.keyword,
            signal.normalizedKeyword,
            entityId,
            signal.weight,
            signal.context || null,
            signal.sourceType,
            sourceId,
            branchId,
            signal.observationId ?? null,
            signal.keywordType,
            signal.confidence,
            signal.position ?? null,
            signal.phraseLength,
            metadata,
          ],
        );
        keywordId = inserted.lastID;
      }

      const links: KeywordLink[] = signal.links?.length
        ? signal.links
        : [
            {
              linkedType: relationId ? "relation" : "entity",
              linkedId: relationId ?? entityId,
              relationType: relationId ? "relation_keyword" : "source",
              weight: signal.weight,
            },
          ];
      for (const link of links) {
        await this.connection.execute(
          `INSERT OR REPLACE INTO keyword_links (
            keyword_id, entity_id, linked_type, linked_id, relation_type, weight, metadata, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [
            keywordId,
            entityId,
            link.linkedType,
            link.linkedId === undefined ? null : String(link.linkedId),
            link.relationType,
            link.weight,
            JSON.stringify(link.metadata || {}),
          ],
        );
      }
    }
  }
}

function observationWeight(obs: any): number {
  const priority = String(obs.priority || "").toLowerCase();
  if (priority === "high" || priority === "critical") return 1.8;
  if (priority === "low") return 0.8;
  return 1.2;
}

function sourceBoost(sourceType: string): number {
  if (sourceType === "entity_name") return 1.8;
  if (sourceType === "relation") return 1.6;
  if (sourceType === "observation") return 1.35;
  if (sourceType === "code_interface") return 1.4;
  return 1;
}

function typeBoost(keywordType: string): number {
  if (keywordType === "dependency" || keywordType === "decision") return 1.4;
  if (keywordType === "symbol" || keywordType === "path") return 1.25;
  if (keywordType === "phrase") return 1.15;
  return 1;
}

function pushUnique(values: string[], value: string): void {
  if (value && !values.includes(value)) values.push(value);
}
