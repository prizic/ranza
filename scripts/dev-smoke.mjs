// Does `pnpm dev` actually serve a page?
//
// This exists because CI said yes for weeks while the answer was no. Every
// route answered "DATABASE_URL must be set before the workspace can serve a
// request" and nothing noticed, for a reason worth stating: `pnpm test:browser`
// passes `env:` to its own server in `playwright.config.ts`, so it proves the
// application works when somebody hands it a connection string, and never that
// `pnpm dev` hands it one. The gap was the whole difference between a developer
// following the README and CI.
//
// So this starts the documented command, with no environment of its own, and
// asks for a page. Two failure modes, because they are different: the server
// never answers, and the server answers while complaining in its log.
import { spawn } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOG = path.join(root, "dev-smoke.log");
const URL_UNDER_TEST = "http://localhost:3000/en/sign-in";
// A cold `next dev` on a runner with no cache compiles the route before it
// answers. Measured at about 20 seconds locally warm; this is the CI headroom.
const DEADLINE_MS = 240_000;
const COMPLAINTS = ["must be set", "must not be"];

writeFileSync(LOG, "");

// detached so the whole tree — this, turbo, next, nest — is one process group
// and can be ended with a single signal. Killing only the child leaves turbo's
// children holding port 3000 and the next step fails for the wrong reason.
const dev = spawn("pnpm", ["dev"], { cwd: root, detached: true });
for (const stream of [dev.stdout, dev.stderr]) {
  stream.on("data", (chunk) => appendFileSync(LOG, chunk));
}

function stop() {
  try {
    process.kill(-dev.pid, "SIGTERM");
  } catch {
    // Already gone, which is not a failure of anything.
  }
}

function finish(code, message) {
  stop();
  console[code === 0 ? "log" : "error"](message);
  if (code !== 0) {
    console.error("\n--- last 40 lines of the dev log ---");
    console.error(readFileSync(LOG, "utf8").split("\n").slice(-40).join("\n"));
  }
  process.exit(code);
}

/** Whatever the server said about a variable it wanted and did not get. */
function complaints() {
  const log = readFileSync(LOG, "utf8");
  return COMPLAINTS.flatMap((phrase) =>
    log
      .split("\n")
      .filter((line) => line.includes(phrase))
      .map((line) => line.trim()),
  );
}

const startedAt = Date.now();
let status = 0;

while (Date.now() - startedAt < DEADLINE_MS) {
  // Checked on every pass, not only at the end. A missing WORKER_DATABASE_URL
  // ends the worker, turbo takes the rest down with it, and waiting the full
  // deadline for a server that has already exited wastes four minutes to
  // report something the log said in the first second.
  const said = complaints();
  if (said.length > 0) {
    finish(1, `pnpm dev could not start:\n  ${said.join("\n  ")}`);
  }

  try {
    status = (await fetch(URL_UNDER_TEST, { redirect: "manual" })).status;
    if (status === 200) break;
  } catch {
    // Not up yet. The deadline is what decides, not the first refusal.
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

if (status !== 200) {
  finish(1, `${URL_UNDER_TEST} answered ${status || "nothing"}, expected 200.`);
}

// Again after it answered: the workspace composes per request, so a variable it
// wanted can be reported by the first real request rather than at startup.
const said = complaints();
if (said.length > 0) {
  finish(
    1,
    `${URL_UNDER_TEST} answered 200, but the log says:\n  ${said.join("\n  ")}`,
  );
}

finish(
  0,
  `pnpm dev served ${URL_UNDER_TEST} with 200 and complained about nothing.`,
);
