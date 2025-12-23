#!/usr/bin/env node
/**
 * Test script to verify project type detection and tool filtering
 */

import { ProjectTypeDetector } from "./modules/project-type-detector.js";
import {
  filterToolsByProjectType,
  SMART_MEMORY_TOOLS,
} from "./modules/smart-memory-tools.js";

async function testProjectTypeDetection() {
  console.log("Testing Project Type Detection\n");
  console.log("================================\n");

  const projectPath = process.env.MEMORY_PATH || process.cwd();
  const detector = new ProjectTypeDetector(projectPath);

  console.log(`Analyzing project at: ${projectPath}\n`);

  const projectType = await detector.detectProjectType();

  console.log("Detection Results:");
  console.log(`  Primary Language: ${projectType.primary}`);
  console.log(
    `  Secondary Languages: ${
      projectType.secondary.length > 0
        ? projectType.secondary.join(", ")
        : "none"
    }`
  );
  console.log(
    `  Features: ${
      projectType.features.length > 0 ? projectType.features.join(", ") : "none"
    }`
  );
  console.log(`  Confidence: ${Math.round(projectType.confidence * 100)}%\n`);

  console.log("Tool Filtering:");
  const filteredTools = filterToolsByProjectType(
    SMART_MEMORY_TOOLS,
    projectType
  );
  console.log(`  Total tools: ${SMART_MEMORY_TOOLS.length}`);
  console.log(`  Available tools: ${filteredTools.length}`);
  console.log(
    `  Filtered out: ${SMART_MEMORY_TOOLS.length - filteredTools.length}\n`
  );

  const qtTools = [
    "analyze_qml_bindings",
    "find_qt_controllers",
    "analyze_layer_architecture",
    "find_qml_usage",
    "list_q_properties",
    "list_q_invokables",
  ];

  const qtEnabled = qtTools.filter((name) =>
    filteredTools.some((t) => t.name === name)
  );

  console.log("Qt/QML Tools Status:");
  qtTools.forEach((toolName) => {
    const enabled = qtEnabled.includes(toolName);
    console.log(`  ${toolName}: ${enabled ? "✓ enabled" : "✗ disabled"}`);
  });

  console.log("\nRecommendations:");
  // Derive recommendations from actual filtering results
  const qtToolsEnabled = qtEnabled.length > 0;

  if (qtToolsEnabled) {
    if (projectType.confidence === 0) {
      console.log("  ⚠ Unknown project type - all tools enabled by default");
    } else if (
      projectType.primary === "cpp" ||
      projectType.features.includes("qt") ||
      projectType.features.includes("qml")
    ) {
      console.log("  ✓ Qt/QML tools are enabled for this C++/Qt project");
    } else {
      console.log(
        "  ℹ Qt/QML tools are enabled (fallback for unknown project)"
      );
    }
  } else {
    console.log(
      `  ✓ Qt/QML tools are disabled for this ${projectType.primary} project (correct)`
    );
  }

  console.log("\n================================\n");
}

testProjectTypeDetection().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
