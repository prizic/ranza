import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { evaluateReadiness } from "./lib/readiness-contract.mjs";

const requiredArtifacts = [
  "docs/pilot/production-readiness-checklist.md",
  "docs/pilot/tester-script.md",
  "docs/pilot/metrics-dictionary.md",
  "docs/runbooks/backup-restore.md",
  "docs/runbooks/rollback-feature-disable.md",
  "docs/runbooks/security-review.md",
  "docs/runbooks/incident-response.md",
  "docs/pilot/launch-approvals.md",
  "supabase/tests/performance/1000-student-operator.sql",
];

const localMissing = requiredArtifacts.filter((file) => !existsSync(file));
const externalGates = [
  ["production-like-journeys", "RANZA_EVIDENCE_JOURNEYS"],
  ["accessibility-and-locales", "RANZA_EVIDENCE_ACCESSIBILITY"],
  ["performance-1000-students", "RANZA_EVIDENCE_PERFORMANCE"],
  ["security-review", "RANZA_EVIDENCE_SECURITY"],
  ["backup-restore-rehearsal", "RANZA_EVIDENCE_RESTORE"],
  ["rollback-rehearsal", "RANZA_EVIDENCE_ROLLBACK"],
  ["written-launch-approvals", "RANZA_EVIDENCE_APPROVALS"],
];
const checks = [
  {
    detail: localMissing.length
      ? `missing: ${localMissing.join(", ")}`
      : "required harness artifacts present",
    id: "local-harness",
    status: localMissing.length ? "failed" : "passed",
  },
  ...externalGates.map(([id, variable]) => ({
    detail:
      process.env[variable] ||
      `set ${variable} to an evidence URL or immutable reference`,
    id,
    status: process.env[variable] ? "passed" : "external_pending",
  })),
];
const report = {
  checks,
  generatedAt: new Date().toISOString(),
  gitSha: process.env.GITHUB_SHA ?? "local",
  status: evaluateReadiness(checks),
};
const serialized = `${JSON.stringify(report, null, 2)}\n`;
const outputFlag = process.argv.indexOf("--output");
if (outputFlag >= 0) {
  const target = process.argv[outputFlag + 1];
  if (!target) throw new Error("--output requires a narrowly scoped file path");
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, serialized, { encoding: "utf8", flag: "w" });
}
process.stdout.write(serialized);
if (report.status === "failed") process.exitCode = 1;
