import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";

import { InterfaceExtractorRunner } from "../../modules/project-analysis/interfaces/interface-extractor-runner.js";

const fixtureRoot = path.join(process.cwd(), "tests", "fixtures", "code-interfaces");

describe("advanced language interface extractors", () => {
  const runner = new InterfaceExtractorRunner();

  it.each([
    {
      language: "c",
      relativePath: "c/device.h",
      expected: [
        ["MAX_PACKET_BYTES", "macro"],
        ["DECLARE_DEVICE_INTERFACE", "macro"],
        ["DeviceStatus", "enum"],
        ["DeviceHandle", "struct"],
        ["open_device", "function"],
      ],
    },
    {
      language: "cpp",
      relativePath: "cpp/network.hpp",
      expected: [
        ["ENABLE_NETWORK_TRACE", "macro"],
        ["DECLARE_CONTROLLER", "macro"],
        ["core::network::SerializablePayload", "concept"],
        ["core::network::INetworkClient", "class"],
        ["core::network::HttpClient", "class"],
        ["core::network::TransportState", "enum"],
      ],
    },
    {
      language: "python",
      relativePath: "python/services.py",
      expected: [
        ["python.services.Repository", "class"],
        ["python.services.AccountService", "class"],
        ["python.services.AccountService.create_account", "method"],
        ["python.services.build_service", "function"],
      ],
    },
    {
      language: "typescript",
      relativePath: "typescript/api.ts",
      expected: [
        ["CreateUserRequest", "interface"],
        ["ApiResponse", "type"],
        ["UserController", "class"],
        ["createUser", "function"],
      ],
    },
    {
      language: "javascript",
      relativePath: "javascript/contracts.js",
      expected: [
        ["JobPayload", "type"],
        ["JobHandler", "function"],
        ["QueueWorker", "class"],
        ["createWorker", "function"],
      ],
    },
  ])("extracts expected $language symbols", async ({ language, relativePath, expected }) => {
    const content = fs.readFileSync(path.join(fixtureRoot, relativePath), "utf8");
    const result = await runner.extract(content, {
      language,
      filePath: path.join(fixtureRoot, relativePath),
      relativePath,
    });

    const symbols = result.interfaces.map((iface) => [
      iface.qualifiedName || iface.name,
      iface.kind,
    ]);
    for (const expectedSymbol of expected) {
      expect(symbols).toContainEqual(expectedSymbol);
    }

    const uniqueStableIds = new Set(result.interfaces.map((iface) => iface.stableId));
    expect(uniqueStableIds.size).toBe(result.interfaces.length);
    for (const iface of result.interfaces) {
      expect(iface.signature || iface.definition).toEqual(expect.any(String));
      expect((iface.definition || "").length).toBeLessThanOrEqual(4_000);
    }
  });

  it("captures C/C++ macro parameters and replacement text", async () => {
    const content = fs.readFileSync(path.join(fixtureRoot, "cpp/network.hpp"), "utf8");
    const result = await runner.extract(content, {
      language: "cpp",
      filePath: path.join(fixtureRoot, "cpp/network.hpp"),
      relativePath: "cpp/network.hpp",
    });
    const macro = result.interfaces.find(
      (iface) => iface.name === "DECLARE_CONTROLLER",
    );

    expect(macro?.kind).toBe("macro");
    expect(macro?.macroParameters).toEqual(["name"]);
    expect(macro?.macroReplacement).toContain("class name##Controller");
    expect(macro?.documentation).toMatch(/Declares a typed/);
  });
});
