// `pnpm dev`, with the local database already in the environment.
//
// Two things had to be true before this existed and neither was. Turbo 2 runs
// in strict env mode, so it passed none of the connection strings through to
// the tasks it started — `turbo run dev --dry=json` reported `env: []` and
// `passThroughEnv: null` for the workspace. And nothing loaded a .env for them
// anyway: Next reads .env from the application directory, the root one is
// somewhere else, and the worker reads process.env directly. So a documented
// `pnpm dev` produced "DATABASE_URL must be set before the workspace can serve
// a request" on every route, and the worker exited before that.
//
// turbo.json now declares globalPassThroughEnv, which forwards these. This puts
// them there to forward. Pass-through rather than globalEnv on purpose: a
// connection string is read when a request is served, `next build` does not
// inline it, and putting it in a cache key would make switching databases
// rebuild the world for no reason.
//
// process.loadEnvFile does not overwrite a variable that is already set, which
// is the behaviour this depends on: the file is a floor for somebody who has
// set nothing, and anything exported beats it.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaults = path.join(root, ".env.development");

if (existsSync(defaults)) {
  process.loadEnvFile(defaults);
} else {
  // Not fatal. Somebody may have deleted it deliberately to run against
  // something else, and the two applications say plainly which variable is
  // missing if that turns out to be a mistake.
  console.warn(
    ".env.development is missing, so nothing was loaded. The workspace and the\n" +
      "worker will each say which variable they wanted.",
  );
}

// `stdio: inherit` so this is invisible: turbo's output is the output, Ctrl-C
// reaches it in the same process group, and the exit code is turbo's own.
const turbo = spawnSync("turbo", ["run", "dev", "--parallel"], {
  cwd: root,
  stdio: "inherit",
});

process.exit(turbo.status ?? 1);
