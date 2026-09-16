import { defineConfig, devices } from "@playwright/test";

import {
  AUTH_DATABASE_URL,
  DATABASE_URL,
} from "./tests/browser/local-database";

/**
 * The Operator Workspace in a browser.
 *
 * Separate from `pnpm check` for the same reason `db:test` and
 * `test:integration` are: it needs a real database, and this one needs the
 * application running in front of it as well. Importing the module above is
 * what refuses a database that is not local — before a browser opens, so the
 * refusal names the variable rather than arriving as a failed assertion.
 *
 * The server is started here rather than assumed, so the test says what it ran
 * against. A developer already running `pnpm dev` keeps it: that server is
 * theirs, pointed wherever their environment says, and the test fails plainly
 * if it is not this database — the seeded arrival simply will not be on the
 * list.
 */
const WORKSPACE = "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/browser",
  // Generous, because `next dev` compiles a route the first time it is asked
  // for and CI asks with an empty cache. It is a ceiling on a hang, not a
  // budget the run spends: a warm machine finishes this in seconds.
  timeout: 90_000,
  forbidOnly: Boolean(process.env.CI),
  reporter: "list",
  use: {
    baseURL: WORKSPACE,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "seed", testMatch: /seed\.setup\.ts/ },
    {
      name: "workspace",
      use: devices["Desktop Chrome"],
      dependencies: ["seed"],
    },
  ],
  webServer: {
    command: "pnpm --filter @ranza/operator-workspace dev",
    url: `${WORKSPACE}/en/sign-in`,
    reuseExistingServer: !process.env.CI,
    // A cold `next dev` compiles the route before it answers, and CI starts
    // with no cache at all.
    timeout: 180_000,
    env: {
      DATABASE_URL,
      AUTH_DATABASE_URL,
      // Local, throwaway, and never a real one — the same reasoning that lets
      // `db:seed:dev` hardcode a password, and true for the same reason: the
      // import above refuses to run against anything but this machine.
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ??
        "browser-tests-only-and-never-a-real-secret",
      BETTER_AUTH_URL: WORKSPACE,
    },
  },
});
