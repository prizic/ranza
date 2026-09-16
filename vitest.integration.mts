import { defineConfig } from "vitest/config";

// Separate from the unit config: these need a running database and the node
// environment, so they must not run by default in pnpm check.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
  },
});
