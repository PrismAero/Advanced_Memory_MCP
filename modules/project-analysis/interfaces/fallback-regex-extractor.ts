import { SourceParser } from "../source-parser.js";
import type {
  InterfaceExtractionContext,
  InterfaceExtractionResult,
  LanguageInterfaceExtractor,
} from "./interface-types.js";
import { makeInterface } from "./extractor-utils.js";

export class FallbackRegexExtractor implements LanguageInterfaceExtractor {
  readonly languages = ["*"];
  private parser = new SourceParser();

  supports(): boolean {
    return true;
  }

  async extract(
    content: string,
    context: InterfaceExtractionContext,
  ): Promise<InterfaceExtractionResult> {
    const interfaces = this.parser
      .extractInterfaces(content, context.language)
      .map((iface) =>
        makeInterface({
          name: iface.name,
          properties: iface.properties,
          extends: iface.extends,
          isExported: iface.isExported,
          kind: "interface",
          language: context.language,
          relativePath: context.relativePath,
          line: iface.line,
          signature: `${context.language} ${iface.name}`,
        }),
      );
    return {
      interfaces,
      diagnostics: [`Fallback regex extraction used for ${context.language}`],
      parser: "fallback",
    };
  }
}
