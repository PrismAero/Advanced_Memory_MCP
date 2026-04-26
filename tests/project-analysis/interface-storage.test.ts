import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";

import { InterfaceExtractorRunner } from "../../modules/project-analysis/interfaces/interface-extractor-runner.js";
import { createInitializedApp } from "../utils/mcp-test-utils.js";

describe("advanced interface storage", () => {
  it("persists rich code-interface metadata and dedupes stable symbols", async () => {
    const ctx = await createInitializedApp();
    try {
      const relativePath = "cpp/network.hpp";
      const filePath = path.join(process.cwd(), "tests", "fixtures", "code-interfaces", relativePath);
      const content = fs.readFileSync(filePath, "utf8");
      const runner = new InterfaceExtractorRunner();
      const extraction = await runner.extract(content, {
        language: "cpp",
        filePath,
        relativePath,
      });
      const fileRecord =
        await ctx.app.dependencies.projectAnalysisOps.storeOrUpdateProjectFile(
          {
            filePath,
            relativePath,
            fileType: {
              extension: ".hpp",
              language: "cpp",
              category: "source",
              hasImports: true,
              hasExports: false,
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
              complexity: "medium",
              documentation: 0.4,
            },
          },
          1,
        );
      expect(fileRecord?.id).toEqual(expect.any(Number));

      const firstStore =
        await ctx.app.dependencies.projectAnalysisOps.storeCodeInterfaces(
          fileRecord!.id!,
          extraction.interfaces,
        );
      const secondStore =
        await ctx.app.dependencies.projectAnalysisOps.storeCodeInterfaces(
          fileRecord!.id!,
          extraction.interfaces,
        );
      expect(secondStore.length).toBe(firstStore.length);

      const interfaces = await ctx.app.dependencies.projectAnalysisOps.getCodeInterfaces({
        language: "cpp",
        kind: "macro",
        name: "DECLARE_CONTROLLER",
        limit: 10,
      });
      expect(interfaces).toHaveLength(1);
      const macro = interfaces[0];
      expect(macro.qualified_name).toBe("DECLARE_CONTROLLER");
      expect(macro.kind).toBe("macro");
      expect(macro.language).toBe("cpp");
      expect(macro.metadata).toMatch(/macroParameters/);
      expect(macro.documentation).toMatch(/typed Qt-style/);
    } finally {
      await ctx.cleanup();
    }
  });
});
