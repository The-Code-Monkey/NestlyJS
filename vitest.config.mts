import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/server/test/**/*.test.{ts,tsx}"],
    setupFiles: ["packages/server/test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/server/src/**/*.{ts,tsx}"],
      exclude: ["packages/server/src/**/*.d.ts"],
      reporter: ["text", "json-summary"],
      thresholds: {
        lines: 100,
        statements: 100,
        functions: 100,
        branches: 85,
      },
    },
  },
});
