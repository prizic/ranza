import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const production = process.argv.includes("--production");
const command = production ? "start" : "dev";
const applications = [
  { directory: "storefront", name: "storefront", port: 43101 },
  { directory: "product-web", name: "product-web", port: 43102 },
  { directory: "control-plane", name: "control-plane", port: 43103 },
];

async function waitForApplication(url, child) {
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `Next.js exited before becoming ready (exit ${child.exitCode}).`,
      );
    }

    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The server has not opened its socket yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for ${url}.`);
}

async function stop(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

for (const application of applications) {
  const applicationRoot = path.join(root, "apps", application.directory);
  const nextBinary = createRequire(
    path.join(applicationRoot, "package.json"),
  ).resolve("next/dist/bin/next");
  const child = spawn(
    process.execPath,
    [nextBinary, command, "--port", String(application.port)],
    {
      cwd: applicationRoot,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  try {
    const origin = `http://127.0.0.1:${application.port}`;
    await waitForApplication(origin, child);
    const response = await fetch(`${origin}/health`);
    const body = await response.text();

    assert.equal(
      response.status,
      200,
      `${application.name} /health must return 200`,
    );
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    assert.deepEqual(JSON.parse(body), {
      application: application.name,
      status: "ok",
    });
    assert.equal(body.includes("SUPABASE_SERVICE_ROLE_KEY"), false);
    console.log(`PASS ${application.name} ${command} /health`);
  } catch (error) {
    console.error(output);
    throw error;
  } finally {
    await stop(child);
  }
}
