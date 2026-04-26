import type {
  KeywordExtractionInput,
  KeywordSignal,
  KeywordSourceType,
  KeywordType,
} from "./keyword-types.js";

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "onto",
  "have",
  "has",
  "had",
  "will",
  "would",
  "should",
  "could",
  "just",
  "only",
  "also",
  "very",
  "really",
  "when",
  "then",
  "than",
  "there",
  "their",
  "they",
  "them",
  "been",
  "being",
  "about",
  "after",
  "before",
  "while",
  "where",
  "what",
  "which",
  "using",
]);

const TYPE_HINTS: Array<{ pattern: RegExp; type: KeywordType; weight: number }> = [
  { pattern: /\b(depends?|requires?|needs?|blocked?|blocks?)\b/i, type: "dependency", weight: 1.5 },
  { pattern: /\b(decision|decided|chosen|rationale|tradeoff)\b/i, type: "decision", weight: 1.4 },
  { pattern: /\b(status|progress|phase|active|draft|deprecated|archived)\b/i, type: "status", weight: 1.25 },
  { pattern: /\b(error|exception|failure|bug|crash|fault)\b/i, type: "error", weight: 1.35 },
];

export class ContextualKeywordExtractor {
  extract(input: KeywordExtractionInput): KeywordSignal[] {
    const signals = [
      ...this.extractSymbols(input),
      ...this.extractPaths(input),
      ...this.extractPhrases(input),
      ...this.extractTerms(input),
    ];
    return this.dedupeAndRank(signals).slice(0, 80);
  }

  extractText(text: string): KeywordSignal[] {
    return this.extract({ text, sourceType: "entity_content" });
  }

  private extractTerms(input: KeywordExtractionInput): KeywordSignal[] {
    const matches = [...input.text.matchAll(/\b[A-Za-z][A-Za-z0-9_]{2,}\b/g)];
    return matches
      .filter((match) => !STOP_WORDS.has(match[0].toLowerCase()))
      .map((match) =>
        this.signal(match[0], input, {
          keywordType: this.classify(match[0], "term"),
          position: match.index,
          phraseLength: 1,
          weightMultiplier: /[A-Z0-9_]/.test(match[0]) ? 1.2 : 1,
        }),
      );
  }

  private extractPhrases(input: KeywordExtractionInput): KeywordSignal[] {
    const tokens = [...input.text.matchAll(/\b[A-Za-z][A-Za-z0-9_]{2,}\b/g)]
      .map((match) => ({ value: match[0], index: match.index || 0 }))
      .filter((token) => !STOP_WORDS.has(token.value.toLowerCase()));
    const out: KeywordSignal[] = [];
    for (let i = 0; i < tokens.length - 1; i++) {
      const pair = `${tokens[i].value} ${tokens[i + 1].value}`;
      if (pair.length > 80) continue;
      out.push(
        this.signal(pair, input, {
          keywordType: this.classify(pair, "phrase"),
          position: tokens[i].index,
          phraseLength: 2,
          weightMultiplier: 1.35,
        }),
      );
    }
    return out;
  }

  private extractSymbols(input: KeywordExtractionInput): KeywordSignal[] {
    const patterns = [
      /\b[A-Z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*\b/g,
      /\b[a-z]+[A-Z][A-Za-z0-9]*\b/g,
      /\b[A-Z_][A-Z0-9_]{2,}\b/g,
      /\b[A-Za-z_][A-Za-z0-9_]*\([^)]*\)/g,
      /\b[A-Za-z_][A-Za-z0-9_]*(?:::|\.|\/)[A-Za-z_][A-Za-z0-9_:./-]*\b/g,
    ];
    return patterns.flatMap((pattern) =>
      [...input.text.matchAll(pattern)].map((match) =>
        this.signal(match[0], input, {
          keywordType: "symbol",
          position: match.index,
          phraseLength: 1,
          weightMultiplier: 1.75,
        }),
      ),
    );
  }

  private extractPaths(input: KeywordExtractionInput): KeywordSignal[] {
    const pattern = /(?:[A-Za-z]:)?[./\\]?[A-Za-z0-9_.-]+(?:[/\\][A-Za-z0-9_.-]+)+/g;
    return [...input.text.matchAll(pattern)].map((match) =>
      this.signal(match[0], input, {
        keywordType: "path",
        position: match.index,
        phraseLength: 1,
          weightMultiplier: 2,
      }),
    );
  }

  private signal(
    keyword: string,
    input: KeywordExtractionInput,
    options: {
      keywordType: KeywordType;
      position?: number;
      phraseLength: number;
      weightMultiplier: number;
    },
  ): KeywordSignal {
    const normalized = normalizeKeyword(keyword);
    const sourceWeight = sourceWeightFor(input.sourceType);
    const typeBoost =
      TYPE_HINTS.find((hint) => hint.pattern.test(keyword))?.weight || 1;
    const weight =
      (input.baseWeight || 1) * sourceWeight * options.weightMultiplier * typeBoost;
    return {
      keyword,
      normalizedKeyword: normalized,
      keywordType: options.keywordType,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      observationId: input.observationId,
      branchId: input.branchId,
      weight: Number(weight.toFixed(3)),
      confidence: confidenceFor(options.keywordType, input.sourceType),
      position: options.position,
      phraseLength: options.phraseLength,
      context: input.context,
      metadata: input.metadata,
      links: input.sourceId
        ? [
            {
              linkedType:
                input.sourceType === "observation" ? "observation" : "entity",
              linkedId: input.observationId || input.sourceId,
              relationType: "source",
              weight: Number(weight.toFixed(3)),
            },
          ]
        : [],
    };
  }

  private classify(value: string, fallback: KeywordType): KeywordType {
    for (const hint of TYPE_HINTS) {
      if (hint.pattern.test(value)) return hint.type;
    }
    if (/[A-Z_][A-Z0-9_]{2,}/.test(value) || /[A-Za-z_][\w]*\(/.test(value)) {
      return "symbol";
    }
    return fallback;
  }

  private dedupeAndRank(signals: KeywordSignal[]): KeywordSignal[] {
    const byKey = new Map<string, KeywordSignal>();
    for (const signal of signals) {
      if (!signal.normalizedKeyword || signal.normalizedKeyword.length < 2) continue;
      const key = `${signal.normalizedKeyword}:${signal.sourceType}:${signal.sourceId ?? ""}:${signal.observationId ?? ""}`;
      const existing = byKey.get(key);
      if (!existing || signal.weight > existing.weight) byKey.set(key, signal);
    }
    return Array.from(byKey.values()).sort((a, b) => b.weight - a.weight);
  }
}

export function normalizeKeyword(keyword: string): string {
  return keyword
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[^\p{L}\p{N}_./\\:-]+/gu, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function sourceWeightFor(sourceType: KeywordSourceType): number {
  switch (sourceType) {
    case "entity_name":
      return 3;
    case "entity_type":
      return 2;
    case "observation":
      return 1.7;
    case "relation":
      return 2.5;
    case "code_interface":
      return 2.2;
    case "project_file":
      return 1.6;
    case "branch":
      return 1.5;
    default:
      return 1;
  }
}

function confidenceFor(keywordType: KeywordType, sourceType: KeywordSourceType): number {
  const base = keywordType === "symbol" || keywordType === "path" ? 0.9 : 0.75;
  const sourceBoost =
    sourceType === "entity_name" || sourceType === "relation" || sourceType === "code_interface"
      ? 0.08
      : 0;
  return Math.min(1, Number((base + sourceBoost).toFixed(2)));
}
