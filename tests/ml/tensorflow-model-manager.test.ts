import { describe, expect, it } from "vitest";

import { TensorFlowModelManager } from "../../modules/similarity/tensorflow-model-manager.js";

describe("TensorFlowModelManager provider contract", () => {
  it("uses a deterministic fake embedding provider for non-ML tests", async () => {
    const manager = new TensorFlowModelManager({ provider: "fake" });
    await manager.initialize();

    const [first] = await manager.generateEmbeddings(["semantic cache test"]);
    const [second] = await manager.generateEmbeddings(["semantic cache test"]);
    const [different] = await manager.generateEmbeddings(["different text"]);

    expect(first).toHaveLength(512);
    expect(second).toEqual(first);
    expect(different).not.toEqual(first);
    expect(manager.getModelInfo()).toEqual(
      expect.objectContaining({
        modelId: "fake-embedding-provider",
        isLoaded: true,
        provider: "fake",
      }),
    );
    manager.dispose();
  });

  it("batches embedding requests without changing output order", async () => {
    const manager = new TensorFlowModelManager({
      provider: "fake",
      embeddingBatchSize: 2,
    });
    await manager.initialize();

    const embeddings = await manager.generateEmbeddings(["one", "two", "three"]);

    expect(embeddings).toHaveLength(3);
    expect(embeddings[0]).toEqual((await manager.generateEmbeddings(["one"]))[0]);
    expect(embeddings[1]).toEqual((await manager.generateEmbeddings(["two"]))[0]);
    expect(embeddings[2]).toEqual(
      (await manager.generateEmbeddings(["three"]))[0],
    );
    manager.dispose();
  });
});
