import { startTransition, type FormEvent } from "react";

/**
 * A form's submit, dispatched by hand rather than through `action`.
 *
 * React resets a form after its `action` runs, and Radix's Select and Checkbox
 * answer that reset by setting the value they mounted with — through the same
 * callback a choice goes through, so a controlled room or switch is cleared by
 * every answer that keeps a dialog open. A refusal and an impact are exactly
 * those answers (MT-S2-09), and so is every refusal a change dialog keeps
 * open for the desk to choose again (ADR 0039).
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
