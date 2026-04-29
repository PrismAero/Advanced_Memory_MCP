import { logger } from "../logger.js";

export type BackgroundQueueName =
  | "interactive"
  | "file-change"
  | "embedding"
  | "relationship"
  | "cleanup"
  | "maintenance";

export interface BackgroundTaskStats {
  name: BackgroundQueueName;
  queued: number;
  active: number;
  completed: number;
  failed: number;
  dropped: number;
  coalesced: number;
  cancelled: number;
  maxQueued: number;
  concurrency: number;
  lastDurationMs: number | null;
}

export interface BackgroundTaskOptions<T> {
  id: string;
  coalesceKey?: string;
  run: (signal: AbortSignal) => Promise<T>;
  onDrop?: (reason: "coalesced" | "backpressure" | "cancelled") => void;
}

interface QueuedTask<T = unknown> extends BackgroundTaskOptions<T> {
  enqueuedAt: number;
  promise: Promise<T | undefined>;
  resolve: (value: T | undefined) => void;
  reject: (error: unknown) => void;
}

export class BackgroundTaskQueue {
  private pending: Array<QueuedTask<any>> = [];
  private active = new Map<string, AbortController>();
  private completed = 0;
  private failed = 0;
  private dropped = 0;
  private coalesced = 0;
  private cancelled = 0;
  private lastDurationMs: number | null = null;
  private disposed = false;

  constructor(
    private readonly name: BackgroundQueueName,
    private readonly options: { concurrency: number; maxQueued: number },
  ) {}

  enqueue<T>(task: BackgroundTaskOptions<T>): Promise<T | undefined> {
    if (this.disposed) {
      task.onDrop?.("cancelled");
      return Promise.resolve(undefined);
    }

    if (task.coalesceKey) {
      const existing = this.pending.find((queued) => queued.coalesceKey === task.coalesceKey);
      if (existing) {
        this.coalesced++;
        task.onDrop?.("coalesced");
        return existing.promise as Promise<T | undefined>;
      }
    }

    if (this.pending.length >= this.options.maxQueued) {
      const dropped = this.pending.shift();
      if (dropped) {
        this.dropped++;
        dropped.onDrop?.("backpressure");
        dropped.resolve(undefined);
      }
    }

    let resolve!: (value: T | undefined) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T | undefined>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const queued: QueuedTask<T> = {
      ...task,
      enqueuedAt: Date.now(),
      resolve,
      reject,
      promise,
    };
    this.pending.push(queued);
    this.drain();
    return promise;
  }

  cancelMatching(predicate: (taskId: string) => boolean): number {
    let cancelled = 0;
    this.pending = this.pending.filter((task) => {
      if (!predicate(task.id)) return true;
      cancelled++;
      this.cancelled++;
      task.onDrop?.("cancelled");
      task.resolve(undefined);
      return false;
    });

    for (const [taskId, controller] of this.active) {
      if (predicate(taskId)) {
        cancelled++;
        this.cancelled++;
        controller.abort();
      }
    }
    return cancelled;
  }

  getStats(): BackgroundTaskStats {
    return {
      name: this.name,
      queued: this.pending.length,
      active: this.active.size,
      completed: this.completed,
      failed: this.failed,
      dropped: this.dropped,
      coalesced: this.coalesced,
      cancelled: this.cancelled,
      maxQueued: this.options.maxQueued,
      concurrency: this.options.concurrency,
      lastDurationMs: this.lastDurationMs,
    };
  }

  dispose(): void {
    this.disposed = true;
    this.pending.splice(0).forEach((task) => {
      this.cancelled++;
      task.onDrop?.("cancelled");
      task.resolve(undefined);
    });
    for (const controller of this.active.values()) {
      this.cancelled++;
      controller.abort();
    }
  }

  private drain(): void {
    while (
      !this.disposed &&
      this.active.size < this.options.concurrency &&
      this.pending.length > 0
    ) {
      const task = this.pending.shift()!;
      const controller = new AbortController();
      const startedAt = Date.now();
      this.active.set(task.id, controller);

      task
        .run(controller.signal)
        .then((result) => {
          this.completed++;
          task.resolve(result);
        })
        .catch((error) => {
          if (controller.signal.aborted) {
            this.cancelled++;
            task.resolve(undefined);
          } else {
            this.failed++;
            logger.warn(`[BACKGROUND] ${this.name} task failed: ${task.id}`, error);
            task.reject(error);
          }
        })
        .finally(() => {
          this.lastDurationMs = Date.now() - startedAt;
          this.active.delete(task.id);
          this.drain();
        });
    }
  }
}

export class BackgroundTaskScheduler {
  private queues = new Map<BackgroundQueueName, BackgroundTaskQueue>();

  constructor(
    config: Partial<Record<BackgroundQueueName, { concurrency: number; maxQueued: number }>> = {},
  ) {
    for (const name of QUEUE_NAMES) {
      this.queues.set(
        name,
        new BackgroundTaskQueue(name, config[name] || defaultQueueConfig(name)),
      );
    }
  }

  enqueue<T>(
    queueName: BackgroundQueueName,
    task: BackgroundTaskOptions<T>,
  ): Promise<T | undefined> {
    return this.getQueue(queueName).enqueue(task);
  }

  cancelQueue(queueName: BackgroundQueueName, idPrefix?: string): number {
    return this.getQueue(queueName).cancelMatching((taskId) =>
      idPrefix ? taskId.startsWith(idPrefix) : true,
    );
  }

  getStats(): BackgroundTaskStats[] {
    return QUEUE_NAMES.map((name) => this.getQueue(name).getStats());
  }

  dispose(): void {
    for (const queue of this.queues.values()) queue.dispose();
  }

  private getQueue(name: BackgroundQueueName): BackgroundTaskQueue {
    const queue = this.queues.get(name);
    if (!queue) throw new Error(`Unknown background queue: ${name}`);
    return queue;
  }
}

const QUEUE_NAMES: BackgroundQueueName[] = [
  "interactive",
  "file-change",
  "embedding",
  "relationship",
  "cleanup",
  "maintenance",
];

function defaultQueueConfig(name: BackgroundQueueName): {
  concurrency: number;
  maxQueued: number;
} {
  switch (name) {
    case "interactive":
      return { concurrency: 2, maxQueued: 50 };
    case "file-change":
      return { concurrency: 2, maxQueued: 500 };
    case "embedding":
      return { concurrency: 1, maxQueued: 25 };
    case "relationship":
      return { concurrency: 1, maxQueued: 10 };
    case "cleanup":
      return { concurrency: 1, maxQueued: 25 };
    case "maintenance":
      return { concurrency: 1, maxQueued: 10 };
  }
}
