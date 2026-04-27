import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createInitializedApp,
  parseTextResponse,
} from "../utils/mcp-test-utils.js";

describe("MCP keyword coupling retrieval contract", () => {
  let ctx: Awaited<ReturnType<typeof createInitializedApp>>;

  beforeAll(async () => {
    ctx = await createInitializedApp();
  });

  afterAll(async () => {
    await ctx?.cleanup();
  });

  it("returns bounded keyword explanations and uses coupled symbols for ranking", async () => {
    await ctx.app.handleToolCall("create_entities", {
      branch_name: "keyword-contract",
      auto_create_relations: false,
      entities: [
        {
          name: "Keyword_GenericAllocator",
          entityType: "service",
          observations: [
            "Allocator service owns generic cache housekeeping and routine worker cleanup.",
          ],
        },
        {
          name: "Keyword_DeviceBootFix",
          entityType: "driver task",
          observations: [
            "Decision: DeviceBoot depends on DMA_RING_BUFFER before drivers/device_boot.cpp can initialize the bus.",
            "Blocked by DmaRingAllocator::reserve() returning E_DMA_RING_EXHAUSTED.",
          ],
        },
      ],
    });

    const result = parseTextResponse(
      await ctx.app.handleToolCall("smart_search", {
        branch_name: "keyword-contract",
        query: "DMA_RING_BUFFER",
        include_confidence_scores: true,
        max_observations: 2,
      }),
    );

    expect(result.entities[0].name).toBe("Keyword_DeviceBootFix");
    expect(result.entities[0].score.key).toBeGreaterThan(0);
    expect(result.entities[0].why.kw).toContain("DMA_RING_BUFFER");
    expect(result.entities[0].why.src.length).toBeLessThanOrEqual(6);
    expect(result.entities[0].why.links.length).toBeLessThanOrEqual(4);
    expect(result.confidence_scores).toBeUndefined();
  });
});
