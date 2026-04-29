import { describe, expect, it } from "vitest";

import { BackgroundTaskScheduler } from "../../modules/background/task-queue.js";
import { SQLiteConnection } from "../../modules/sqlite/sqlite-connection.js";
import {
  cleanupTempRoot,
  createTempMemoryRoot,
} from "../utils/mcp-test-utils.js";

describe("BackgroundTaskScheduler", () => {
  it("coalesces duplicate queued work and reports stats", async () => {
    const scheduler = new BackgroundTaskScheduler({
      maintenance: { concurrency: 1, maxQueued: 10 },
    });
    const order: string[] = [];
    const blocker = deferred<void>();

    const first = scheduler.enqueue("maintenance", {
      id: "hold",
      run: async () => {
        order.push("hold");
        await blocker.promise;
      },
    });
    const second = scheduler.enqueue("maintenance", {
      id: "scan-a",
      coalesceKey: "scan",
      run: async () => {
        order.push("scan-a");
      },
    });
    const third = scheduler.enqueue("maintenance", {
      id: "scan-b",
      coalesceKey: "scan",
      run: async () => {
        order.push("scan-b");
      },
    });

    blocker.resolve();
    await Promise.all([first, second, third]);
    const stats = scheduler
      .getStats()
      .find((queue) => queue.name === "maintenance");

    expect(order).toEqual(["hold", "scan-a"]);
    expect(stats?.coalesced).toBe(1);
    expect(stats?.completed).toBe(2);
    scheduler.dispose();
  });

  it("applies backpressure instead of growing unbounded", async () => {
    const scheduler = new BackgroundTaskScheduler({
      "file-change": { concurrency: 1, maxQueued: 2 },
    });
    const blocker = deferred<void>();

    const active = scheduler.enqueue("file-change", {
      id: "active",
      run: async () => blocker.promise,
    });
    const queuedA = scheduler.enqueue("file-change", {
      id: "queued-a",
      run: async () => undefined,
    });
    const queuedB = scheduler.enqueue("file-change", {
      id: "queued-b",
      run: async () => undefined,
    });
    const queuedC = scheduler.enqueue("file-change", {
      id: "queued-c",
      run: async () => undefined,
    });

    blocker.resolve();
    await Promise.all([active, queuedA, queuedB, queuedC]);
    const stats = scheduler
      .getStats()
      .find((queue) => queue.name === "file-change");

    expect(stats?.dropped).toBe(1);
    expect(stats?.queued).toBe(0);
    scheduler.dispose();
  });

  it("cancels queued work by prefix", async () => {
    const scheduler = new BackgroundTaskScheduler({
      embedding: { concurrency: 1, maxQueued: 10 },
    });
    const blocker = deferred<void>();
    const active = scheduler.enqueue("embedding", {
      id: "hold",
      run: async () => blocker.promise,
    });
    const queued = scheduler.enqueue("embedding", {
      id: "embedding:stale",
      run: async () => "ran",
    });

    expect(scheduler.cancelQueue("embedding", "embedding:")).toBe(1);
    blocker.resolve();
    await active;
    await expect(queued).resolves.toBeUndefined();
    scheduler.dispose();
  });

  it("does not fail overlapping file-change transactions on the shared SQLite connection", async () => {
    const scheduler = new BackgroundTaskScheduler({
      "file-change": { concurrency: 2, maxQueued: 10 },
    });
    const root = createTempMemoryRoot("advanced-memory-bg-sqlite-");
    const connection = new SQLiteConnection(root);
    const firstStarted = deferred<void>();
    const firstCanCommit = deferred<void>();

    try {
      await connection.initialize();
      await connection.execute(
        "CREATE TABLE bg_tx_events (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT NOT NULL)",
      );

      const first = scheduler.enqueue("file-change", {
        id: "file-change:first",
        run: async () => {
          await connection.withTransaction(async () => {
            await connection.execute(
              "INSERT INTO bg_tx_events (label) VALUES (?)",
              ["first-start"],
            );
            firstStarted.resolve();
            await firstCanCommit.promise;
            await connection.execute(
              "INSERT INTO bg_tx_events (label) VALUES (?)",
              ["first-end"],
            );
          });
        },
      });

      await firstStarted.promise;

      const second = scheduler.enqueue("file-change", {
        id: "file-change:second",
        run: async () => {
          await connection.withTransaction(async () => {
            await connection.execute(
              "INSERT INTO bg_tx_events (label) VALUES (?)",
              ["second"],
            );
          });
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 25));
      firstCanCommit.resolve();

      await expect(Promise.all([first, second])).resolves.toEqual([
        undefined,
        undefined,
      ]);

      const rows = await connection.runQuery(
        "SELECT label FROM bg_tx_events ORDER BY id ASC",
      );
      expect(rows.map((row: any) => row.label)).toEqual([
        "first-start",
        "first-end",
        "second",
      ]);
    } finally {
      scheduler.dispose();
      await connection.close();
      await cleanupTempRoot(root);
    }
  });
});

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
