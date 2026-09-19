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
  // Longer than the 5s default for the same reason as the test timeout, and it
  // is the one that bites: a server action is compiled the first time it is
  // submitted, which happens inside an assertion rather than inside a
  // navigation. One run failed here after `pnpm check` had rebuilt `.next`
  // underneath the dev server.
  expect: { timeout: 15_000 },
  // One at a time, and not for isolation — these tests share a seeded account
  // and a Property on purpose, and each brings its own Reservation.
  //
  // `next dev` compiles a route the first time it is asked for, and three
  // workers asking for three different routes against a cold `.next` race on a
  // build manifest: every page then fails with `SyntaxError: Unexpected
  // non-whitespace character after JSON`, which reads like an application
  // defect and is not one. Warm, the same three workers pass. CI is never warm.
  //
  // The whole suite runs in about thirteen seconds serially, so there is
  // nothing to buy back. Revisit if that stops being true.
  workers: 1,
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
    // Prisma Client is generated, not committed, and the workspace cannot
    // import `@ranza/db` without it. That is the one way this has produced a
    // server which starts, stays up, and serves nothing but a module-not-found:
    // Playwright waits for a URL that answers, a dev server answering 500 is
    // still answering, and the wait ends in a timeout with the real error
    // scrolled past above it. Generating takes under a second and makes the
    // case unreachable — reproduced by deleting the directory, which failed
    // exactly as CI did, and passes now.
    //
    // A server that *exits* needs nothing here. Playwright fails in about a
    // second and says why — `Process from config.webServer was not able to
    // start. Exit code: 1` — measured rather than assumed, so that nobody adds
    // configuration for a case the tool already covers.
    command:
      "pnpm --filter @ranza/db generate && pnpm --filter @ranza/operator-workspace dev",
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
