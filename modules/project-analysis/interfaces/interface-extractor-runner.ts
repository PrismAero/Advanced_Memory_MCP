import path from "path";
import { CppTreeSitterExtractor } from "./cpp-extractor.js";
import { FallbackRegexExtractor } from "./fallback-regex-extractor.js";
import type {
  InterfaceExtractionContext,
  InterfaceExtractionResult,
  LanguageInterfaceExtractor,
  NormalizedCodeInterface,
} from "./interface-types.js";
import { PythonTreeSitterExtractor } from "./python-extractor.js";
import { TsJsTreeSitterExtractor } from "./ts-js-extractor.js";
import { dedupeInterfaces } from "./extractor-utils.js";

export class InterfaceExtractorRunner {
  private extractors: LanguageInterfaceExtractor[];
  private fallback = new FallbackRegexExtractor();

  constructor(extractors: LanguageInterfaceExtractor[] = defaultExtractors()) {
    this.extractors = extractors;
  }

  async extract(
    content: string,
    context: Omit<InterfaceExtractionContext, "extension"> & {
      extension?: string;
    },
  ): Promise<InterfaceExtractionResult> {
    const fullContext: InterfaceExtractionContext = {
      ...context,
      extension: context.extension || path.extname(context.relativePath),
    };
    const extractor =
      this.extractors.find((candidate) => candidate.supports(fullContext.language)) ||
      this.fallback;

    const result = await extractor.extract(content, fullContext);
    return {
      ...result,
      interfaces: clampInterfaceCount(dedupeInterfaces(result.interfaces), 1_000),
    };
  }
}

export function defaultExtractors(): LanguageInterfaceExtractor[] {
  return [
    new CppTreeSitterExtractor(),
    new PythonTreeSitterExtractor(),
    new TsJsTreeSitterExtractor(),
  ];
}

function clampInterfaceCount(
  interfaces: NormalizedCodeInterface[],
  maxInterfaces: number,
): NormalizedCodeInterface[] {
  return interfaces.slice(0, maxInterfaces);
}

export type {
  CodeInterfaceKind,
  CodeInterfaceMember,
  CodeInterfaceParameter,
  CodeInterfaceRelationship,
  InterfaceExtractionContext,
  InterfaceExtractionResult,
  LanguageInterfaceExtractor,
  NormalizedCodeInterface,
} from "./interface-types.js";
