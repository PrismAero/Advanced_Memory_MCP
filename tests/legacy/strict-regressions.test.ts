import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createInitializedApp, parseTextResponse } from "../utils/mcp-test-utils.js";

describe("strict regressions for legacy false-green cases", () => {
  let ctx: Awaited<ReturnType<typeof createInitializedApp>>;

  beforeAll(async () => {
    ctx = await createInitializedApp();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it("does not silently create relations when either endpoint is missing", async () => {
    const created = await ctx.app.dependencies.memoryManager.createRelations([
      { from: "Missing_A", to: "Missing_B", relationType: "depends_on" },
    ]);
    expect(created).toHaveLength(0);
    const graph = await ctx.app.dependencies.memoryManager.readGraph();
    expect(
      graph.relations.some(
        (relation: any) => relation.from === "Missing_A" || relation.to === "Missing_B",
      ),
    ).toBe(false);
  });

  it("persists working-context updates instead of only reporting success", async () => {
    await ctx.app.handleToolCall("create_entities", {
      branch_name: "strict-context",
      auto_create_relations: false,
      entities: [
        {
          name: "Strict_WorkItem",
          entityType: "task",
          observations: ["active work item"],
        },
      ],
    });
    const focus = parseTextResponse(
      await ctx.app.handleToolCall("mark_current_work", {
        branch_name: "strict-context",
        focus_entities: ["Strict_WorkItem"],
      }),
    );
    expect(focus.results[0]).toEqual(
      expect.objectContaining({ entity: "Strict_WorkItem", marked: true }),
    );
    const entity = await ctx.app.dependencies.memoryManager.findEntityByName(
      "Strict_WorkItem",
      "strict-context",
    );
    expect(entity?.workingContext).toBe(true);
    expect(entity?.relevanceScore).toBeGreaterThanOrEqual(0.9);
  });

  it("requires semantic code search to retrieve the freshly stored interface", async () => {
    const embeddingEngine = ctx.app.dependencies.backgroundProcessor.getProjectEmbeddingEngine()!;
    const embedding = await embeddingEngine.generateProjectEmbedding(
      "interface StrictMathOperation { execute(a: number, b: number): number; }",
      "interface_definition",
    );
    expect(embedding?.embedding).toHaveLength(512);

    const fileRecord = await ctx.app.dependencies.projectAnalysisOps.storeOrUpdateProjectFile(
      {
        filePath: `${ctx.memoryRoot}/strict-math.ts`,
        relativePath: "strict-math.ts",
        fileType: {
          extension: ".ts",
          language: "typescript",
          category: "source",
          hasImports: false,
          hasExports: true,
          canDefineInterfaces: true,
        },
        size: 100,
        lastModified: new Date(),
        imports: [],
        exports: [],
        interfaces: [],
        dependencies: [],
        isEntryPoint: false,
        analysisMetadata: {
          lineCount: 1,
          hasTests: false,
          complexity: "low",
          documentation: 0.8,
        },
      },
      1,
    );
    expect(fileRecord?.id).toEqual(expect.any(Number));
    const fileId = fileRecord!.id;
    if (fileId === undefined) throw new Error("file id missing");

    await ctx.app.dependencies.projectAnalysisOps.storeCodeInterface(
      fileId,
      {
        name: "StrictMathOperation",
        properties: ["execute"],
        extends: [],
        line: 1,
        isExported: true,
      },
      embedding!.embedding,
    );

    const query = await embeddingEngine.generateProjectEmbedding(
      "calculate numeric operation",
      "business_logic",
    );
    const results = await ctx.app.dependencies.projectAnalysisOps.findSimilarInterfaces(
      query!.embedding,
      5,
    );
    expect(results.map((result) => result.interface.name)).toContain("StrictMathOperation");
  });
});
