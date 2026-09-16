import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { WorkerModule } from "./worker.module";

/**
 * A standalone application context, and deliberately not a server.
 *
 * `NestFactory.create` would bind a port, and a process that can serve HTTP is
 * a process somebody can add a route to — and a route is where authorization
 * starts being decided in a guard instead of in the database. Not listening is
 * the only version of "this is not a second backend" that survives a
 * reasonable-looking pull request (ADR 0016).
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule);

  // SIGTERM is how a container is asked to stop. Without this the dispatcher is
  // killed mid-pass on every deploy, and each claimed event waits out its full
  // lease before another worker may take it.
  app.enableShutdownHooks();

  new Logger("worker").log("dispatching");
}

void bootstrap().catch((error: unknown) => {
  // Startup refused, which is the designed outcome for a privileged or
  // misdirected connection. Exit non-zero so a supervisor reports a failure
  // rather than a worker that is up and quietly doing nothing.
  new Logger("worker").error(
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
