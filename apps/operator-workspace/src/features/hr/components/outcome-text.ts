"use client";

import { useTranslations } from "next-intl";
import type { HrOutcome } from "../../../server/hr";

/**
 * What a command that did not happen says, in the reader's language.
 *
 * The server action answers with a status, a reason or a field and never with
 * words (ADR 0023); this is the one place those become copy, so a screen cannot
 * print the module's English and a new reason is a type error here until every
 * language has it.
 */
export function useOutcomeText(): (outcome: HrOutcome) => string | null {
  const t = useTranslations("hr.outcomes");
  return (outcome) => {
    switch (outcome.status) {
      case "done":
        return null;
      case "invalid":
        return t(`invalid.${outcome.field}`);
      case "refused":
        return t(`refused.${outcome.reason}`);
      case "error":
        return t("error");
    }
  };
}
