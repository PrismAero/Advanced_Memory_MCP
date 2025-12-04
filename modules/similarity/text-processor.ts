import pkg from "natural";
const { PorterStemmer } = pkg;

/**
 * Text processing utilities for modern similarity detection
 * Uses sentence-similarity and natural for offline-only processing
 */
export class TextProcessor {
  constructor() {
    // No tokenizer initialization needed
  }

  /**
   * Calculate sentence-level similarity using sentence-similarity package
   */
  calculateSentenceSimilarity(text1: string, text2: string): number {
    if (!text1 || !text2) return 0;

    // Use basic string similarity calculation
    const basicScore = this.calculateBasicSimilarity(
      text1.toLowerCase(),
      text2.toLowerCase()
    );

    // Enhanced scoring with word tokenization
    const words1 = this.extractMeaningfulWords(text1);
    const words2 = this.extractMeaningfulWords(text2);

    if (words1.length === 0 || words2.length === 0) return basicScore;

    const wordSetSimilarity = this.calculateSetSimilarity(
      new Set(words1),
      new Set(words2)
    );

    // Combine sentence and word-level similarities
    return Math.max(basicScore, wordSetSimilarity * 0.8);
  }

  /**
   * Extract meaningful words using natural tokenization and stemming
   */
  extractMeaningfulWords(text: string): string[] {
    // Simple word tokenization using regex
    const words = text.toLowerCase().match(/[a-zA-Z]+/g) || [];

    return words
      .filter((word) => word.length > 2)
      .filter((word) => !this.isStopWord(word))
      .map((word) => PorterStemmer.stem(word));
  }

  /**
   * Advanced keyword extraction with stemming and scoring
   */
  extractKeywords(
    text: string,
    maxKeywords: number = 10
  ): Array<{ word: string; score: number }> {
    const words = this.extractMeaningfulWords(text);
    const wordCounts = new Map<string, number>();

    // Count word frequencies
    words.forEach((word) => {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    });

    // Convert to scored keywords
    const keywords = Array.from(wordCounts.entries())
      .map(([word, count]) => ({
        word,
        score: count / words.length, // Relative frequency
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, maxKeywords);

    return keywords;
  }

  /**
   * Calculate semantic similarity using multiple natural language approaches
   */
  calculateSemanticSimilarity(text1: string, text2: string): number {
    // 1. Direct sentence similarity
    const sentenceScore = this.calculateSentenceSimilarity(text1, text2);

    // 2. Keyword overlap similarity
    const keywords1 = this.extractKeywords(text1, 20);
    const keywords2 = this.extractKeywords(text2, 20);

    const keywordSet1 = new Set(keywords1.map((k) => k.word));
    const keywordSet2 = new Set(keywords2.map((k) => k.word));
    const keywordScore = this.calculateSetSimilarity(keywordSet1, keywordSet2);

    // 3. Weighted scoring approach
    const semanticScore = sentenceScore * 0.6 + keywordScore * 0.4;

    return Math.min(semanticScore, 1.0);
  }

  /**
   * Detect name patterns common in software components
   */
  detectNamePatterns(
    name1: string,
    name2: string
  ): {
    score: number;
    patterns: string[];
  } {
    const patterns: string[] = [];
    let score = 0;

    const clean1 = name1.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
    const clean2 = name2.toLowerCase().replace(/[^a-z0-9\s]/g, " ");

    const words1 = clean1.split(/\s+/).filter((w) => w.length > 2);
    const words2 = clean2.split(/\s+/).filter((w) => w.length > 2);

    // Check word overlap (more heavily weighted)
    const sharedWords = words1.filter((w) => words2.includes(w));
    if (sharedWords.length > 0) {
      patterns.push(`shared_words_${sharedWords.length}`);
      score += sharedWords.length * 0.25; // Increased weight
    }

    // Check for shared prefixes/suffixes (less weighted)
    for (const word1 of words1) {
      for (const word2 of words2) {
        if (word1 !== word2) {
          // Avoid penalizing for full word matches
          if (word1.startsWith(word2) || word2.startsWith(word1)) {
            patterns.push("prefix_match");
            score += 0.1; // Increased weight
          }
          if (word1.endsWith(word2) || word2.endsWith(word1)) {
            patterns.push("suffix_match");
            score += 0.1; // Increased weight
          }
        }
      }
    }

    return {
      score: Math.min(score, 1.0),
      patterns,
    };
  }

  /**
   * Calculate Jaccard similarity between two sets
   */
  private calculateSetSimilarity(set1: Set<string>, set2: Set<string>): number {
    if (set1.size === 0 && set2.size === 0) return 1.0;
    if (set1.size === 0 || set2.size === 0) return 0.0;

    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  /**
   * Enhanced stop word detection
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      "a",
      "an",
      "and",
      "are",
      "as",
      "at",
      "be",
      "by",
      "for",
      "from",
      "has",
      "he",
      "in",
      "is",
      "it",
      "its",
      "of",
      "on",
      "that",
      "the",
      "to",
      "was",
      "will",
      "with",
      "have",
      "this",
      "but",
      "they",
      "been",
      "into",
      "during",
      "including",
      "or",
    ]);
    return stopWords.has(word.toLowerCase());
  }

  /**
   * Normalize text for better comparison
   */
  normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Calculate text complexity score (for relationship weighting)
   */
  calculateComplexity(text: string): number {
    const words = text.match(/[a-zA-Z]+/g) || [];
    // Simple sentence detection using periods, exclamation marks, and question marks
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);

    if (sentences.length === 0) return 0;

    const avgWordsPerSentence = words.length / sentences.length;
    const uniqueWords = new Set(words).size;
    const lexicalDiversity = uniqueWords / Math.max(words.length, 1);

    // Normalize to 0-1 range
    return Math.min(
      (avgWordsPerSentence / 20) * 0.5 + lexicalDiversity * 0.5,
      1.0
    );
  }

  /**
   * Basic string similarity using character-level comparison
   */
  private calculateBasicSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1.0;
    if (str1.length === 0 || str2.length === 0) return 0.0;

    // Levenshtein distance approach
    const matrix = Array(str2.length + 1)
      .fill(null)
      .map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const substitutionCost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // insertion
          matrix[j - 1][i] + 1, // deletion
          matrix[j - 1][i - 1] + substitutionCost // substitution
        );
      }
    }

    const distance = matrix[str2.length][str1.length];
    const maxLength = Math.max(str1.length, str2.length);
    return 1 - distance / maxLength;
  }
}
