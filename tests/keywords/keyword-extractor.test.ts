import { describe, expect, it } from "vitest";

import { ContextualKeywordExtractor } from "../../modules/keywords/keyword-extractor.js";

describe("contextual keyword extractor", () => {
  it("emits source-aware signals for decisions, dependencies, paths, and code symbols", () => {
    const extractor = new ContextualKeywordExtractor();
    const signals = extractor.extract({
      text: "Decision: TokenStore requires AuthRefreshJob before src/auth/token_store.cpp can call RefreshTokenCache::Rotate(). The worker is blocked by DMA_RING_BUFFER errors.",
      sourceType: "observation",
      sourceId: 42,
      observationId: 42,
      branchId: 7,
      baseWeight: 1.5,
      context: "AuthTask",
    });

    expect(signals.some((signal) => signal.keywordType === "decision")).toBe(true);
    expect(signals.some((signal) => signal.keywordType === "dependency")).toBe(true);
    expect(signals.some((signal) => signal.keywordType === "path")).toBe(true);
    expect(signals.some((signal) => signal.keyword === "DMA_RING_BUFFER")).toBe(true);
    expect(signals.some((signal) => signal.normalizedKeyword === "the")).toBe(false);
    expect(signals.every((signal) => signal.sourceType === "observation")).toBe(true);
  });
});
