import { createTestEntity } from "./entity-tests.js";

export interface PerformanceTestRunner {
  memoryManager: any;
  similarityEngine: any;
  runTest(name: string, category: string, testFn: () => Promise<any>): Promise<any>;
}

export async function runPerformanceTests(
  runner: PerformanceTestRunner,
  iterations: number,
): Promise<void> {
  console.log("\n⚡ PERFORMANCE TESTS\n");

  await runner.runTest(`Bulk entity creation (${iterations} entities)`, "Performance", async () => {
    const entities = Array.from({ length: iterations }, (_, i) => ({
      name: `PerfTest_Entity_${i}`,
      entityType: "test",
      observations: [`Observation for entity ${i}`],
    }));

    const start = Date.now();
    await runner.memoryManager.createEntities(entities);
    const duration = Date.now() - start;

    return {
      count: iterations,
      totalMs: duration,
      avgMs: (duration / iterations).toFixed(2),
      entitiesPerSecond: ((iterations / duration) * 1000).toFixed(1),
    };
  });

  await runner.runTest(`Sequential entity reads (${iterations} reads)`, "Performance", async () => {
    const start = Date.now();
    for (let i = 0; i < iterations; i++) {
      await runner.memoryManager.openNodes([`PerfTest_Entity_${i}`]);
    }
    const duration = Date.now() - start;

    return {
      count: iterations,
      totalMs: duration,
      avgMs: (duration / iterations).toFixed(2),
      readsPerSecond: ((iterations / duration) * 1000).toFixed(1),
    };
  });

  await runner.runTest(
    `Embedding generation (${Math.min(20, iterations)} entities)`,
    "Performance",
    async () => {
      const count = Math.min(20, iterations);
      const entities = Array.from({ length: count }, (_, i) =>
        createTestEntity(`EmbedTest_${i}`, "test", [
          `Test observation for embedding generation ${i}`,
        ]),
      );

      const start = Date.now();
      for (let i = 0; i < count - 1; i++) {
        await runner.similarityEngine.calculateSimilarity(entities[i], entities[i + 1]);
      }
      const duration = Date.now() - start;

      return {
        count: count - 1,
        totalMs: duration,
        avgMs: (duration / (count - 1)).toFixed(2),
        comparisonsPerSecond: (((count - 1) / duration) * 1000).toFixed(1),
      };
    },
  );

  await runner.runTest("Search performance (100 queries)", "Performance", async () => {
    const queries = ["entity test", "observation", "performance", "user", "service"];
    const queryCount = 100;
    const start = Date.now();
    for (let i = 0; i < queryCount; i++) {
      await runner.memoryManager.searchEntities(queries[i % queries.length]);
    }
    const duration = Date.now() - start;

    return {
      count: queryCount,
      totalMs: duration,
      avgMs: (duration / queryCount).toFixed(2),
      queriesPerSecond: ((queryCount / duration) * 1000).toFixed(1),
    };
  });

  await runner.runTest(`Bulk entity deletion (${iterations} entities)`, "Performance", async () => {
    const names = Array.from({ length: iterations }, (_, i) => `PerfTest_Entity_${i}`);
    const start = Date.now();
    await runner.memoryManager.deleteEntities(names);
    const duration = Date.now() - start;

    return {
      count: iterations,
      totalMs: duration,
      avgMs: (duration / iterations).toFixed(2),
      deletionsPerSecond: ((iterations / duration) * 1000).toFixed(1),
    };
  });
}

export async function runConcurrencyTests(
  runner: PerformanceTestRunner,
  concurrency: number,
): Promise<void> {
  console.log("\n🔄 CONCURRENCY TESTS\n");

  await runner.runTest(
    `Concurrent entity creation (${concurrency} parallel)`,
    "Concurrency",
    async () => {
      const promises = Array.from({ length: concurrency }, (_, i) =>
        runner.memoryManager.createEntities([
          {
            name: `ConcurrentEntity_${i}`,
            entityType: "test",
            observations: [`Concurrent observation ${i}`],
          },
        ]),
      );
      const start = Date.now();
      await Promise.all(promises);
      return { concurrency, totalMs: Date.now() - start };
    },
  );

  await runner.runTest(`Concurrent reads (${concurrency} parallel)`, "Concurrency", async () => {
    const promises = Array.from({ length: concurrency }, (_, i) =>
      runner.memoryManager.openNodes([`ConcurrentEntity_${i}`]),
    );
    const start = Date.now();
    const results = await Promise.all(promises);
    const duration = Date.now() - start;
    const allFound = results.every((result) => result.entities.length === 1);
    if (!allFound) throw new Error("Not all entities found");
    return { concurrency, totalMs: duration, allFound };
  });

  await runner.runTest(`Concurrent searches (${concurrency} parallel)`, "Concurrency", async () => {
    const queries = ["concurrent", "entity", "test", "observation", "parallel"];
    const promises = Array.from({ length: concurrency }, (_, i) =>
      runner.memoryManager.searchEntities(queries[i % queries.length]),
    );
    const start = Date.now();
    await Promise.all(promises);
    return { concurrency, totalMs: Date.now() - start };
  });

  await runner.runTest("Mixed concurrent operations", "Concurrency", async () => {
    const operations = [
      ...Array.from({ length: 3 }, (_, i) =>
        runner.memoryManager.createEntities([
          {
            name: `MixedOp_Create_${i}`,
            entityType: "test",
            observations: ["test"],
          },
        ]),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        runner.memoryManager.openNodes([`ConcurrentEntity_${i}`]),
      ),
      ...Array.from({ length: 3 }, () => runner.memoryManager.searchEntities("test")),
    ];

    const start = Date.now();
    await Promise.all(operations);
    const duration = Date.now() - start;

    await runner.memoryManager.deleteEntities([
      "MixedOp_Create_0",
      "MixedOp_Create_1",
      "MixedOp_Create_2",
    ]);

    return { operationCount: operations.length, totalMs: duration };
  });

  const concurrentNames = Array.from({ length: concurrency }, (_, i) => `ConcurrentEntity_${i}`);
  await runner.memoryManager.deleteEntities(concurrentNames);
}
