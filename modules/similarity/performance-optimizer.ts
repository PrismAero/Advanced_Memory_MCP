import { Entity } from "../../memory-types.js";
import { logger } from "../logger.js";
import { ModernSimilarityEngine } from "./similarity-engine.js";
import { TensorFlowModelManager } from "./tensorflow-model-manager.js";

/**
 * Performance Optimizer for TensorFlow.js Memory System
 * Monitors, analyzes, and optimizes performance of embedding operations
 */
export class PerformanceOptimizer {
  private similarityEngine: ModernSimilarityEngine;
  private modelManager: TensorFlowModelManager;

  // Performance metrics storage
  private performanceMetrics: {
    embeddingGenerationTimes: number[];
    similarityCalculationTimes: number[];
    batchProcessingTimes: Map<number, number[]>; // batch size -> times
    memoryUsageSnapshots: Array<{ timestamp: Date; usage: number }>;
    cacheHitRates: number[];
    modelSwitchingHistory: Array<{
      timestamp: Date;
      modelId: string;
      reason: string;
    }>;
  } = {
    embeddingGenerationTimes: [],
    similarityCalculationTimes: [],
    batchProcessingTimes: new Map(),
    memoryUsageSnapshots: [],
    cacheHitRates: [],
    modelSwitchingHistory: [],
  };

  // Configuration for performance optimization
  private config = {
    maxEmbeddingGenerationTime: 200, // ms
    maxSimilarityCalculationTime: 50, // ms
    maxMemoryUsage: 300, // MB
    targetCacheHitRate: 0.7,
    performanceMonitoringInterval: 30000, // 30 seconds
    batchSizeOptimization: {
      minBatchSize: 5,
      maxBatchSize: 50,
      targetLatency: 500, // ms
    },
    similarityThresholds: {
      conservative: 0.75,
      balanced: 0.6,
      aggressive: 0.5,
    },
  };

  private performanceMonitoringActive = false;
  private monitoringInterval?: NodeJS.Timeout;
  private optimizationRecommendations: string[] = [];

  constructor(similarityEngine: ModernSimilarityEngine, modelManager: TensorFlowModelManager) {
    this.similarityEngine = similarityEngine;
    this.modelManager = modelManager;
  }

  /**
   * Start performance monitoring
   */
  startPerformanceMonitoring(): void {
    if (this.performanceMonitoringActive) {
      logger.info("Performance monitoring already active");
      return;
    }

    this.performanceMonitoringActive = true;

    this.monitoringInterval = setInterval(() => {
      this.collectPerformanceMetrics();
      this.analyzePerformance();
      this.generateOptimizationRecommendations();
    }, this.config.performanceMonitoringInterval);

    logger.info("TensorFlow.js performance monitoring started");
  }

  /**
   * Stop performance monitoring
   */
  stopPerformanceMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    this.performanceMonitoringActive = false;
    logger.info("TensorFlow.js performance monitoring stopped");
  }

  /**
   * Benchmark embedding generation performance
   */
  async benchmarkEmbeddingGeneration(
    testTexts: string[],
    iterations: number = 5,
  ): Promise<{
    averageTime: number;
    minTime: number;
    maxTime: number;
    throughput: number; // embeddings per second
    recommendations: string[];
  }> {
    const times: number[] = [];

    logger.info(
      `Benchmarking embedding generation with ${testTexts.length} texts, ${iterations} iterations...`,
    );

    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();

      try {
        await this.modelManager.generateEmbeddings(testTexts);
        const endTime = performance.now();
        const duration = endTime - startTime;
        times.push(duration);

        // Small delay between iterations
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        logger.error(`Benchmark iteration ${i + 1} failed:`, error);
      }
    }

    if (times.length === 0) {
      throw new Error("All benchmark iterations failed");
    }

    const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const throughput = (testTexts.length * 1000) / averageTime; // embeddings per second

    const recommendations = this.generateBenchmarkRecommendations({
      averageTime,
      minTime,
      maxTime,
      throughput,
      testSize: testTexts.length,
    });

    // Store results for analysis
    this.performanceMetrics.embeddingGenerationTimes.push(...times);

    return { averageTime, minTime, maxTime, throughput, recommendations };
  }

  /**
   * Benchmark batch processing performance
   */
  async benchmarkBatchProcessing(entities: Entity[]): Promise<{
    optimalBatchSize: number;
    batchResults: Map<number, { averageTime: number; throughput: number }>;
    recommendations: string[];
  }> {
    const batchSizes = [5, 10, 15, 20, 25, 30, 40, 50];
    const batchResults = new Map<number, { averageTime: number; throughput: number }>();

    logger.info(`Benchmarking batch processing with ${entities.length} entities...`);

    for (const batchSize of batchSizes) {
      if (batchSize > entities.length) continue;

      const times: number[] = [];
      const iterations = Math.min(3, Math.floor(entities.length / batchSize));

      for (let i = 0; i < iterations; i++) {
        const batch = entities.slice(i * batchSize, (i + 1) * batchSize);

        const startTime = performance.now();
        try {
          await this.similarityEngine.calculateBatchSimilarity(batch);
          const endTime = performance.now();
          times.push(endTime - startTime);
        } catch (error) {
          logger.error(`Batch benchmark failed for size ${batchSize}:`, error);
        }

        // Small delay between batches
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      if (times.length > 0) {
        const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length;
        const throughput = (batchSize * 1000) / averageTime;

        batchResults.set(batchSize, { averageTime, throughput });

        // Store metrics
        if (!this.performanceMetrics.batchProcessingTimes.has(batchSize)) {
          this.performanceMetrics.batchProcessingTimes.set(batchSize, []);
        }
        this.performanceMetrics.batchProcessingTimes.get(batchSize)!.push(...times);
      }
    }

    // Find optimal batch size (best throughput under latency target)
    let optimalBatchSize = 10;
    let bestThroughput = 0;

    for (const [size, result] of batchResults.entries()) {
      if (
        result.averageTime <= this.config.batchSizeOptimization.targetLatency &&
        result.throughput > bestThroughput
      ) {
        optimalBatchSize = size;
        bestThroughput = result.throughput;
      }
    }

    const recommendations = this.generateBatchRecommendations(batchResults, optimalBatchSize);

    return { optimalBatchSize, batchResults, recommendations };
  }

  /**
   * Optimize similarity thresholds based on performance data
   */
  async optimizeSimilarityThresholds(
    testData: Array<{
      entity1: Entity;
      entity2: Entity;
      expectedSimilarity: "high" | "medium" | "low";
    }>,
  ): Promise<{
    optimizedThresholds: { high: number; medium: number; low: number };
    accuracy: number;
    performance: { averageTime: number; totalTests: number };
    recommendations: string[];
  }> {
    logger.info(`Optimizing similarity thresholds with ${testData.length} test pairs...`);

    const startTime = performance.now();
    const results: Array<{
      similarity: number;
      expected: "high" | "medium" | "low";
      calculationTime: number;
    }> = [];

    for (const test of testData) {
      const calcStart = performance.now();
      try {
        const similarity = await this.similarityEngine.calculateSimilarity(
          test.entity1,
          test.entity2,
        );
        const calcTime = performance.now() - calcStart;

        results.push({
          similarity,
          expected: test.expectedSimilarity,
          calculationTime: calcTime,
        });

        this.performanceMetrics.similarityCalculationTimes.push(calcTime);
      } catch (error) {
        logger.error("Similarity calculation failed during optimization:", error);
      }
    }

    const totalTime = performance.now() - startTime;
    const averageTime = totalTime / results.length;

    // Analyze results to find optimal thresholds
    const highSimilarities = results.filter((r) => r.expected === "high").map((r) => r.similarity);
    const mediumSimilarities = results
      .filter((r) => r.expected === "medium")
      .map((r) => r.similarity);
    const lowSimilarities = results.filter((r) => r.expected === "low").map((r) => r.similarity);

    // Calculate thresholds based on distribution analysis
    const optimizedThresholds = {
      high: this.calculateOptimalThreshold(highSimilarities, 0.8),
      medium: this.calculateOptimalThreshold(mediumSimilarities, 0.6),
      low: this.calculateOptimalThreshold(lowSimilarities, 0.4),
    };

    // Calculate accuracy with optimized thresholds
    let correct = 0;
    for (const result of results) {
      const predicted = this.classifySimilarity(result.similarity, optimizedThresholds);
      if (predicted === result.expected) correct++;
    }
    const accuracy = correct / results.length;

    const recommendations = this.generateThresholdRecommendations(
      optimizedThresholds,
      accuracy,
      averageTime,
    );

    return {
      optimizedThresholds,
      accuracy,
      performance: { averageTime, totalTests: results.length },
      recommendations,
    };
  }

  /**
   * Get comprehensive performance report
   */
  getPerformanceReport(): {
    currentMetrics: {
      averageEmbeddingTime: number;
      averageSimilarityTime: number;
      memoryUsage: number;
      cacheHitRate: number;
    };
    trends: {
      embeddingTimesTrend: "improving" | "stable" | "degrading";
      memoryUsageTrend: "improving" | "stable" | "degrading";
    };
    recommendations: string[];
    modelInfo: any;
  } {
    const metrics = this.performanceMetrics;

    // Calculate current metrics
    const avgEmbeddingTime =
      metrics.embeddingGenerationTimes.length > 0
        ? metrics.embeddingGenerationTimes.slice(-10).reduce((a, b) => a + b, 0) /
          Math.min(metrics.embeddingGenerationTimes.length, 10)
        : 0;

    const avgSimilarityTime =
      metrics.similarityCalculationTimes.length > 0
        ? metrics.similarityCalculationTimes.slice(-10).reduce((a, b) => a + b, 0) /
          Math.min(metrics.similarityCalculationTimes.length, 10)
        : 0;

    const currentMemoryUsage = this.modelManager.getModelInfo().memoryUsage;

    const currentCacheHitRate =
      metrics.cacheHitRates.length > 0
        ? metrics.cacheHitRates[metrics.cacheHitRates.length - 1]
        : 0;

    // Analyze trends
    const embeddingTimesTrend = this.analyzeTrend(metrics.embeddingGenerationTimes.slice(-20));
    const memoryUsageTrend = this.analyzeTrend(
      metrics.memoryUsageSnapshots.slice(-10).map((s) => s.usage),
    );

    return {
      currentMetrics: {
        averageEmbeddingTime: avgEmbeddingTime,
        averageSimilarityTime: avgSimilarityTime,
        memoryUsage: currentMemoryUsage,
        cacheHitRate: currentCacheHitRate,
      },
      trends: {
        embeddingTimesTrend,
        memoryUsageTrend,
      },
      recommendations: [...this.optimizationRecommendations],
      modelInfo: this.modelManager.getModelInfo(),
    };
  }

  // Private helper methods

  private collectPerformanceMetrics(): void {
    // Collect memory usage
    const modelInfo = this.modelManager.getModelInfo();
    this.performanceMetrics.memoryUsageSnapshots.push({
      timestamp: new Date(),
      usage: modelInfo.memoryUsage,
    });

    // Keep only recent snapshots
    if (this.performanceMetrics.memoryUsageSnapshots.length > 100) {
      this.performanceMetrics.memoryUsageSnapshots =
        this.performanceMetrics.memoryUsageSnapshots.slice(-50);
    }
  }

  private analyzePerformance(): void {
    const metrics = this.performanceMetrics;

    // Check if embedding generation is too slow
    if (metrics.embeddingGenerationTimes.length > 5) {
      const recentAvg = metrics.embeddingGenerationTimes.slice(-5).reduce((a, b) => a + b, 0) / 5;

      if (recentAvg > this.config.maxEmbeddingGenerationTime) {
        this.optimizationRecommendations.push(
          `Embedding generation is slow (${recentAvg.toFixed(
            1,
          )}ms avg). Consider using a smaller model or reducing batch size.`,
        );
      }
    }

    // Check memory usage
    if (metrics.memoryUsageSnapshots.length > 0) {
      const currentUsage =
        metrics.memoryUsageSnapshots[metrics.memoryUsageSnapshots.length - 1].usage;
      if (currentUsage > this.config.maxMemoryUsage) {
        this.optimizationRecommendations.push(
          `High memory usage detected (${currentUsage.toFixed(
            1,
          )}MB). Consider clearing embedding cache or using a lighter model.`,
        );
      }
    }
  }

  private generateOptimizationRecommendations(): void {
    // Clear old recommendations
    this.optimizationRecommendations = [];

    const report = this.getPerformanceReport();

    // Performance-based recommendations
    if (report.currentMetrics.averageEmbeddingTime > this.config.maxEmbeddingGenerationTime) {
      this.optimizationRecommendations.push(
        "Consider switching to Universal Sentence Encoder Lite for faster embedding generation",
      );
    }

    if (report.currentMetrics.memoryUsage > this.config.maxMemoryUsage) {
      this.optimizationRecommendations.push(
        "Memory usage is high. Consider reducing embedding cache size or batch processing size",
      );
    }

    if (report.currentMetrics.cacheHitRate < this.config.targetCacheHitRate) {
      this.optimizationRecommendations.push(
        "Low cache hit rate detected. Consider increasing embedding cache size for better performance",
      );
    }

    // Trend-based recommendations
    if (report.trends.embeddingTimesTrend === "degrading") {
      this.optimizationRecommendations.push(
        "Embedding performance is degrading. Consider restarting the model or checking for memory leaks",
      );
    }

    if (report.trends.memoryUsageTrend === "degrading") {
      this.optimizationRecommendations.push(
        "Memory usage is increasing over time. Consider periodic cache cleanup or model reloading",
      );
    }
  }

  private generateBenchmarkRecommendations(results: {
    averageTime: number;
    minTime: number;
    maxTime: number;
    throughput: number;
    testSize: number;
  }): string[] {
    const recommendations: string[] = [];

    if (results.averageTime > this.config.maxEmbeddingGenerationTime) {
      recommendations.push(
        "Embedding generation is slower than target. Consider using Universal Sentence Encoder Lite instead of the full model.",
      );
    }

    if (results.throughput < 10) {
      recommendations.push(
        "Low throughput detected. Consider batch processing or model optimization.",
      );
    }

    if (results.testSize < 10) {
      recommendations.push(
        "Small test size may not be representative. Consider testing with larger datasets.",
      );
    }

    return recommendations;
  }

  private generateBatchRecommendations(
    results: Map<number, { averageTime: number; throughput: number }>,
    optimalBatchSize: number,
  ): string[] {
    const recommendations: string[] = [];

    recommendations.push(
      `Optimal batch size identified as ${optimalBatchSize} entities for best throughput under latency constraints.`,
    );

    const maxThroughputEntry = Array.from(results.entries()).reduce((max, current) =>
      current[1].throughput > max[1].throughput ? current : max,
    );

    if (maxThroughputEntry[0] !== optimalBatchSize) {
      recommendations.push(
        `Maximum throughput achieved at batch size ${maxThroughputEntry[0]}, but latency constraints favor ${optimalBatchSize}.`,
      );
    }

    return recommendations;
  }

  private generateThresholdRecommendations(
    thresholds: { high: number; medium: number; low: number },
    accuracy: number,
    averageTime: number,
  ): string[] {
    const recommendations: string[] = [];

    if (accuracy < 0.8) {
      recommendations.push(
        `Classification accuracy is ${(accuracy * 100).toFixed(
          1,
        )}%. Consider gathering more training data or adjusting thresholds.`,
      );
    }

    if (averageTime > this.config.maxSimilarityCalculationTime) {
      recommendations.push(
        `Similarity calculation is slow (${averageTime.toFixed(
          1,
        )}ms avg). Consider optimizing the model or using caching.`,
      );
    }

    recommendations.push(
      `Recommended thresholds: High ≥ ${thresholds.high.toFixed(
        2,
      )}, Medium ≥ ${thresholds.medium.toFixed(2)}, Low ≥ ${thresholds.low.toFixed(2)}`,
    );

    return recommendations;
  }

  private calculateOptimalThreshold(similarities: number[], defaultThreshold: number): number {
    if (similarities.length === 0) return defaultThreshold;

    // Use 75th percentile as threshold
    similarities.sort((a, b) => a - b);
    const index = Math.floor(similarities.length * 0.75);
    return Math.max(similarities[index] || defaultThreshold, 0.1);
  }

  private classifySimilarity(
    similarity: number,
    thresholds: { high: number; medium: number; low: number },
  ): "high" | "medium" | "low" {
    if (similarity >= thresholds.high) return "high";
    if (similarity >= thresholds.medium) return "medium";
    return "low";
  }

  private analyzeTrend(values: number[]): "improving" | "stable" | "degrading" {
    if (values.length < 3) return "stable";

    const recent = values.slice(-5);
    const earlier = values.slice(-10, -5);

    if (recent.length === 0 || earlier.length === 0) return "stable";

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;

    const change = (recentAvg - earlierAvg) / earlierAvg;

    if (change < -0.05) return "improving"; // 5% improvement
    if (change > 0.05) return "degrading"; // 5% degradation
    return "stable";
  }

  /**
   * Export performance data for analysis
   */
  exportPerformanceData(): {
    metadata: {
      exportTime: string;
      totalEmbeddingMeasurements: number;
      totalSimilarityMeasurements: number;
      monitoringDuration: number; // minutes
    };
    embeddingTimes: number[];
    similarityTimes: number[];
    batchResults: { [batchSize: string]: number[] };
    memorySnapshots: Array<{ timestamp: string; usage: number }>;
    recommendations: string[];
  } {
    const now = new Date();
    const firstSnapshot = this.performanceMetrics.memoryUsageSnapshots[0];
    const monitoringDuration = firstSnapshot
      ? (now.getTime() - firstSnapshot.timestamp.getTime()) / (1000 * 60)
      : 0;

    return {
      metadata: {
        exportTime: now.toISOString(),
        totalEmbeddingMeasurements: this.performanceMetrics.embeddingGenerationTimes.length,
        totalSimilarityMeasurements: this.performanceMetrics.similarityCalculationTimes.length,
        monitoringDuration,
      },
      embeddingTimes: [...this.performanceMetrics.embeddingGenerationTimes],
      similarityTimes: [...this.performanceMetrics.similarityCalculationTimes],
      batchResults: Object.fromEntries(
        Array.from(this.performanceMetrics.batchProcessingTimes.entries()).map(([size, times]) => [
          size.toString(),
          [...times],
        ]),
      ),
      memorySnapshots: this.performanceMetrics.memoryUsageSnapshots.map((s) => ({
        timestamp: s.timestamp.toISOString(),
        usage: s.usage,
      })),
      recommendations: [...this.optimizationRecommendations],
    };
  }
}
