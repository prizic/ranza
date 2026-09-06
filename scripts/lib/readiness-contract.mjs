export function evaluateReadiness(checks) {
  if (checks.some((check) => check.status === "failed")) return "failed";
  if (checks.some((check) => check.status === "external_pending")) {
    return "blocked_external";
  }
  return checks.length > 0 && checks.every((check) => check.status === "passed")
    ? "ready"
    : "failed";
}
