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

export function startWorker(
  extraEnv: Readonly<Record<string, string>> = {},
): RunningWorker {
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
    env: { ...process.env, WORKER_DATABASE_URL, ...extraEnv },
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

/**
 * How long a test may wait on the worker, and the reason it is not longer.
 *
 * The worker closes every Property's due business day on a one-minute timer,
 * and a close cannot be undone. A run that outlives the minute would shut
 * yesterday at the other Properties the browser tests share and fail specs
 * that have nothing to do with this one. Its first pass of that timer is a
 * minute after it starts, so a wait of three export passes (fifteen seconds
 * each) never reaches it — and a worker too slow to deliver in that time fails
 * the test that started it instead of running on.
 */
export const WORKER_BUDGET_MS = 45_000;

/**
 * Waits for the one effect the worker was started for, and stops it the moment
 * that effect is there or the wait has failed. A failure carries what the
 * process said, which a message built before the wait could not: nothing had
 * been written yet.
 */
export async function whileWorking(
  worker: RunningWorker,
  effect: Promise<unknown>,
): Promise<void> {
  try {
    await effect;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${reason}\nthe worker said:\n${worker.output()}`, {
      cause: error,
    });
  } finally {
    worker.stop();
  }
}
