import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createInitializedApp,
  parseTextResponse,
} from "../utils/mcp-test-utils.js";

describe("keyword coupling stress", () => {
  let ctx: Awaited<ReturnType<typeof createInitializedApp>>;

  beforeAll(async () => {
    ctx = await createInitializedApp();
  });

  afterAll(async () => {
    await ctx?.cleanup();
  });

  it("keeps specific coupled symbols ahead of repeated generic terms", async () => {
    const genericEntities = Array.from({ length: 35 }, (_, index) => ({
      name: `KeywordStress_Generic_${index}`,
      entityType: "service",
      observations: [
        "cache service worker handles common retry queue and generic status update",
        "service cache worker generic retry queue status repeated for noise",
      ],
    }));

    await ctx.app.handleToolCall("create_entities", {
      branch_name: "keyword-stress",
      auto_create_relations: false,
      entities: [
        ...genericEntities,
        {
          name: "KeywordStress_SpecificClockSkew",
          entityType: "incident",
          observations: [
            "Failure ZEUS_CLOCK_SKEW_FAILURE in time_sync/clock_guard.cpp blocks release.",
            "Decision: TimeSyncMonitor requires ClockSkewFence before rollout.",
          ],
        },
      ],
    });

    const result = parseTextResponse(
      await ctx.app.handleToolCall("smart_search", {
        branch_name: "keyword-stress",
        query: "ZEUS_CLOCK_SKEW_FAILURE",
        include_confidence_scores: true,
        max_observations: 1,
      }),
    );

    expect(result.entities[0].name).toBe("KeywordStress_SpecificClockSkew");
    expect(result.entities[0].matchedKeywords).toContain("ZEUS_CLOCK_SKEW_FAILURE");
    expect(result.entities[0].observations.length).toBeLessThanOrEqual(1);
    expect(result.entities[0].keywordSources.length).toBeLessThanOrEqual(12);
  });
});
