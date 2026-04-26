import { Entity, MemoryBranchInfo } from "../../memory-types.js";
import { jsonResponse, sanitizeEntities } from "./response-utils.js";

/**
 * Branch Management Handlers
 * Handles all memory branch operations
 */
export class BranchHandlers {
  private memoryManager: any;

  constructor(memoryManager: any) {
    this.memoryManager = memoryManager;
  }

  async handleListMemoryBranches(): Promise<any> {
    const branches = await this.memoryManager.listBranches();
    return jsonResponse({ branches });
  }

  async handleCreateMemoryBranch(args: any): Promise<any> {
    if (!args.branch_name) {
      throw new Error("branch_name is required");
    }
    const newBranch = await this.memoryManager.createBranch(
      args.branch_name as string,
      args.purpose as string
    );
    return jsonResponse({
      created: true,
      branch: newBranch,
    });
  }

  async handleDeleteMemoryBranch(args: any): Promise<any> {
    if (!args.branch_name) {
      throw new Error("branch_name is required");
    }
    await this.memoryManager.deleteBranch(args.branch_name as string);
    return jsonResponse({
      deleted: true,
      branch_name: args.branch_name,
    });
  }

  async handleReadMemoryBranch(args: any): Promise<any> {
    const branchGraph = await this.memoryManager.readGraph(
      args.branch_name as string,
      args.include_statuses,
      args.include_auto_context !== false
    );
    const maxObservations = typeof args.max_observations === "number"
      ? args.max_observations
      : 5;
    return jsonResponse({
      branch: args.branch_name || "main",
      entities: sanitizeEntities(branchGraph.entities, { maxObservations }),
      relations: branchGraph.relations,
      counts: {
        entities: branchGraph.entities.length,
        relations: branchGraph.relations.length,
      },
    });
  }
}
