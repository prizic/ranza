export const operatorArchiveSections = [
  "operator",
  "branches",
  "staff",
  "students",
  "attendance",
  "meals",
  "announcements",
  "maintenance",
  "wifi",
  "balances",
  "billing",
  "audit",
] as const;

export type DestructiveLifecycleAction = "anonymize" | "delete";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function buildLifecycleDryRunManifest(input: {
  action: DestructiveLifecycleAction;
  counts: Readonly<Record<string, number>>;
  operatorId: string;
  policyVersion: number;
}) {
  if (!uuidPattern.test(input.operatorId)) {
    throw new TypeError("Operator target must be one resolved UUID");
  }
  if (!Number.isSafeInteger(input.policyVersion) || input.policyVersion < 1) {
    throw new RangeError("policyVersion must be a positive integer");
  }
  for (const value of Object.values(input.counts)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError("manifest counts must be non-negative integers");
    }
  }
  return { ...input, schemaVersion: 1 as const };
}
