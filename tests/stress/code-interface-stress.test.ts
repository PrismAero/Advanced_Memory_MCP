import { describe, expect, it } from "vitest";

import { InterfaceExtractorRunner } from "../../modules/project-analysis/interfaces/interface-extractor-runner.js";

describe("code-interface extraction stress", () => {
  it("extracts a large C++ fixture with macros without duplicate symbols or oversized definitions", async () => {
    const sections = Array.from({ length: 120 }, (_, i) => `
/** Feature ${i} macro. */
#define FEATURE_${i}(value) ((value) + ${i})

namespace stress {
namespace module_${i} {

/** Service interface ${i}. */
class IService_${i} {
public:
  virtual ~IService_${i}() = default;
  virtual int execute_${i}(int value) = 0;
};

class Service_${i} : public IService_${i} {
public:
  int execute_${i}(int value) override;
};

} // namespace module_${i}
} // namespace stress
`).join("\n");
    const runner = new InterfaceExtractorRunner();
    const started = Date.now();
    const result = await runner.extract(sections, {
      language: "cpp",
      filePath: "stress/generated.hpp",
      relativePath: "stress/generated.hpp",
    });
    const duration = Date.now() - started;

    expect(duration).toBeLessThan(5_000);
    expect(result.interfaces.length).toBeGreaterThanOrEqual(360);
    expect(result.interfaces.filter((iface) => iface.kind === "macro")).toHaveLength(120);
    expect(new Set(result.interfaces.map((iface) => iface.stableId)).size)
      .toBe(result.interfaces.length);
    for (const iface of result.interfaces) {
      expect((iface.definition || "").length).toBeLessThanOrEqual(4_000);
    }
  });
});
