import * as fs from "fs";
import * as path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SMART_MEMORY_TOOLS } from "../../modules/smart-memory-tools.js";
import {
  createStdioClient,
  expectJsonError,
  parseTextResponse,
} from "../utils/mcp-test-utils.js";

describe("MCP stdio contract", () => {
  let ctx: Awaited<ReturnType<typeof createStdioClient>>;

  beforeAll(async () => {
    ctx = await createStdioClient();
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it("lists the production tool surface with valid input schemas", async () => {
    const listed = await ctx.client.listTools();
    const listedNames = new Set(listed.tools.map((tool) => tool.name));

    for (const tool of SMART_MEMORY_TOOLS) {
      expect(listedNames.has(tool.name), `missing tool ${tool.name}`).toBe(true);
    }

    for (const tool of listed.tools) {
      expect(tool.name).toEqual(expect.any(String));
      expect(tool.description).toEqual(expect.any(String));
      expect(tool.inputSchema?.type).toBe("object");
    }
  });

  it("round-trips core memory tools through the MCP boundary", async () => {
    const createResult = await ctx.client.callTool({
      name: "create_entities",
      arguments: {
        branch_name: "main",
        auto_create_relations: false,
        entities: [
          {
            name: "MCPContract_AuthService",
            entityType: "service",
            observations: [
              "Issues JWT access tokens",
              "Requires TokenStore dependency for refresh token revocation",
            ],
          },
          {
            name: "MCPContract_TokenStore",
            entityType: "database",
            observations: ["Persists refresh token hashes"],
          },
        ],
      },
    });
    const created = parseTextResponse(createResult);
    expect(created.created_count).toBe(2);
    expect(created.branch).toBe("main");

    const branchResult = await ctx.client.callTool({
      name: "read_memory_branch",
      arguments: { branch_name: "main", include_statuses: ["active"] },
    });
    const branch = parseTextResponse(branchResult);
    expect(branch.counts.entities).toBeGreaterThanOrEqual(2);
    expect(branch.entities.map((entity: any) => entity.name)).toContain(
      "MCPContract_AuthService",
    );

    const searchResult = await ctx.client.callTool({
      name: "smart_search",
      arguments: {
        query: "refresh token revocation",
        branch_name: "main",
        include_context: true,
        include_confidence_scores: true,
      },
    });
    const search = parseTextResponse(searchResult);
    expect(search.entities.map((entity: any) => entity.name)).toContain(
      "MCPContract_AuthService",
    );
    expect(search.query).toBe("refresh token revocation");
  });

  it("exercises context, workflow, workspace, and ML tool envelopes", async () => {
    const decisionResult = await ctx.client.callTool({
      name: "capture_decision",
      arguments: {
        decision_title: "Use token revocation table",
        decision_rationale: "Revocation must survive process restarts.",
        related_entities: ["MCPContract_AuthService"],
      },
    });
    const decision = parseTextResponse(decisionResult);
    expect(decision.entity.name).toBe("Decision: Use token revocation table");
    expect(decision.relationships_created).toBe(1);

    const contextResult = await ctx.client.callTool({
      name: "get_context",
      arguments: {
        mode: "working",
        branch_name: "main",
        include_related: true,
        max_related: 5,
      },
    });
    const context = parseTextResponse(contextResult);
    expect(context.mode).toBe("working");
    expect(context.entities.length).toBeGreaterThan(0);

    const srcDir = path.join(ctx.memoryRoot, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, "contract-fixture.ts"),
      "export interface ContractFixture { id: string }\n",
    );
    const workspaceResult = await ctx.client.callTool({
      name: "analyze_workspace",
      arguments: {
        mode: "sync",
        workspace_path: ctx.memoryRoot,
        file_patterns: ["*.ts"],
        create_structure_entities: true,
        link_existing_entities: false,
      },
    });
    const workspace = parseTextResponse(workspaceResult);
    expect(workspace.mode).toBe("sync");
    expect(workspace.total_files).toBeGreaterThanOrEqual(1);
    expect(workspace.memory_ignore_patterns).toEqual(expect.any(Array));

    const mlError = await ctx.client.callTool({
      name: "embeddings",
      arguments: { action: "find_similar" },
    });
    expect(mlError.isError).not.toBe(true);
    expect(parseTextResponse(mlError).error).toMatch(/code_snippet/i);
  });

  it("returns contract-level errors for malformed or unknown calls", async () => {
    const missingArgs = await ctx.client.callTool({
      name: "list_memory_branches",
    });
    expectJsonError(missingArgs, /No arguments provided/i);

    const missingSearchArgs = await ctx.client.callTool({
      name: "smart_search",
      arguments: { query: "auth" },
    });
    expectJsonError(missingSearchArgs, /branch_name is required/i);

    const unknown = await ctx.client.callTool({
      name: "__definitely_not_a_tool__",
      arguments: {},
    });
    expect(unknown.isError).toBe(true);
    const text = (unknown.content as any[]).find((item: any) => item.type === "text")?.text;
    expect(text).toMatch(/Unknown tool/i);
  });
});
