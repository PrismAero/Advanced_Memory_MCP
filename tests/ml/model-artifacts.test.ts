import { promises as fs } from "fs";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  prepareUseModelArtifacts,
  toTfjsNodeFileUrl,
  validateUseModelArtifacts,
} from "../../modules/ml/model-artifacts.js";
import {
  cleanupTempRoot,
  createTempMemoryRoot,
} from "../utils/mcp-test-utils.js";

describe("TensorFlow model artifact preparation", () => {
  const originalFetch = globalThis.fetch;
  const roots: string[] = [];

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    while (roots.length > 0) {
      await cleanupTempRoot(roots.pop()!);
    }
    vi.restoreAllMocks();
  });

  it("fails clearly when local artifacts are missing and download is disabled", async () => {
    const root = createTempMemoryRoot("advanced-memory-model-missing-");
    roots.push(root);

    await expect(
      prepareUseModelArtifacts({
        cacheDir: root,
        allowDownload: false,
        downloadTimeoutMs: 1000,
        modelUrl: "https://example.invalid/model.json",
        vocabUrl: "https://example.invalid/vocab.json",
      }),
    ).rejects.toThrow(/missing or invalid/i);
  });

  it("downloads, rewrites, and validates cached model artifacts", async () => {
    const root = createTempMemoryRoot("advanced-memory-model-download-");
    roots.push(root);
    const modelJson = {
      format: "graph-model",
      generatedBy: "test",
      convertedBy: "test",
      modelTopology: {},
      weightsManifest: [
        { paths: ["group1-shard1of1.bin?tfjs-format=file"], weights: [] },
      ],
    };
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("model.json")) {
        return jsonResponse(modelJson);
      }
      if (url.includes("vocab.json")) {
        return jsonResponse([
          ["<unk>", 0],
          ["test", 1],
        ]);
      }
      return binaryResponse(new Uint8Array([1, 2, 3, 4]));
    });
    globalThis.fetch = fetchMock as any;

    const artifacts = await prepareUseModelArtifacts({
      cacheDir: root,
      allowDownload: true,
      downloadTimeoutMs: 1000,
      modelUrl: "https://example.test/use/model.json?tfjs-format=file",
      vocabUrl: "https://example.test/use/vocab.json",
    });

    expect(artifacts.downloaded).toBe(true);
    expect(await validateUseModelArtifacts(artifacts.modelDir)).toBe(true);
    const savedModel = JSON.parse(
      await fs.readFile(path.join(artifacts.modelDir, "model.json"), "utf-8"),
    );
    expect(savedModel.weightsManifest[0].paths).toEqual([
      "group1-shard1of1.bin",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("uses tfjs-node compatible file URLs for Windows drive paths", () => {
    expect(toTfjsNodeFileUrl("C:\\Users\\Kai\\.memory\\models\\model.json")).toBe(
      "file://C:/Users/Kai/.memory/models/model.json",
    );
  });
});

function jsonResponse(value: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => value,
    arrayBuffer: async () =>
      Buffer.from(JSON.stringify(value), "utf-8").buffer as ArrayBuffer,
  } as Response;
}

function binaryResponse(value: Uint8Array): Response {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () =>
      value.buffer.slice(
        value.byteOffset,
        value.byteOffset + value.byteLength,
      ) as ArrayBuffer,
  } as Response;
}
