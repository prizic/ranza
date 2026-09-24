"use client";

import { startTransition, useActionState } from "react";
import type { SupportedLocale } from "@ranza/i18n";
import type { MaintenanceOutcome } from "../../../server/maintenance";

type Action = (
  previous: MaintenanceOutcome,
  form: FormData,
) => Promise<MaintenanceOutcome>;

/**
 * One server action as a function of its fields, with its last outcome and
 * whether it is in flight. The locale travels with every command, so a
 * revalidation reaches the pages in the language they were read in.
 */
export function useCommand(action: Action, locale: SupportedLocale) {
  const [outcome, dispatch, pending] = useActionState<
    MaintenanceOutcome,
    FormData
  >(action, { status: "idle" });

  /**
   * `alongside` runs in the same transition as the dispatch: an optimistic
   * update made outside it would be discarded before the answer arrives.
   */
  function run(fields: Record<string, string>, alongside?: () => void) {
    const form = new FormData();
    form.set("locale", locale);
    for (const [name, value] of Object.entries(fields)) form.set(name, value);
    startTransition(() => {
      alongside?.();
      dispatch(form);
    });
  }

  return { outcome, run, pending };
}
