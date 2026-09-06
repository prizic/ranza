import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const tracked = execFileSync("git", [
  "ls-files",
  "--cached",
  "--others",
  "--exclude-standard",
  "-z",
])
  .toString()
  .split("\0")
  .filter(Boolean);
const failures = [];
for (const file of tracked) {
  if (/\.env(?:\.|$)/.test(file) && file !== ".env.example")
    failures.push(`${file}: tracked environment file`);
  if (!/\.(?:[cm]?[jt]sx?|md|json|yml|yaml|js)$/.test(file)) continue;
  const contents = readFileSync(file, "utf8");
  if (
    /NEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|SERVICE_ROLE|ENCRYPTION_KEY|PEPPER)/.test(
      contents,
    )
  ) {
    failures.push(`${file}: server secret uses NEXT_PUBLIC_`);
  }
  if (
    /console\.(?:log|info|warn|error)\([^\n]*(?:pin|activation.?code|wifi|session.?token|financial.?description)/i.test(
      contents,
    )
  ) {
    failures.push(`${file}: possible sensitive log payload`);
  }
}
const worker = readFileSync("apps/product-web/public/sw.js", "utf8");
if (
  !worker.includes("PUBLIC_ASSET_PATHS") ||
  !worker.includes('request.method === "GET"') ||
  !worker.includes('headers.has("authorization")')
) {
  failures.push(
    "apps/product-web/public/sw.js: authenticated-cache allowlist guard missing",
  );
}
if (failures.length) {
  for (const failure of failures) process.stderr.write(`FAIL ${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    "PASS tracked secrets, sensitive logs, and service-worker cache guard\n",
  );
}
