import * as fs from "fs";
import * as path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ProjectIndexer } from "../../modules/project-analysis/project-indexer.js";
import {
  createInitializedApp,
  parseTextResponse,
} from "../utils/mcp-test-utils.js";

describe("MCP handler integration", () => {
  let ctx: Awaited<ReturnType<typeof createInitializedApp>>;

  beforeAll(async () => {
    ctx = await createInitializedApp();
  });

  afterAll(async () => {
    await ctx?.cleanup();
  });

  it("validates entity and branch handler envelopes plus sanitization", async () => {
    const created = parseTextResponse(
      await ctx.app.handleToolCall("create_entities", {
        branch_name: "handler-main",
        auto_create_relations: false,
        entities: [
          {
            name: "Handler_Entity",
            entityType: "service",
            observations: Array.from({ length: 8 }, (_, i) => `observation ${i}`),
            embedding: Array.from({ length: 512 }, () => 0.1),
          },
        ],
      }),
    );
    expect(created.created_count).toBe(1);
    expect(created.entities[0].embedding).toBeUndefined();
    expect(created.entities[0].observations.length).toBeLessThanOrEqual(5);
    expect(created.entities[0].observations_truncated).toBeGreaterThan(0);

    const branch = parseTextResponse(
      await ctx.app.handleToolCall("read_memory_branch", {
        branch_name: "handler-main",
        max_observations: 2,
      }),
    );
    expect(branch.counts.entities).toBe(1);
    expect(branch.entities[0].observations.length).toBe(2);
    expect(branch.entities[0].observations_truncated).toBe(6);
  });

  it("rejects malformed handler payloads with MCP error envelopes", async () => {
    const missingEntityName = await ctx.app.handleToolCall("update_entity_status", {
      status: "archived",
    });
    expect(missingEntityName.isError).toBe(true);
    expect(parseTextResponse(missingEntityName).error).toMatch(
      /entity_name and status are required/i,
    );

    const unknownMode = await ctx.app.handleToolCall("get_context", {
      mode: "definitely-not-real",
    });
    expect(unknownMode.isError).toBe(true);
    expect(parseTextResponse(unknownMode).error).toMatch(/Unknown context mode/i);
  });

  it("exercises workflow and context semantics with persisted state", async () => {
    await ctx.app.handleToolCall("create_entities", {
      branch_name: "workflow",
      auto_create_relations: false,
      entities: [
        {
          name: "Workflow_AuthTask",
          entityType: "task",
          observations: [
            "Implement login flow",
            "Requires TokenStore before refresh token revocation can ship",
          ],
        },
        {
          name: "Workflow_TokenStore",
          entityType: "service",
          observations: ["Stores refresh token hashes"],
        },
      ],
    });

    const focus = parseTextResponse(
      await ctx.app.handleToolCall("mark_current_work", {
        branch_name: "workflow",
        focus_entities: ["Workflow_AuthTask"],
        focus_description: "Hardening authentication workflow",
      }),
    );
    expect(focus.results).toEqual([
      expect.objectContaining({ entity: "Workflow_AuthTask", marked: true }),
    ]);

    const working = parseTextResponse(
      await ctx.app.handleToolCall("get_context", {
        mode: "working",
        branch_name: "workflow",
        include_related: true,
      }),
    );
    expect(working.entities.map((entity: any) => entity.name)).toContain(
      "Workflow_AuthTask",
    );

    const dependencies = parseTextResponse(
      await ctx.app.handleToolCall("check_missing_dependencies", {
        branch_name: "workflow",
        work_description: "Ship auth workflow",
        entity_names: ["Workflow_AuthTask"],
      }),
    );
    expect(dependencies.count).toBe(1);
    expect(dependencies.dependencies[0].dependency_description).toMatch(
      /Requires TokenStore/i,
    );

    const phase = parseTextResponse(
      await ctx.app.handleToolCall("update_status", {
        mode: "phase",
        branch_name: "workflow",
        project_phase: "active-development",
        status_updates: [
          {
            entity_pattern: "Workflow_AuthTask",
            new_status: "draft",
            reason: "Needs dependency first",
          },
        ],
      }),
    );
    expect(phase.mode).toBe("phase");
    expect(phase.branch_updates[0].entity_updates).toEqual(
      expect.arrayContaining([
      expect.objectContaining({
        entity: "Workflow_AuthTask",
        new_status: "draft",
      }),
      ]),
    );
  });

  it("exercises search handler branch modes and workspace path ownership", async () => {
    await ctx.app.handleToolCall("create_entities", {
      branch_name: "search-a",
      auto_create_relations: false,
      entities: [
        {
          name: "Search_A_Auth",
          entityType: "service",
          observations: ["OAuth callback handler"],
        },
      ],
    });
    await ctx.app.handleToolCall("create_entities", {
      branch_name: "search-b",
      auto_create_relations: false,
      entities: [
        {
          name: "Search_B_Billing",
          entityType: "service",
          observations: ["Invoice reconciliation worker"],
        },
      ],
    });

    const scoped = parseTextResponse(
      await ctx.app.handleToolCall("smart_search", {
        query: "OAuth callback",
        branch_name: "search-a",
      }),
    );
    expect(scoped.entities.map((entity: any) => entity.name)).toContain(
      "Search_A_Auth",
    );
    expect(scoped.entities.map((entity: any) => entity.name)).not.toContain(
      "Search_B_Billing",
    );

    const global = parseTextResponse(
      await ctx.app.handleToolCall("smart_search", {
        query: "service",
        branch_name: "*",
      }),
    );
    expect(global.branch).toBe("*");

    const srcDir = path.join(ctx.memoryRoot, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, "owned.ts"), "export const owned = true;\n");

    const workspace = parseTextResponse(
      await ctx.app.handleToolCall("analyze_workspace", {
        mode: "sync",
        workspace_path: ctx.memoryRoot,
        create_structure_entities: false,
        link_existing_entities: false,
      }),
    );
    expect(workspace.total_files).toBeGreaterThanOrEqual(1);

    const rejected = await ctx.app.handleToolCall("analyze_workspace", {
      mode: "sync",
      workspace_path: path.dirname(ctx.memoryRoot),
    });
    expect(rejected.isError).toBe(true);
    expect(parseTextResponse(rejected).error).toMatch(/must be within/i);
  });

  it("keeps smart_search targeted by default", async () => {
    const entities = Array.from({ length: 14 }, (_, index) => ({
      name: `Search_Narrow_${index}`,
      entityType: "service",
      observations: [`shared target phrase ${index}`],
    }));
    await ctx.app.handleToolCall("create_entities", {
      branch_name: "search-narrow-defaults",
      auto_create_relations: false,
      entities,
    });

    const result = parseTextResponse(
      await ctx.app.handleToolCall("smart_search", {
        query: "shared target phrase",
        branch_name: "search-narrow-defaults",
      }),
    );

    expect(result.entities).toHaveLength(10);
    expect(result.counts.entities).toBe(10);
    expect(result.confidence_scores).toBeUndefined();
    expect(result.entities[0].keywordMatchScore).toBeUndefined();
    expect(result.entities[0].entityType).toBeUndefined();
    expect(result.relations).toEqual([]);
    expect(Object.keys(result).slice(0, 4)).toEqual([
      "entities",
      "counts",
      "query",
      "branch",
    ]);
    expect(Object.keys(result.entities[0]).slice(0, 4)).toEqual([
      "name",
      "type",
      "status",
      "score",
    ]);
    expect(result.entities[0].obs).toBeDefined();
  });

  it("returns compact intelligence context with runtime stats and project evidence", async () => {
    await ctx.app.handleToolCall("create_entities", {
      branch_name: "intelligence-context",
      auto_create_relations: false,
      entities: [
        {
          name: "Intel_ContextTask",
          entityType: "task",
          observations: [
            "Next action: wire ContractFixture dependency before release.",
            "Risk: missing interface evidence can mislead agents.",
          ],
        },
      ],
    });
    await ctx.app.handleToolCall("mark_current_work", {
      branch_name: "intelligence-context",
      focus_entities: ["Intel_ContextTask"],
    });

    const working = parseTextResponse(
      await ctx.app.handleToolCall("get_context", {
        mode: "working",
        branch_name: "intelligence-context",
        include_related: false,
      }),
    );
    expect(working.entities[0]).toEqual(
      expect.objectContaining({
        name: "Intel_ContextTask",
        type: "task",
        score: expect.objectContaining({ work: true }),
      }),
    );

    const srcDir = path.join(ctx.memoryRoot, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    const fixturePath = path.join(srcDir, "contract-fixture.ts");
    fs.writeFileSync(
      fixturePath,
      "export interface ContractFixture { id: string; token: string }\n",
    );
    const analyzedFile = await new ProjectIndexer().analyzeFile(
      fixturePath,
      ctx.memoryRoot,
    );
    expect(analyzedFile).toBeTruthy();
    const [storedFile] =
      await ctx.app.dependencies.projectAnalysisOps.storeProjectFiles([
        analyzedFile!,
      ]);
    await ctx.app.dependencies.projectAnalysisOps.storeCodeInterfaces(
      storedFile.id!,
      analyzedFile!.interfaces,
    );

    const project = parseTextResponse(
      await ctx.app.handleToolCall("get_context", {
        mode: "project",
        current_file: fixturePath,
        search_query: "ContractFixture dependency",
        active_interfaces: ["ContractFixture"],
      }),
    );
    expect(project.evidence.interfaces.map((item: any) => item.name)).toContain(
      "ContractFixture",
    );
    expect(project.suggestions.length).toBeGreaterThan(0);

    const status = parseTextResponse(
      await ctx.app.handleToolCall("get_project_status", {
        detail_level: "summary",
        include_inactive: true,
      }),
    );
    expect(status.background_runtime.queues.length).toBeGreaterThan(0);
  });
});
