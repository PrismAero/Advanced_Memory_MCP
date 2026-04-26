import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createInitializedApp } from "../utils/mcp-test-utils.js";

describe("aggressive MCP stress and quality gates", () => {
  let ctx: Awaited<ReturnType<typeof createInitializedApp>>;

  beforeAll(async () => {
    ctx = await createInitializedApp();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it("keeps same-key concurrent entity creation idempotent", async () => {
      const settled = await Promise.allSettled(
        Array.from({ length: 32 }, (_, i) =>
          ctx.app.dependencies.memoryManager.createEntities(
            [
              {
                name: "Stress_SameKey",
                entityType: "stress",
                observations: [`writer ${i}`],
              },
            ],
            "stress",
          ),
        ),
      );
      const rejected = settled.filter((result) => result.status === "rejected");
      expect(rejected).toEqual([]);

      const graph = await ctx.app.dependencies.memoryManager.readGraph("stress");
      const rows = graph.entities.filter((entity: any) => entity.name === "Stress_SameKey");
      expect(rows).toHaveLength(1);
      expect(rows[0].observations[0]).toMatch(/^writer \d+$/);
  });

  it("survives concurrent memory and project-analysis writes on the shared SQLite connection", async () => {
      const projectWrites = Array.from({ length: 40 }, (_, i) =>
        ctx.app.dependencies.projectAnalysisOps.storeOrUpdateProjectFile(
          {
            filePath: `${ctx.memoryRoot}/stress/file-${i}.ts`,
            relativePath: `stress/file-${i}.ts`,
            fileType: {
              extension: ".ts",
              language: "typescript",
              category: "source",
              hasImports: i % 2 === 0,
              hasExports: true,
              canDefineInterfaces: true,
            },
            size: 100 + i,
            lastModified: new Date(),
            imports:
              i % 2 === 0
                ? [
                    {
                      source: "./shared",
                      specifiers: ["shared"],
                      isDefault: false,
                      isNamespace: false,
                      line: 1,
                    },
                  ]
                : [],
            exports: [
              {
                name: `StressExport${i}`,
                type: "function",
                line: 1,
              },
            ],
            interfaces: [],
            dependencies: [],
            isEntryPoint: i === 0,
            analysisMetadata: {
              lineCount: 10 + i,
              hasTests: i % 5 === 0,
              complexity: i % 3 === 0 ? "medium" : "low",
              documentation: 0.5,
            },
          },
          1,
        ),
      );
      const memoryWrites = Array.from({ length: 40 }, (_, i) =>
        ctx.app.dependencies.memoryManager.createEntities(
          [
            {
              name: `Stress_Entity_${i}`,
              entityType: i % 2 === 0 ? "service" : "component",
              observations: [`stress observation ${i}`],
            },
          ],
          "stress",
        ),
      );

      const settled = await Promise.allSettled([...projectWrites, ...memoryWrites]);
      const rejected = settled.filter((result) => result.status === "rejected");
      expect(rejected).toEqual([]);

      const graph = await ctx.app.dependencies.memoryManager.readGraph("stress");
      expect(graph.entities.filter((entity: any) => entity.name.startsWith("Stress_Entity_"))).toHaveLength(40);

      const files = await ctx.app.dependencies.projectAnalysisOps.getProjectFiles({
        limit: 100,
      });
      expect(files.filter((file) => file.relative_path.startsWith("stress/"))).toHaveLength(40);
  });

  it("keeps semantic ranking stable across distractors and lexical traps", async () => {
      const target = {
        name: "Stress_Target_AuthController",
        entityType: "controller",
        observations: [
          "Handles OAuth callback validation and delegates token issuance",
        ],
      };
      const candidates = [
        {
          name: "Stress_Related_AuthService",
          entityType: "service",
          observations: ["Issues JWT tokens after OAuth callback validation"],
        },
        {
          name: "Stress_LexicalTrap_Button",
          entityType: "component",
          observations: ["Button token color callback for UI OAuth theme"],
        },
        {
          name: "Stress_Distractor_Billing",
          entityType: "service",
          observations: ["Generates invoices and reconciles card payments"],
        },
        {
          name: "Stress_Distractor_Logging",
          entityType: "infrastructure",
          observations: ["Streams structured logs to local files"],
        },
      ];

      const ranked = await ctx.app.dependencies.modernSimilarity.detectSimilarEntities(
        target as any,
        candidates as any,
      );
      expect(ranked.length).toBeGreaterThanOrEqual(2);
      expect(ranked[0].entity.name).toBe("Stress_Related_AuthService");
      const relatedScore = ranked.find(
        (result) => result.entity.name === "Stress_Related_AuthService",
      )!.similarity;
      const lexicalTrapScore = ranked.find(
        (result) => result.entity.name === "Stress_LexicalTrap_Button",
      )!.similarity;
      expect(relatedScore - lexicalTrapScore).toBeGreaterThan(0.03);
  });

  it("enforces search latency while preserving result correctness on a larger branch", async () => {
      const bulk = Array.from({ length: 250 }, (_, i) => ({
        name: `Stress_Search_${i}`,
        entityType: i % 5 === 0 ? "auth-service" : "noise",
        observations: [
          i % 5 === 0
            ? `authentication token validation path ${i}`
            : `unrelated generated fixture ${i}`,
        ],
      }));
      await ctx.app.dependencies.memoryManager.createEntities(bulk, "search-stress");

      const started = Date.now();
      const results = await ctx.app.dependencies.memoryManager.searchEntities(
        "authentication token validation",
        "search-stress",
        ["active"],
        { includeContext: true, includeConfidenceScores: true },
      );
      const duration = Date.now() - started;

      expect(duration).toBeLessThan(5_000);
      expect(results.entities.length).toBeGreaterThan(0);
      expect(results.entities[0].name).toMatch(/^Stress_Search_/);
      expect(
        results.entities.some((entity: any) =>
          entity.observations.some((obs: string) => /authentication token/i.test(obs)),
        ),
      ).toBe(true);
  });
});
