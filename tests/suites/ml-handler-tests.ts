import { MLHandlers } from "../../modules/handlers/ml-handlers.js";

export interface MLHandlerTestRunner {
  adaptiveModelTrainer: any;
  projectEmbeddingEngine: any;
  similarityEngine: any;
  projectAnalysisOps: any;
  runTest(
    name: string,
    category: string,
    testFn: () => Promise<any>,
  ): Promise<any>;
}

export async function runMLHandlerTests(
  runner: MLHandlerTestRunner,
): Promise<void> {
  console.log("\n🧰 ML HANDLER TESTS\n");

  const mlHandlers = new MLHandlers(
    runner.adaptiveModelTrainer,
    runner.projectEmbeddingEngine,
    runner.similarityEngine,
    runner.projectAnalysisOps,
  );

  const parse = (result: any): any => {
    if (!result?.content?.[0]?.text) {
      throw new Error("Handler returned malformed MCP envelope");
    }
    try {
      return JSON.parse(result.content[0].text);
    } catch (err) {
      throw new Error(
        `Handler response was not valid JSON: ${
          (err as Error).message
        } -- raw: ${String(result.content[0].text).slice(0, 120)}`,
      );
    }
  };

  await runner.runTest(
    "embeddings dispatcher rejects unknown action",
    "ML-Handlers",
    async () => {
      let threw = false;
      try {
        await mlHandlers.handleEmbeddings({ action: "not_a_real_action" });
      } catch (err) {
        threw = true;
        if (!/Unknown embeddings action/i.test(String(err))) {
          throw new Error(
            `Wrong error for unknown action: ${(err as Error).message}`,
          );
        }
      }
      if (!threw) {
        throw new Error("Dispatcher accepted an unknown action silently");
      }
      return { ok: true };
    },
  );

  await runner.runTest(
    "generate_interface_embedding rejects bad input",
    "ML-Handlers",
    async () => {
      const out = parse(
        await mlHandlers.handleEmbeddings({
          action: "generate",
          interface_names: "not-an-array",
        }),
      );
      if (!out.error || !/array/i.test(out.error)) {
        throw new Error(
          `Expected error about array, got: ${JSON.stringify(out)}`,
        );
      }
      return { error: out.error };
    },
  );

  await runner.runTest(
    "generate_interface_embedding marks missing interfaces not_found",
    "ML-Handlers",
    async () => {
      const out = parse(
        await mlHandlers.handleEmbeddings({
          action: "generate",
          interface_names: ["__definitely_does_not_exist_xyz__"],
        }),
      );
      if (out.action !== "generate") {
        throw new Error(`Wrong action echo: ${out.action}`);
      }
      if (!Array.isArray(out.results) || out.results.length !== 1) {
        throw new Error("Expected exactly one result row");
      }
      if (out.results[0].status !== "not_found") {
        throw new Error(
          `Expected status=not_found, got ${out.results[0].status}`,
        );
      }
      return { ok: true };
    },
  );

  await runner.runTest(
    "generate_interface_embedding succeeds for stored interface",
    "ML-Handlers",
    async () => {
      const existing = await runner.projectAnalysisOps.getCodeInterfaces({
        name: "MathOperation",
        limit: 1,
      });
      if (!existing[0]) {
        throw new Error(
          "MathOperation interface not found - runMLTests must run first",
        );
      }

      const out = parse(
        await mlHandlers.handleEmbeddings({
          action: "generate",
          interface_names: ["MathOperation"],
        }),
      );
      const first = out.results?.[0];
      if (!first) throw new Error("No result row returned");
      if (first.status !== "success") {
        throw new Error(`Status was ${first.status}, expected success`);
      }
      if (
        !Array.isArray(first.embedding_preview) ||
        first.embedding_preview.length !== 5
      ) {
        throw new Error(
          `embedding_preview should be length 5, got ${first.embedding_preview?.length}`,
        );
      }
      for (const value of first.embedding_preview) {
        if (typeof value !== "number" || !Number.isFinite(value)) {
          throw new Error("Non-finite value in embedding_preview");
        }
      }
      return { confidence: first.confidence };
    },
  );

  await runner.runTest(
    "find_similar_code requires code_snippet",
    "ML-Handlers",
    async () => {
      const out = parse(
        await mlHandlers.handleEmbeddings({ action: "find_similar" }),
      );
      if (!out.error || !/code_snippet/i.test(out.error)) {
        throw new Error(
          `Expected error about code_snippet, got: ${JSON.stringify(out)}`,
        );
      }
      return { ok: true };
    },
  );

  await runner.runTest(
    "find_similar_code returns ranked rows for stored embedding",
    "ML-Handlers",
    async () => {
      const out = parse(
        await mlHandlers.handleEmbeddings({
          action: "find_similar",
          code_snippet:
            "interface MathOperation { execute(a: number, b: number): number; }",
          limit: 5,
        }),
      );
      if (out.error) throw new Error(`Handler errored: ${out.error}`);
      if (out.action !== "find_similar") {
        throw new Error(`Wrong action echo: ${out.action}`);
      }
      if (!Array.isArray(out.results)) {
        throw new Error("results should be an array");
      }
      if (out.count !== out.results.length) {
        throw new Error("count mismatch with results.length");
      }
      if (out.results.length > 0) {
        const top = out.results[0];
        if (
          typeof top.similarity !== "number" ||
          !Number.isFinite(top.similarity)
        ) {
          throw new Error("Top similarity is not a finite number");
        }
        if (top.similarity < -1 || top.similarity > 1) {
          throw new Error(`Similarity out of range: ${top.similarity}`);
        }
      }
      return { count: out.count };
    },
  );

  await runner.runTest(
    "backfill_embeddings reports before/processed/remaining",
    "ML-Handlers",
    async () => {
      const out = parse(
        await mlHandlers.handleEmbeddings({
          action: "backfill",
          file_limit: 5,
          interface_limit: 5,
        }),
      );
      if (out.error) throw new Error(`Handler errored: ${out.error}`);
      if (out.action !== "backfill") {
        throw new Error(`Wrong action echo: ${out.action}`);
      }
      for (const key of ["before", "processed", "remaining"]) {
        if (typeof out[key] !== "object" || out[key] === null) {
          throw new Error(`Missing or non-object field: ${key}`);
        }
      }
      if (typeof out.processed.files !== "number") {
        throw new Error("processed.files should be a number");
      }
      if (typeof out.processed.interfaces !== "number") {
        throw new Error("processed.interfaces should be a number");
      }
      return out;
    },
  );

  await runner.runTest(
    "train_project_model returns session or graceful error",
    "ML-Handlers",
    async () => {
      const out = parse(
        await mlHandlers.handleTrainProjectModel({
          epochs: 1,
          batch_size: 2,
        }),
      );
      if (out.error) {
        if (typeof out.error !== "string") {
          throw new Error("error field should be a string");
        }
        if (!/insufficient|not enough/i.test(out.error)) {
          throw new Error(`Unexpected training error: ${out.error}`);
        }
        return { mode: "graceful_error", error: out.error };
      }
      if (!out.session_id || !out.status) {
        throw new Error(
          `Expected session_id+status, got: ${JSON.stringify(out)}`,
        );
      }
      return {
        mode: "session_started",
        session_id: out.session_id,
        status: out.status,
        data_points: out.data_points,
      };
    },
  );
}
