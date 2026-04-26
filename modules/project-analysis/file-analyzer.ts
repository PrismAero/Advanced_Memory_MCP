import { promises as fs } from "fs";
import path from "path";
import { logger } from "../logger.js";
import { isLikelyGeneratedSource } from "./exclusion-patterns.js";
import { buildFileTypeMap } from "./file-type-map.js";
import { SourceParser } from "./source-parser.js";
import type { FileAnalysis, FileTypeInfo } from "./project-types.js";

const MAX_FILE_BYTES_FOR_DETAIL = 1 * 1024 * 1024;
const MAX_LINES_FOR_DETAIL = 5000;
const MAX_FILE_BYTES_FOR_ANY_READ = 5 * 1024 * 1024;

export class FileAnalyzer {
  private fileTypeMap = buildFileTypeMap();
  private parser = new SourceParser();

  async analyzeFile(
    filePath: string,
    rootPath: string,
  ): Promise<FileAnalysis | null> {
    try {
      const stats = await fs.stat(filePath);
      const relativePath = path.relative(rootPath, filePath);
      const fileType = this.getFileType(filePath);

      if (fileType.category === "asset" && stats.size > 1024 * 1024) {
        return null;
      }

      const tooLargeToRead = stats.size > MAX_FILE_BYTES_FOR_ANY_READ;
      const tooLargeForDetail =
        !tooLargeToRead && stats.size > MAX_FILE_BYTES_FOR_DETAIL;

      let imports: FileAnalysis["imports"] = [];
      let exports: FileAnalysis["exports"] = [];
      let interfaces: FileAnalysis["interfaces"] = [];
      let dependencies: string[] = [];
      let lineCount = 0;
      let hasTests = false;
      let complexity: "low" | "medium" | "high" = "low";
      let documentation = 0;
      let isGenerated = false;

      if (
        (fileType.category === "source" || fileType.category === "test") &&
        !tooLargeToRead
      ) {
        try {
          const content = await fs.readFile(filePath, "utf-8");
          lineCount = content.split("\n").length;
          hasTests = this.parser.detectTestFile(relativePath, content);
          isGenerated = isLikelyGeneratedSource(content);

          const skipDetailedParsing =
            tooLargeForDetail ||
            isGenerated ||
            lineCount > MAX_LINES_FOR_DETAIL;

          if (!skipDetailedParsing) {
            if (fileType.hasImports) {
              imports = this.parser.extractImports(content, fileType.language);
              dependencies = imports.map((imp) => imp.source);
            }
            if (fileType.hasExports) {
              exports = this.parser.extractExports(content, fileType.language);
            }
            if (fileType.canDefineInterfaces) {
              interfaces = this.parser.extractInterfaces(content, fileType.language);
            }
            complexity = this.parser.calculateComplexity(content);
            documentation = this.parser.calculateDocumentation(
              content,
              fileType.language,
            );
          } else {
            logger.debug(
              `[INDEX] Skipping detailed parse for ${relativePath} (size=${stats.size}, lines=${lineCount}, generated=${isGenerated})`,
            );
          }
        } catch (error) {
          logger.warn(`Failed to analyze file content ${filePath}:`, error);
        }
      } else if (tooLargeToRead) {
        logger.debug(
          `[INDEX] Recording ${relativePath} as metadata-only (size=${stats.size})`,
        );
      }

      const skippedReason: FileAnalysis["analysisMetadata"]["skippedReason"] =
        tooLargeToRead || tooLargeForDetail
          ? "too-large"
          : isGenerated
            ? "generated"
            : lineCount > MAX_LINES_FOR_DETAIL
              ? "too-many-lines"
              : undefined;

      return {
        filePath,
        relativePath,
        fileType,
        size: stats.size,
        lastModified: stats.mtime,
        imports,
        exports,
        interfaces,
        dependencies,
        isEntryPoint: this.isEntryPoint(relativePath),
        analysisMetadata: {
          lineCount,
          hasTests,
          complexity,
          documentation,
          isGenerated,
          skippedReason,
        },
      };
    } catch (error) {
      logger.warn(`Failed to analyze file ${filePath}:`, error);
      return null;
    }
  }

  extractLanguages(files: FileAnalysis[]): string[] {
    const languages = new Set<string>();
    files.forEach((file) => {
      if (file.fileType.category === "source") {
        languages.add(file.fileType.language);
      }
    });
    return Array.from(languages);
  }

  getFileType(filePath: string): FileTypeInfo {
    const fileName = path.basename(filePath);
    const specialMatch = [".test.ts", ".spec.ts", ".test.js", ".spec.js"].find(
      (suffix) => fileName.endsWith(suffix),
    );
    if (specialMatch) return this.fileTypeMap.get(specialMatch)!;

    const ext = path.extname(filePath);
    return this.fileTypeMap.get(ext) || this.fileTypeMap.get(".unknown")!;
  }

  isEntryPoint(relativePath: string): boolean {
    const normalized = relativePath.replace(/\\/g, "/");
    return (
      /^(index|main|app|server)\.(js|ts|jsx|tsx)$/.test(path.basename(normalized)) ||
      /^src\/(index|main|app|server)\.(js|ts|jsx|tsx)$/.test(normalized)
    );
  }
}
