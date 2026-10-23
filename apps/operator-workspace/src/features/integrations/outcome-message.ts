import type { IntegrationsOutcome } from "../../server/integrations";

type Rejection = Extract<
  IntegrationsOutcome,
  { status: "invalid" }
>["rejection"];

/** Every message under `integrations` an outcome can be said with. */
export type OutcomeKey =
  | (Rejection extends infer R
      ? R extends {
          field: infer F extends string;
          reason: infer Why extends string;
        }
        ? `invalid.${F}.${Why}`
        : never
      : never)
  | `reasonInvalid.${Extract<IntegrationsOutcome, { status: "reason_invalid" }>["reason"]}`
  | `refused.${Extract<IntegrationsOutcome, { status: "refused" }>["reason"]}`
  | "failed";

/** The message an outcome is said with, or null when there is nothing to say. */
export function outcomeKey(outcome: IntegrationsOutcome): OutcomeKey | null {
  switch (outcome.status) {
    case "invalid":
      return `invalid.${outcome.rejection.field}.${outcome.rejection.reason}` as OutcomeKey;
    case "reason_invalid":
      return `reasonInvalid.${outcome.reason}`;
    case "refused":
      return `refused.${outcome.reason}`;
    case "error":
      return "failed";
    default:
      return null;
  }
}
