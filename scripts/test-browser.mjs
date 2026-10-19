// Runs the browser suite in consecutive parts, each against a development
// server of its own.
//
// `next dev` keeps what it compiles and what it renders: measured on this
// suite, about 11 MB of the server's heap is still reachable after a forced
// garbage collection for every test that has run, and 440 MB before the first.
// Next restarts the server when the heap passes 80% of its limit, which it
// sets to half of the machine's memory — 2.8 GB on a 7 GB CI runner. The suite
// reached that around its 300th test of 360, three runs of three: the restart
// resets every connection, a page mid-load reports ERR_ABORTED or a Chrome
// error page, and the specs that need a server and find none are not run.
// No test was at fault; the server was simply never meant to live through the
// whole suite.
//
// Playwright's `--shard` cuts the suite into consecutive, ordered parts (its
// default "partition" mode), and each invocation starts the servers
// `playwright.config.ts` names afresh, so no server serves more than a quarter
// of the suite. The database is shared and the order is unchanged, so the
// parts see exactly what one run would. The seed project runs at the head of
// every part and is safe to repeat.
//
// Arguments are the way to run a few specs, and a few specs need no splitting:
// `pnpm test:browser tests/browser/today.spec.ts` is one ordinary invocation.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PARTS = 4;

const forwarded = process.argv.slice(2);
const invocations =
  forwarded.length > 0
    ? [[]]
    : Array.from({ length: PARTS }, (_, index) => [
        `--shard=${index + 1}/${PARTS}`,
      ]);

// Every part runs even when an earlier one failed: a red run should say
// everything that is red, not only what came first.
let failed = false;
for (const invocation of invocations) {
  const run = spawnSync(
    "pnpm",
    ["exec", "playwright", "test", ...forwarded, ...invocation],
    { cwd: root, stdio: "inherit" },
  );
  if (run.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
