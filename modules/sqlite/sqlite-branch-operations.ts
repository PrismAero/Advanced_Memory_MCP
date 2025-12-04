import path from "path";
import { MemoryBranchInfo } from "../../memory-types.js";
import { SQLiteConnection } from "./sqlite-connection.js";

/**
 * SQLite Branch Operations
 * Handles CRUD operations for memory branches
 */
export class SQLiteBranchOperations {
  constructor(private connection: SQLiteConnection) {}

  async createBranch(
    branchName: string,
    purpose?: string
  ): Promise<MemoryBranchInfo> {
    await this.connection.runQuery(
      "INSERT INTO memory_branches (name, purpose) VALUES (?, ?)",
      [branchName, purpose || `Custom branch: ${branchName}`]
    );

    return {
      name: branchName,
      path: this.getBranchPath(branchName),
      purpose: purpose || `Custom branch: ${branchName}`,
      entityCount: 0,
      relationCount: 0,
      lastUpdated: new Date().toISOString(),
    };
  }

  async deleteBranch(branchName: string): Promise<void> {
    if (branchName === "main") {
      throw new Error("Cannot delete main branch");
    }

    const branchId = await this.connection.getBranchId(branchName);
    await this.connection.runQuery("DELETE FROM memory_branches WHERE id = ?", [
      branchId,
    ]);
  }

  async listBranches(): Promise<MemoryBranchInfo[]> {
    const branches = await this.connection.runQuery(`
      SELECT 
        b.name, b.purpose, b.updated_at,
        COUNT(DISTINCT e.id) as entity_count,
        COUNT(DISTINCT r.id) as relation_count
      FROM memory_branches b
      LEFT JOIN entities e ON b.id = e.branch_id
      LEFT JOIN relations r ON b.id = r.branch_id
      GROUP BY b.id, b.name, b.purpose, b.updated_at
      ORDER BY CASE WHEN b.name = 'main' THEN 0 ELSE 1 END, b.name
    `);

    return branches.map((b: any) => ({
      name: b.name,
      path: this.getBranchPath(b.name),
      purpose: b.purpose,
      entityCount: parseInt(b.entity_count) || 0,
      relationCount: parseInt(b.relation_count) || 0,
      lastUpdated: b.updated_at,
    }));
  }

  private getBranchPath(branchName: string): string {
    const basePath = process.env.MEMORY_PATH || ".memory";
    if (branchName === "main") {
      return path.join(basePath, "memory.json");
    }
    return path.join(basePath, `${branchName}.json`);
  }

  async suggestBranch(entityType?: string, content?: string): Promise<string> {
    // Generic branch suggestion logic that works with any existing branches
    if (!entityType && !content) return "main";

    // Get all available branches dynamically
    const branches = await this.listBranches();
    const branchNames = branches.map((b) => b.name.toLowerCase());

    const searchTerms = [
      ...(entityType ? entityType.toLowerCase().split(/\s+/) : []),
      ...(content ? content.toLowerCase().split(/\s+/) : []),
    ];

    // Find best matching branch based on keywords
    let bestMatch = "main";
    let bestScore = 0;

    for (const branch of branches) {
      if (branch.name === "main") continue;

      const branchName = branch.name.toLowerCase();
      const branchPurpose = (branch.purpose || "").toLowerCase();

      let score = 0;

      // Score based on direct name matches
      for (const term of searchTerms) {
        if (branchName.includes(term) || term.includes(branchName)) {
          score += 10; // High score for name matches
        }
        if (branchPurpose.includes(term)) {
          score += 5; // Medium score for purpose matches
        }
      }

      // Score based on common keywords
      if (
        searchTerms.some((term) =>
          ["doc", "documentation", "spec", "guide"].includes(term)
        ) &&
        (branchName.includes("doc") || branchPurpose.includes("doc"))
      ) {
        score += 8;
      }

      if (
        searchTerms.some((term) =>
          ["demo", "example", "sample", "test"].includes(term)
        ) &&
        (branchName.includes("demo") || branchPurpose.includes("demo"))
      ) {
        score += 8;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = branch.name;
      }
    }

    return bestMatch;
  }
}
