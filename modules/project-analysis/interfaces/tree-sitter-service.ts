import {
  init,
  process as processSource,
  type ProcessResult,
} from "@kreuzberg/tree-sitter-language-pack";
import { logger } from "../../logger.js";

const TREE_SITTER_LANGUAGES = ["c", "cpp", "python", "typescript", "javascript"];

let initialized = false;
let initializationError: Error | null = null;

export async function processWithTreeSitter(
  content: string,
  language: string,
): Promise<ProcessResult | null> {
  try {
    if (!initialized) {
      init({ languages: TREE_SITTER_LANGUAGES });
      initialized = true;
    }
    return processSource(content, {
      language,
      structure: true,
      imports: true,
      exports: true,
      comments: true,
      docstrings: true,
      symbols: true,
      diagnostics: true,
      chunkMaxSize: 20_000,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    if (!initializationError || initializationError.message !== err.message) {
      logger.warn(`Tree-sitter processing unavailable for ${language}:`, err);
      initializationError = err;
    }
    return null;
  }
}
