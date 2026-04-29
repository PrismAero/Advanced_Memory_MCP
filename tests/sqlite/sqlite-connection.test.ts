import { afterEach, describe, expect, it } from "vitest";

import { SQLiteConnection } from "../../modules/sqlite/sqlite-connection.js";
import { cleanupTempRoot, createTempMemoryRoot } from "../utils/mcp-test-utils.js";

describe("SQLiteConnection transactions", () => {
  let root: string | undefined;
  let connection: SQLiteConnection | undefined;

  afterEach(async () => {
    await connection?.close();
    if (root) await cleanupTempRoot(root);
    root = undefined;
    connection = undefined;
  });

  it("serializes overlapping top-level transactions on a shared connection", async () => {
    await initializeEventsTable();

    let releaseFirst!: () => void;
    const firstCanCommit = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let markFirstStarted!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });

    const first = connection!.withTransaction(async () => {
      await connection!.execute("INSERT INTO tx_events (label) VALUES (?)", ["first-start"]);
      markFirstStarted();
      await firstCanCommit;
      await connection!.execute("INSERT INTO tx_events (label) VALUES (?)", ["first-end"]);
      return "first";
    });

    await firstStarted;

    const second = connection!.withTransaction(async () => {
      await connection!.execute("INSERT INTO tx_events (label) VALUES (?)", ["second"]);
      return "second";
    });

    await new Promise((resolve) => setTimeout(resolve, 25));
    releaseFirst();

    await expect(Promise.all([first, second])).resolves.toEqual(["first", "second"]);
    await expectLabels(["first-start", "first-end", "second"]);
  });

  it("uses savepoints for nested transactions so inner rollback does not abort the outer transaction", async () => {
    await initializeEventsTable();

    await connection!.withTransaction(async () => {
      await connection!.execute("INSERT INTO tx_events (label) VALUES (?)", ["outer-before"]);

      await expect(
        connection!.withTransaction(async () => {
          await connection!.execute("INSERT INTO tx_events (label) VALUES (?)", ["inner"]);
          throw new Error("inner failure");
        }),
      ).rejects.toThrow("inner failure");

      await connection!.execute("INSERT INTO tx_events (label) VALUES (?)", ["outer-after"]);
    });

    await expectLabels(["outer-before", "outer-after"]);
  });

  it("releases the transaction queue after a rollback", async () => {
    await initializeEventsTable();

    await expect(
      connection!.withTransaction(async () => {
        await connection!.execute("INSERT INTO tx_events (label) VALUES (?)", ["rolled-back"]);
        throw new Error("rollback requested");
      }),
    ).rejects.toThrow("rollback requested");

    await connection!.withTransaction(async () => {
      await connection!.execute("INSERT INTO tx_events (label) VALUES (?)", ["recovered"]);
    });

    await expectLabels(["recovered"]);
  });

  async function initializeEventsTable(): Promise<void> {
    root = createTempMemoryRoot("advanced-memory-sqlite-connection-");
    connection = new SQLiteConnection(root);
    await connection.initialize();
    await connection.execute(
      "CREATE TABLE tx_events (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT NOT NULL)",
    );
  }

  async function expectLabels(expected: string[]): Promise<void> {
    const rows = await connection!.runQuery("SELECT label FROM tx_events ORDER BY id ASC");
    expect(rows.map((row: any) => row.label)).toEqual(expected);
  }
});
