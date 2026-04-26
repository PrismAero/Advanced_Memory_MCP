import { encoding_for_model } from "tiktoken";
import { logger } from "./modules/logger.js";

/**
 * Memory-optimized Text Processing for Entity Storage
 * Reduces storage size while maintaining semantic meaning for fast retrieval
 */

export type CompressionLevel = "minimal" | "balanced" | "aggressive";

export interface OptimizedMemoryContent {
  original: string;
  optimized: string;
  tokenCount: number;
  originalTokenCount: number;
  compressionRatio: number;
  keywords: string[];
  entities: string[];
}

export interface MemoryOptimizationConfig {
  compressionLevel: CompressionLevel;
  maxTokens?: number;
  extractKeywords: boolean;
  extractEntities: boolean;
}

export class MemoryOptimizer {
  private tokenizer: any;
  private config: MemoryOptimizationConfig;

  // Technical abbreviations for memory storage
  private abbreviations: Record<string, string> = {
    authentication: "auth",
    authorization: "authz",
    configuration: "config",
    implementation: "impl",
    application: "app",
    database: "db",
    interface: "iface",
    component: "comp",
    function: "fn",
    parameter: "param",
    variable: "var",
    environment: "env",
    development: "dev",
    production: "prod",
    repository: "repo",
    documentation: "docs",
    requirements: "reqs",
    specification: "spec",
    performance: "perf",
    optimization: "opt",
    management: "mgmt",
    information: "info",
    technology: "tech",
    framework: "fw",
    library: "lib",
    service: "svc",
    server: "srv",
    client: "cli",
    request: "req",
    response: "resp",
    message: "msg",
    session: "sess",
    transaction: "txn",
    operation: "op",
    process: "proc",
    system: "sys",
    network: "net",
    security: "sec",
    encryption: "enc",
    validation: "val",
  };

  // Filler words to remove for space efficiency
  private fillerWords = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "with",
    "by",
    "very",
    "quite",
    "really",
    "just",
    "only",
    "also",
    "even",
    "still",
    "rather",
    "pretty",
    "fairly",
    "somewhat",
    "basically",
    "actually",
    "literally",
    "obviously",
    "clearly",
    "essentially",
    "generally",
    "typically",
    "usually",
    "normally",
    "please",
    "thank",
    "thanks",
    "hello",
    "hi",
    "hey",
    "well",
    "um",
    "uh",
    "oh",
  ]);

  constructor(config: Partial<MemoryOptimizationConfig> = {}) {
    // NOTE: Default is "minimal" (whitespace normalization only). The
    // older "aggressive" level performed destructive substitutions
    // ("is" -> "=", "and" -> "&", filler-word stripping) that mangled
    // human-readable observations and broke FTS-style retrieval. None
    // of the current handlers ever read the optimized form back, so
    // aggressive compression cost CPU for no benefit. "balanced" and
    // "aggressive" remain available for callers that explicitly opt in.
    this.config = {
      compressionLevel: "minimal",
      extractKeywords: true,
      extractEntities: true,
      ...config,
    };

    try {
      this.tokenizer = encoding_for_model("gpt-4");
    } catch (error) {
      logger.warn("Failed to initialize tokenizer:", error);
      this.tokenizer = null;
    }
  }

  /**
   * Optimize text for memory storage
   */
  optimize(text: string): OptimizedMemoryContent {
    const originalTokenCount = this.countTokens(text);
    const keywords = this.config.extractKeywords
      ? this.extractKeywords(text)
      : [];
    const entities = this.config.extractEntities
      ? this.extractEntities(text)
      : [];

    let optimized = text;

    // Apply compression based on level
    switch (this.config.compressionLevel) {
      case "minimal":
        optimized = this.minimalCompression(text);
        break;
      case "balanced":
        optimized = this.balancedCompression(text);
        break;
      case "aggressive":
        optimized = this.aggressiveCompression(text);
        break;
    }

    const optimizedTokenCount = this.countTokens(optimized);
    const compressionRatio =
      originalTokenCount > 0 ? optimizedTokenCount / originalTokenCount : 1;

    return {
      original: text,
      optimized,
      tokenCount: optimizedTokenCount,
      originalTokenCount,
      compressionRatio,
      keywords,
      entities,
    };
  }

  private countTokens(text: string): number {
    if (!this.tokenizer) {
      // Fallback: rough estimation
      return Math.ceil(text.length / 4);
    }

    try {
      return this.tokenizer.encode(text).length;
    } catch {
      return Math.ceil(text.length / 4);
    }
  }

  private minimalCompression(text: string): string {
    return text
      .replace(/\s+/g, " ") // Multiple spaces to single
      .replace(/\n\s*\n/g, "\n") // Multiple newlines to single
      .trim();
  }

  private balancedCompression(text: string): string {
    let result = this.minimalCompression(text);

    // Apply technical abbreviations
    for (const [full, abbrev] of Object.entries(this.abbreviations)) {
      const regex = new RegExp(`\\b${full}\\b`, "gi");
      result = result.replace(regex, abbrev);
    }

    // Remove some common filler words but preserve meaning
    const words = result.split(/\s+/);
    const filtered = words.filter((word, index) => {
      const cleanWord = word.toLowerCase().replace(/[^\w]/g, "");
      // Keep filler words that are important for meaning
      if (this.fillerWords.has(cleanWord)) {
        // Keep if it's at the beginning, end, or followed by important words
        const next = words[index + 1];
        const prev = words[index - 1];
        if (index === 0 || index === words.length - 1) return true;
        if (next && this.isImportantWord(next)) return true;
        if (prev && this.isImportantWord(prev)) return true;
        return false;
      }
      return true;
    });

    return filtered.join(" ");
  }

  private aggressiveCompression(text: string): string {
    // "Aggressive" used to apply destructive symbol substitutions
    // (is -> =, and -> &, etc.) that corrupted observations and made
    // text search useless. We now treat it as "balanced + extra filler
    // stripping" -- still lossy, but no longer turns prose into ASCII
    // soup. Callers who want the old behavior can extend this method.
    let result = this.balancedCompression(text);

    const words = result.split(/\s+/);
    const filtered = words.filter((word) => {
      const cleanWord = word.toLowerCase().replace(/[^\w]/g, "");
      return !this.fillerWords.has(cleanWord);
    });

    return filtered.join(" ");
  }

  private isImportantWord(word: string): boolean {
    const clean = word.toLowerCase().replace(/[^\w]/g, "");
    // Check if word appears to be technical, a name, or otherwise important
    return clean.length > 3 || /[A-Z]/.test(word) || /\d/.test(word);
  }

  /**
   * Extract keywords from text for indexing - Enhanced for technical content
   */
  private extractKeywords(text: string): string[] {
    const words = text.toLowerCase().match(/\b[a-zA-Z]{2,}\b/g) || [];
    const technicalTerms =
      text.match(
        /\b[A-Z][a-zA-Z]*\b|\b[a-z]+[A-Z][a-zA-Z]*\b|\b[a-zA-Z]*\d+[a-zA-Z]*\b/g
      ) || [];
    const wordCounts: Record<string, number> = {};

    // Count word frequency with higher weight for technical terms
    words.forEach((word) => {
      if (!this.fillerWords.has(word) && word.length >= 2) {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
      }
    });

    // Add technical terms with higher weight
    technicalTerms.forEach((term) => {
      const lowerTerm = term.toLowerCase();
      if (lowerTerm.length >= 2) {
        wordCounts[lowerTerm] = (wordCounts[lowerTerm] || 0) + 2; // Double weight for technical terms
      }
    });

    // Also extract file paths, URLs, and technical patterns
    const patterns = [
      /\/[a-zA-Z0-9._/-]+\.[a-zA-Z0-9]+/g, // File paths
      /https?:\/\/[a-zA-Z0-9.-]+[a-zA-Z0-9._/-]*/g, // URLs
      /@[a-zA-Z0-9/-]+/g, // NPM packages
      /[A-Z_][A-Z0-9_]+=\w+/g, // Environment variables
      /\b[a-zA-Z]+\([^)]*\)/g, // Function calls
    ];

    patterns.forEach((pattern) => {
      const matches = text.match(pattern) || [];
      matches.forEach((match) => {
        const cleanMatch = match.toLowerCase().replace(/[^\w]/g, "");
        if (cleanMatch.length >= 3) {
          wordCounts[cleanMatch] = (wordCounts[cleanMatch] || 0) + 3; // Triple weight for patterns
        }
      });
    });

    // Return top keywords by frequency, prioritizing technical content
    return Object.entries(wordCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15) // Increased from 10 to 15 for better coverage
      .map(([word]) => word);
  }

  /**
   * Extract entities (capitalized words, technical terms) for indexing
   */
  private extractEntities(text: string): string[] {
    const entities = new Set<string>();

    // Find capitalized words (potential proper nouns)
    const capitalizedWords = text.match(/\b[A-Z][a-zA-Z]{2,}\b/g) || [];
    capitalizedWords.forEach((word) => entities.add(word));

    // Find technical terms (camelCase, PascalCase, snake_case)
    const technicalTerms =
      text.match(
        /\b[a-z]+[A-Z][a-zA-Z]*\b|\b[A-Z][a-z]*[A-Z][a-zA-Z]*\b|\b[a-z]+_[a-z]+\b/g
      ) || [];
    technicalTerms.forEach((term) => entities.add(term));

    // Find terms with numbers (versions, IDs, etc.)
    const numberedTerms =
      text.match(/\b[a-zA-Z]+\d+[a-zA-Z]*\b|\b[a-zA-Z]*\d+[a-zA-Z]+\b/g) || [];
    numberedTerms.forEach((term) => entities.add(term));

    return Array.from(entities).slice(0, 15); // Limit to top 15 entities
  }

  /**
   * Optimize text specifically for LLM consumption
   * Alias for optimize() that makes the intent clearer
   */
  optimizeForLLM(text: string): {
    optimizedText: string;
    keywords: string[];
    entities: string[];
    originalLength: number;
    optimizedLength: number;
    compressionRatio: number;
  } {
    const result = this.optimize(text);
    return {
      optimizedText: result.optimized,
      keywords: result.keywords,
      entities: result.entities,
      originalLength: result.original.length,
      optimizedLength: result.optimized.length,
      compressionRatio: result.compressionRatio,
    };
  }

  /**
   * Calculate similarity score between two texts (for deduplication)
   */
  calculateSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter((x) => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }
}
