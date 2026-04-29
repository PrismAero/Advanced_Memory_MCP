import { promises as fs } from "fs";
import path from "path";
import { logger } from "../logger.js";
import type { FileAnalysis } from "./project-types.js";
import { IgnorePolicy } from "./ignore-policy.js";

export class ProjectFileScanner {
  constructor(
    private ignorePolicy: IgnorePolicy,
    private analyzeFile: (filePath: string, rootPath: string) => Promise<FileAnalysis | null>,
  ) {}

  async scan(rootPath: string): Promise<FileAnalysis[]> {
    const files: FileAnalysis[] = [];

    const scanDirectory = async (dirPath: string): Promise<void> => {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          const relativePath = path.relative(rootPath, fullPath);

          if (this.ignorePolicy.ignores(relativePath)) {
            continue;
          }

          if (entry.isDirectory()) {
            await scanDirectory(fullPath);
          } else if (entry.isFile()) {
            const analysis = await this.analyzeFile(fullPath, rootPath);
            if (analysis) files.push(analysis);
          }
        }
      } catch (error) {
        logger.warn(`Failed to scan directory ${dirPath}:`, error);
      }
    };

    await scanDirectory(rootPath);
    return files;
  }
}
