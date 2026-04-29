import { Entity } from "../../memory-types.js";

export interface EntityTestRunner {
  memoryManager: any;
  runTest(name: string, category: string, testFn: () => Promise<any>): Promise<any>;
}

export function createTestEntity(name: string, entityType: string, observations: string[]): Entity {
  return {
    name,
    entityType,
    observations,
    status: "active",
    created: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
  } as Entity;
}

export async function runEntityTests(runner: EntityTestRunner): Promise<void> {
  console.log("\n📦 ENTITY TESTS\n");

  await runner.runTest("Create single entity", "Entity", async () => {
    const entities = await runner.memoryManager.createEntities([
      {
        name: "TestEntity1",
        entityType: "component",
        observations: ["Test observation 1", "Test observation 2"],
      },
    ]);
    if (entities.length !== 1) throw new Error("Expected 1 entity created");
    return { created: entities.length };
  });

  await runner.runTest("Create multiple entities", "Entity", async () => {
    const entities = await runner.memoryManager.createEntities([
      {
        name: "TestEntity2",
        entityType: "service",
        observations: ["Service observation"],
      },
      {
        name: "TestEntity3",
        entityType: "decision",
        observations: ["Decision rationale"],
      },
      {
        name: "TestEntity4",
        entityType: "blocker",
        observations: ["Blocking issue"],
      },
    ]);
    if (entities.length !== 3) throw new Error("Expected 3 entities created");
    return { created: entities.length };
  });

  await runner.runTest("Read entity by name", "Entity", async () => {
    const graph = await runner.memoryManager.openNodes(["TestEntity1"]);
    if (graph.entities.length !== 1) throw new Error("Expected 1 entity");
    if (graph.entities[0].name !== "TestEntity1") {
      throw new Error("Wrong entity returned");
    }
    return { found: graph.entities[0].name };
  });

  await runner.runTest("Add observations to entity", "Entity", async () => {
    await runner.memoryManager.addObservations([
      {
        entityName: "TestEntity1",
        contents: ["New observation 1", "New observation 2"],
      },
    ]);
    const graph = await runner.memoryManager.openNodes(["TestEntity1"]);
    if (graph.entities[0].observations.length < 3) {
      throw new Error("Observations not added");
    }
    return { observations: graph.entities[0].observations.length };
  });

  await runner.runTest("Update entity status", "Entity", async () => {
    await runner.memoryManager.updateEntityStatus("TestEntity1", "archived", "Test archival");
    const graph = await runner.memoryManager.openNodes(["TestEntity1"], undefined, ["archived"]);
    if (graph.entities[0].status !== "archived") {
      throw new Error("Status not updated");
    }
    await runner.memoryManager.updateEntityStatus("TestEntity1", "active");
    return { status: "archived" };
  });

  await runner.runTest("Delete entity", "Entity", async () => {
    await runner.memoryManager.createEntities([
      { name: "ToDelete", entityType: "temp", observations: ["temp"] },
    ]);
    await runner.memoryManager.deleteEntities(["ToDelete"]);
    const graph = await runner.memoryManager.openNodes(["ToDelete"]);
    if (graph.entities.length !== 0) throw new Error("Entity not deleted");
    return { deleted: true };
  });

  await runner.runTest("Create entity with empty name", "Entity-Edge", async () => {
    const entities = await runner.memoryManager.createEntities([
      { name: "", entityType: "test", observations: [] },
    ]);
    if (entities[0]?.name !== "Unnamed Entity") {
      throw new Error(`Expected normalized empty name, got ${entities[0]?.name}`);
    }
    await runner.memoryManager.deleteEntities(["Unnamed Entity"]);
    return { normalizedTo: entities[0].name };
  });

  await runner.runTest("Create entity with very long name", "Entity-Edge", async () => {
    const longName = "A".repeat(1000);
    const entities = await runner.memoryManager.createEntities([
      { name: longName, entityType: "test", observations: ["test"] },
    ]);
    if (entities.length !== 1) throw new Error("Failed to create");
    await runner.memoryManager.deleteEntities([longName]);
    return { nameLength: longName.length };
  });

  await runner.runTest("Create entity with special characters", "Entity-Edge", async () => {
    const specialName = "Test-Entity_With.Special@Chars#123!";
    const entities = await runner.memoryManager.createEntities([
      { name: specialName, entityType: "test", observations: ["test"] },
    ]);
    if (entities.length !== 1) throw new Error("Failed to create");
    const graph = await runner.memoryManager.openNodes([specialName]);
    if (graph.entities[0].name !== specialName) throw new Error("Name mismatch");
    await runner.memoryManager.deleteEntities([specialName]);
    return { name: specialName };
  });

  await runner.runTest("Create entity with unicode characters", "Entity-Edge", async () => {
    const unicodeName = "测试实体_テスト_🎉";
    const entities = await runner.memoryManager.createEntities([
      {
        name: unicodeName,
        entityType: "test",
        observations: ["unicode test"],
      },
    ]);
    if (entities.length !== 1) throw new Error("Failed to create");
    await runner.memoryManager.deleteEntities([unicodeName]);
    return { name: unicodeName };
  });

  await runner.runTest("Create duplicate entity", "Entity-Edge", async () => {
    await runner.memoryManager.createEntities([
      { name: "DuplicateTest", entityType: "test", observations: ["first"] },
    ]);
    await runner.memoryManager.createEntities([
      { name: "DuplicateTest", entityType: "test", observations: ["second"] },
    ]);
    const graph = await runner.memoryManager.readGraph();
    const duplicates = graph.entities.filter((entity: any) => entity.name === "DuplicateTest");
    if (duplicates.length !== 1) {
      throw new Error(`Expected one DuplicateTest row, got ${duplicates.length}`);
    }
    if (duplicates[0].observations.includes("second")) {
      throw new Error("Duplicate create unexpectedly replaced original observations");
    }
    await runner.memoryManager.deleteEntities(["DuplicateTest"]);
    return { deduped: true };
  });

  await runner.runTest("Create entity with very long observation", "Entity-Edge", async () => {
    const longObs = "A".repeat(10000);
    const entities = await runner.memoryManager.createEntities([
      { name: "LongObsEntity", entityType: "test", observations: [longObs] },
    ]);
    if (entities.length !== 1) throw new Error("Failed to create");
    await runner.memoryManager.deleteEntities(["LongObsEntity"]);
    return { obsLength: longObs.length };
  });

  await runner.runTest("Create entity with many observations", "Entity-Edge", async () => {
    const observations = Array.from({ length: 100 }, (_, i) => `Observation ${i + 1}`);
    const entities = await runner.memoryManager.createEntities([
      { name: "ManyObsEntity", entityType: "test", observations },
    ]);
    if (entities.length !== 1) throw new Error("Failed to create");
    await runner.memoryManager.deleteEntities(["ManyObsEntity"]);
    return { obsCount: observations.length };
  });

  await runner.runTest("Open non-existent entity", "Entity-Edge", async () => {
    const graph = await runner.memoryManager.openNodes(["NonExistentEntity"]);
    if (graph.entities.length !== 0) throw new Error("Should return empty");
    return { found: false };
  });
}
