import { defineConfig } from "vitest/config";

// Separate from the unit config: these need a running database and the node
// environment, so they must not run by default in pnpm check.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    // Refuses a database that is not this machine's, before a suite is loaded
    // — the same guard test:browser gets by importing tests/browser/local-
    // database.ts from its config, and for the same reason. These suites take
    // bookings, check people in and post charges, and none of it can be
    // deleted afterwards.
    //
    // globalSetup rather than setupFiles: it runs once, before anything, so the
    // refusal names the variable instead of arriving as fourteen failed
    // connections.
    globalSetup: ["./tests/integration/local-database.ts"],
    fileParallelism: false,
  },
});
