"use client";

import { useTranslations } from "next-intl";
import { FormError } from "@ranza/ui";
import type { MaintenanceOutcome } from "../../../server/maintenance";

/**
 * What a maintenance command did, in words, where a screen reader reaches it.
 * The outcome carries no English; this is where it gets its sentence
 * (MT-S1-26). A refusal keeps whatever form it came from as it was.
 */
export function OutcomeMessage({ outcome }: { outcome: MaintenanceOutcome }) {
  const t = useTranslations("maintenance");
  const states = useTranslations("maintenance.states");

  let success: string | null = null;
  let failure: string | null = null;
  switch (outcome.status) {
    case "done":
      success =
        outcome.number !== undefined
          ? t("reported", { number: outcome.number })
          : outcome.stillOutOfOrder
            ? t("stillOut")
            : outcome.heldElsewhere
              ? t("heldElsewhere")
              : outcome.returned
                ? t("returned")
                : t("saved");
      break;
    case "moved":
      failure = t("stale", {
        state: outcome.current ? states(outcome.current) : "",
      });
      break;
    case "refused":
    case "invalid":
    case "blocked":
    case "needsAssignee":
    case "outOfReach":
    case "needsReturnPermission":
      failure = t(outcome.status);
      break;
    case "idle":
    case "impact":
      break;
  }

  return (
    <div aria-live="polite" className="min-h-5">
      {success ? (
        <p className="text-step--1 text-success">{success}</p>
      ) : failure ? (
        <FormError>{failure}</FormError>
      ) : null}
    </div>
  );
}
