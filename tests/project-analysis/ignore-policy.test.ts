import { promises as fs } from "fs";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { IgnorePolicy } from "../../modules/project-analysis/ignore-policy.js";
import {
  cleanupTempRoot,
  createTempMemoryRoot,
} from "../utils/mcp-test-utils.js";

describe("IgnorePolicy", () => {
  let root: string | undefined;

  afterEach(async () => {
    if (root) await cleanupTempRoot(root);
    root = undefined;
  });

  it("treats ignored folder entries as applying to nested descendants", async () => {
    root = createTempMemoryRoot("advanced-memory-ignore-policy-");
    await fs.mkdir(path.join(root, ".memory"), { recursive: true });
    await fs.writeFile(
      path.join(root, ".memory", ".memoryignore"),
      ["generated", "third_party/foo", "build/"].join("\n"),
    );

    const policy = new IgnorePolicy();
    await policy.load(root);

    expect(policy.ignores("generated/out.cpp")).toBe(true);
    expect(policy.ignores("generated/subdir/out.cpp")).toBe(true);
    expect(policy.ignores("third_party/foo/include/header.h")).toBe(true);
    expect(policy.ignores("build/debug/object.o")).toBe(true);
    expect(policy.ignores("src/generated_name.cpp")).toBe(false);
  });
});
