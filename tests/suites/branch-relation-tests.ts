export interface MemoryGraphTestRunner {
  memoryManager: any;
  runTest(
    name: string,
    category: string,
    testFn: () => Promise<any>,
  ): Promise<any>;
}

export async function runBranchTests(runner: MemoryGraphTestRunner): Promise<void> {
  console.log("\n🌿 BRANCH TESTS\n");

  await runner.runTest("List branches", "Branch", async () => {
    const branches = await runner.memoryManager.listBranches();
    if (!branches.find((branch: any) => branch.name === "main")) {
      throw new Error("Main branch not found");
    }
    return { count: branches.length };
  });

  await runner.runTest("Create branch", "Branch", async () => {
    await runner.memoryManager.createBranch("test-branch", "Test branch purpose");
    const branches = await runner.memoryManager.listBranches();
    if (!branches.find((branch: any) => branch.name === "test-branch")) {
      throw new Error("Branch not created");
    }
    return { created: "test-branch" };
  });

  await runner.runTest("Create entity in branch", "Branch", async () => {
    await runner.memoryManager.createEntities(
      [{ name: "BranchEntity", entityType: "test", observations: ["test"] }],
      "test-branch",
    );
    const graph = await runner.memoryManager.openNodes(["BranchEntity"], "test-branch");
    if (graph.entities.length !== 1) throw new Error("Entity not in branch");
    return { entity: "BranchEntity", branch: "test-branch" };
  });

  await runner.runTest("Entity isolation between branches", "Branch", async () => {
    const mainGraph = await runner.memoryManager.openNodes(["BranchEntity"]);
    if (mainGraph.entities.length !== 0) {
      throw new Error("Entity should not be in main branch");
    }
    return { isolated: true };
  });

  await runner.runTest("Export branch", "Branch", async () => {
    const graph = await runner.memoryManager.exportBranch("test-branch");
    if (graph.entities.length === 0) throw new Error("Branch export empty");
    return { entities: graph.entities.length };
  });

  await runner.runTest("Delete branch", "Branch", async () => {
    await runner.memoryManager.deleteBranch("test-branch");
    const branches = await runner.memoryManager.listBranches();
    if (branches.find((branch: any) => branch.name === "test-branch")) {
      throw new Error("Branch not deleted");
    }
    return { deleted: "test-branch" };
  });

  await runner.runTest("Delete main branch (should fail)", "Branch-Edge", async () => {
    try {
      await runner.memoryManager.deleteBranch("main");
      throw new Error("Should have thrown error");
    } catch (error: any) {
      if (error.message === "Should have thrown error") throw error;
      return { handled: true };
    }
  });

  await runner.runTest("Create branch with special name", "Branch-Edge", async () => {
    await runner.memoryManager.createBranch("feature/test-123", "Feature branch");
    const branches = await runner.memoryManager.listBranches();
    const found = branches.find((branch: any) => branch.name === "feature/test-123");
    if (!found) throw new Error("Branch with special name not created");
    await runner.memoryManager.deleteBranch("feature/test-123");
    return { name: "feature/test-123" };
  });
}

export async function runRelationTests(runner: MemoryGraphTestRunner): Promise<void> {
  console.log("\n🔗 RELATION TESTS\n");

  await runner.memoryManager.createEntities([
    { name: "RelTest_ServiceA", entityType: "service", observations: ["Service A"] },
    { name: "RelTest_ServiceB", entityType: "service", observations: ["Service B"] },
    { name: "RelTest_Controller", entityType: "controller", observations: ["Controller"] },
  ]);

  await runner.runTest("Create relation", "Relation", async () => {
    await runner.memoryManager.createRelations([
      {
        from: "RelTest_ServiceA",
        to: "RelTest_ServiceB",
        relationType: "depends_on",
      },
    ]);
    const graph = await runner.memoryManager.openNodes([
      "RelTest_ServiceA",
      "RelTest_ServiceB",
    ]);
    if (graph.relations.length === 0) throw new Error("Relation not created");
    return { created: true };
  });

  await runner.runTest("Create multiple relations", "Relation", async () => {
    await runner.memoryManager.createRelations([
      { from: "RelTest_Controller", to: "RelTest_ServiceA", relationType: "uses" },
      { from: "RelTest_Controller", to: "RelTest_ServiceB", relationType: "uses" },
    ]);
    const graph = await runner.memoryManager.openNodes(["RelTest_Controller"]);
    if (graph.relations.length < 2) throw new Error("Relations not created");
    return { count: graph.relations.length };
  });

  await runner.runTest("Delete relations", "Relation", async () => {
    await runner.memoryManager.deleteRelations([
      {
        from: "RelTest_ServiceA",
        to: "RelTest_ServiceB",
        relationType: "depends_on",
      },
    ]);
    const graph = await runner.memoryManager.openNodes([
      "RelTest_ServiceA",
      "RelTest_ServiceB",
    ]);
    const remaining = graph.relations.filter(
      (relation: any) =>
        relation.from === "RelTest_ServiceA" &&
        relation.to === "RelTest_ServiceB" &&
        relation.relationType === "depends_on",
    );
    if (remaining.length !== 0) throw new Error("Relation not deleted");
    return { deleted: true };
  });

  await runner.runTest("Create relation with non-existent entity", "Relation-Edge", async () => {
    const created = await runner.memoryManager.createRelations([
      { from: "NonExistent1", to: "NonExistent2", relationType: "test" },
    ]);
    if (created.length !== 0) {
      throw new Error("Non-existent entity relation should not be created");
    }
    return { skipped: true };
  });

  await runner.runTest("Self-referential relation", "Relation-Edge", async () => {
    const created = await runner.memoryManager.createRelations([
      {
        from: "RelTest_ServiceA",
        to: "RelTest_ServiceA",
        relationType: "self_reference",
      },
    ]);
    if (created.length !== 1) {
      throw new Error("Self-referential relation was not reported as created");
    }
    const graph = await runner.memoryManager.openNodes(["RelTest_ServiceA"]);
    const found = graph.relations.some(
      (relation: any) =>
        relation.from === "RelTest_ServiceA" &&
        relation.to === "RelTest_ServiceA" &&
        relation.relationType === "self_reference",
    );
    if (!found) throw new Error("Self-referential relation not persisted");
    return { persisted: true };
  });

  await runner.memoryManager.deleteEntities([
    "RelTest_ServiceA",
    "RelTest_ServiceB",
    "RelTest_Controller",
  ]);
}

export async function runWorkingContextTests(
  runner: MemoryGraphTestRunner,
): Promise<void> {
  console.log("\n💼 WORKING CONTEXT TESTS\n");

  await runner.memoryManager.createEntities([
    { name: "WCTest_Entity1", entityType: "task", observations: ["Active task"] },
    { name: "WCTest_Entity2", entityType: "task", observations: ["Another task"] },
  ]);

  await runner.runTest("Update working context", "WorkingContext", async () => {
    await runner.memoryManager.updateEntityWorkingContext("WCTest_Entity1", true);
    const entity = await runner.memoryManager.findEntityByName("WCTest_Entity1");
    if (!entity?.workingContext) throw new Error("Working context was not persisted");
    return { updated: true };
  });

  await runner.runTest("Update relevance score", "WorkingContext", async () => {
    await runner.memoryManager.updateEntityRelevanceScore("WCTest_Entity1", 0.85);
    const entity = await runner.memoryManager.findEntityByName("WCTest_Entity1");
    if (Math.abs((entity?.relevanceScore || 0) - 0.85) > 0.001) {
      throw new Error(`Relevance score was not persisted: ${entity?.relevanceScore}`);
    }
    return { score: 0.85 };
  });

  await runner.runTest("Update last accessed", "WorkingContext", async () => {
    const before = await runner.memoryManager.findEntityByName("WCTest_Entity1");
    await runner.memoryManager.updateEntityLastAccessed("WCTest_Entity1");
    const after = await runner.memoryManager.findEntityByName("WCTest_Entity1");
    if (!after?.lastAccessed) throw new Error("lastAccessed missing after update");
    if (
      before?.lastAccessed &&
      new Date(after.lastAccessed).getTime() < new Date(before.lastAccessed).getTime()
    ) {
      throw new Error("lastAccessed moved backwards");
    }
    return { updated: true, lastAccessed: after.lastAccessed };
  });

  await runner.memoryManager.deleteEntities(["WCTest_Entity1", "WCTest_Entity2"]);
}
