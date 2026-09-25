"use client";

import { startTransition, useActionState, type FormEvent } from "react";
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

/**
 * A form's submit, dispatched by hand rather than through `action`.
 *
 * React resets a form after its `action` runs, and Radix's Select and Checkbox
 * answer that reset by setting the value they mounted with — through the same
 * callback a choice goes through, so a controlled room or switch is cleared by
 * every answer that keeps a dialog open. A refusal and an impact are exactly
 * those answers (MT-S2-09).
 */
export function submitWithoutReset(
  dispatch: (form: FormData) => void,
  before?: () => void,
) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    before?.();
    const form = new FormData(event.currentTarget);
    startTransition(() => dispatch(form));
  };
}
