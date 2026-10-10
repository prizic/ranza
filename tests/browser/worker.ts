import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import path from "node:path";

import { WORKER_DATABASE_URL } from "./local-database";

const ROOT = path.resolve(__dirname, "../..");

/**
 * The real worker, built and run as a deployment runs it.
 *
 * A test that needs an outbox event delivered cannot call the handler itself
 * without proving only the handler: what is under test is that the process a
 * deployment starts claims the event and calls it. The worker runs on its own
 * timer, so the caller waits for the effect it expects rather than for the
 * process.
 */
export interface RunningWorker {
  /** Everything the process has written, for a failure message. */
  output(): string;
  stop(): void;
}

export function startWorker(): RunningWorker {
  const built = spawnSync("pnpm", ["--filter", "@ranza/worker", "build"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (built.status !== 0) {
    throw new Error(`building the worker failed:\n${built.stderr}`);
  }

  const chunks: string[] = [];
  const worker: ChildProcess = spawn("node", ["apps/worker/dist/main.mjs"], {
    cwd: ROOT,
    env: { ...process.env, WORKER_DATABASE_URL },
  });
  worker.stdout?.on("data", (chunk: Buffer) => chunks.push(String(chunk)));
  worker.stderr?.on("data", (chunk: Buffer) => chunks.push(String(chunk)));

  return {
    output: () => chunks.join(""),
    stop: () => {
      worker.kill("SIGTERM");
    },
  };
}
