import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";

import { InterfaceExtractorRunner } from "../../modules/project-analysis/interfaces/interface-extractor-runner.js";
import { createInitializedApp, parseTextResponse } from "../utils/mcp-test-utils.js";

describe("MCP code-interface retrieval contract", () => {
  it("returns bounded deduped language-filtered code-interface results", async () => {
    const ctx = await createInitializedApp();
    try {
      const relativePath = "typescript/api.ts";
      const filePath = path.join(
        process.cwd(),
        "tests",
        "fixtures",
        "code-interfaces",
        relativePath,
      );
      const content = fs.readFileSync(filePath, "utf8");
      const runner = new InterfaceExtractorRunner();
      const extraction = await runner.extract(content, {
        language: "typescript",
        filePath,
        relativePath,
      });
      const fileRecord = await ctx.app.dependencies.projectAnalysisOps.storeOrUpdateProjectFile(
        {
          filePath,
          relativePath,
          fileType: {
            extension: ".ts",
            language: "typescript",
            category: "source",
            hasImports: true,
            hasExports: true,
            canDefineInterfaces: true,
          },
          size: content.length,
          lastModified: new Date(),
          imports: [],
          exports: [],
          interfaces: extraction.interfaces,
          dependencies: [],
          isEntryPoint: false,
          analysisMetadata: {
            lineCount: content.split("\n").length,
            hasTests: false,
            complexity: "low",
            documentation: 0.5,
          },
        },
        1,
      );
      const embeddingEngine = ctx.app.dependencies.backgroundProcessor.getProjectEmbeddingEngine()!;
      for (const iface of extraction.interfaces) {
        const embedding = await embeddingEngine.generateProjectEmbedding(
          iface.rankText || iface.definition || iface.name,
          "interface_definition",
        );
        await ctx.app.dependencies.projectAnalysisOps.storeCodeInterface(
          fileRecord!.id!,
          iface,
          embedding?.embedding,
        );
      }

      const response = parseTextResponse(
        await ctx.app.handleToolCall("embeddings", {
          action: "find_similar",
          code_snippet: "request object used to create a user with metadata",
          language: "typescript",
          kind: "interface",
          limit: 5,
          include_docs: true,
          include_members: true,
          max_members: 3,
          max_definition_chars: 180,
        }),
      );

      expect(response.action).toBe("find_similar");
      expect(response.results.length).toBeGreaterThan(0);
      const names = response.results.map((result: any) => result.name);
      expect(names).toContain("CreateUserRequest");
      expect(new Set(response.results.map((result: any) => result.qualified_name)).size).toBe(
        response.results.length,
      );
      for (const result of response.results) {
        expect(result.language).toBe("typescript");
        expect(result.kind).toBe("interface");
        expect((result.definition_preview || result.definition || "").length).toBeLessThanOrEqual(
          183,
        );
        expect(result.members.length).toBeLessThanOrEqual(3);
      }
    } finally {
      await ctx.cleanup();
    }
  });
});
