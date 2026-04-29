import "../node-compat.js";
import * as tf from "@tensorflow/tfjs-node";
import { logger } from "../logger.js";

export { tf };

export interface TensorFlowRuntimeHealth {
  initialized: boolean;
  backend: string | null;
  loadTimeMs: number | null;
  memory: {
    numTensors: number;
    numDataBuffers: number;
    numBytes: number;
    unreliable: boolean;
  };
}

class TensorFlowRuntime {
  private initialized = false;
  private initializationPromise: Promise<void> | null = null;
  private loadTimeMs: number | null = null;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = this.performInitialization();
    return this.initializationPromise;
  }

  getHealth(): TensorFlowRuntimeHealth {
    const memory = tf.memory();
    return {
      initialized: this.initialized,
      backend: this.initialized ? tf.getBackend() : null,
      loadTimeMs: this.loadTimeMs,
      memory: {
        numTensors: memory.numTensors,
        numDataBuffers: memory.numDataBuffers,
        numBytes: memory.numBytes,
        unreliable: Boolean(memory.unreliable),
      },
    };
  }

  snapshot(label: string): TensorFlowMemorySnapshot {
    const memory = tf.memory();
    return {
      label,
      numTensors: memory.numTensors,
      numBytes: memory.numBytes,
      timestamp: Date.now(),
    };
  }

  warnOnTensorGrowth(
    before: TensorFlowMemorySnapshot,
    after: TensorFlowMemorySnapshot,
    allowedGrowth = 0,
  ): void {
    const tensorDelta = after.numTensors - before.numTensors;
    if (tensorDelta > allowedGrowth) {
      logger.warn(
        `[TENSORFLOW] Tensor count grew by ${tensorDelta} during ${before.label} -> ${after.label}`,
      );
    }
  }

  private async performInitialization(): Promise<void> {
    const started = Date.now();
    try {
      await tf.ready();
      const backend = tf.getBackend();
      if (!backend) {
        throw new Error("TensorFlow.js backend is unavailable after tf.ready()");
      }
      this.initialized = true;
      this.loadTimeMs = Date.now() - started;
      logger.debug(`[TENSORFLOW] Runtime ready: backend=${backend}, load=${this.loadTimeMs}ms`);
    } catch (error) {
      this.initializationPromise = null;
      throw new Error(
        `TensorFlow.js runtime failed to initialize: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

export interface TensorFlowMemorySnapshot {
  label: string;
  numTensors: number;
  numBytes: number;
  timestamp: number;
}

export const tensorflowRuntime = new TensorFlowRuntime();
