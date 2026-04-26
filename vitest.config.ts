import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"],
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 180_000,
    hookTimeout: 180_000,
    teardownTimeout: 60_000,
    pool: "forks",
    isolate: false,
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "json"],
      include: ["modules/**/*.ts", "*.ts"],
      exclude: [
        "dist/**",
        "tests/**",
        "vitest.config.ts",
        "**/*.d.ts",
      ],
    },
  },
});
