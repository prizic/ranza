/**
 * The From → To field: one calendar that picks both ends, submitting the same
 * two `YYYY-MM-DD` values the pair of date inputs it replaced did.
 *
 * What is asserted is what reaches the form, read from the hidden inputs a
 * submit would send — not the text on the button, which is presentation.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DateRangeField } from "../../packages/ui/src";

const labels = {
  from: "Arrival",
  to: "Departure",
  emptyFrom: "Add date",
  emptyTo: "Open-ended",
  pickFrom: "Choose the arrival day",
  pickTo: "Choose the departure",
  clear: "Clear",
  done: "Done",
  span: (nights: number) => `${nights} nights`,
};

afterEach(cleanup);

function renderField(
  props: Partial<Parameters<typeof DateRangeField>[0]> = {},
) {
  const { container } = render(
    <form>
      <DateRangeField
        id="dates"
        labels={labels}
        locale="en"
        names={{ from: "startsOn", to: "endsOn" }}
        {...props}
      />
    </form>,
  );
  const form = container.querySelector("form")!;
  return () => Object.fromEntries(new FormData(form).entries());
}

/** A day in the month it belongs to, not its echo in a neighbouring grid. */
function day(iso: string) {
  const button = document.querySelector<HTMLButtonElement>(
    `td:not([data-outside]) [data-day="${iso}"]`,
  );
  if (!button) throw new Error(`${iso} is not on the calendar`);
  return button;
}

function half(name: RegExp) {
  return screen.getByRole("button", { name });
}

describe("DateRangeField", () => {
  it("takes the start, then the end, and submits both as calendar dates", () => {
    const submitted = renderField({
      defaultValue: { from: "2026-10-05", to: undefined },
      minSpan: 1,
    });

    fireEvent.click(half(/^Arrival/));
    fireEvent.click(day("2026-10-07"));
    expect(screen.getByText("Choose the departure")).toBeInTheDocument();
    fireEvent.click(day("2026-10-10"));

    expect(submitted()).toMatchObject({
      startsOn: "2026-10-07",
      endsOn: "2026-10-10",
    });
  });

  it("changes only the end when the end is the half that was pressed", () => {
    const submitted = renderField({
      defaultValue: { from: "2026-10-05", to: "2026-10-08" },
      minSpan: 1,
    });

    fireEvent.click(half(/^Departure/));
    fireEvent.click(day("2026-10-12"));

    expect(submitted()).toMatchObject({
      startsOn: "2026-10-05",
      endsOn: "2026-10-12",
    });
  });

  it("reads a click on or before the start as a new start when a night is required", () => {
    const submitted = renderField({
      defaultValue: { from: "2026-10-05", to: undefined },
      minSpan: 1,
    });

    fireEvent.click(half(/^Departure/));
    fireEvent.click(day("2026-10-05"));
    expect(submitted()).toMatchObject({ startsOn: "2026-10-05", endsOn: "" });

    fireEvent.click(day("2026-10-02"));
    expect(submitted()).toMatchObject({ startsOn: "2026-10-02", endsOn: "" });
  });

  it("accepts a single day as a range when no night is required", () => {
    const submitted = renderField({
      defaultValue: { from: "2026-10-05", to: undefined },
    });

    fireEvent.click(half(/^Departure/));
    fireEvent.click(day("2026-10-05"));

    expect(submitted()).toMatchObject({
      startsOn: "2026-10-05",
      endsOn: "2026-10-05",
    });
  });

  it("counts the nights while the range is open", () => {
    renderField({ defaultValue: { from: "2026-10-05", to: "2026-10-08" } });

    fireEvent.click(half(/^Arrival/));

    expect(screen.getByText("3 nights")).toBeInTheDocument();
  });

  it("drops an end that a new start would put before it", () => {
    const submitted = renderField({
      defaultValue: { from: "2026-10-05", to: "2026-10-08" },
      minSpan: 1,
    });

    fireEvent.click(half(/^Arrival/));
    fireEvent.click(day("2026-10-09"));

    expect(submitted()).toMatchObject({ startsOn: "2026-10-09", endsOn: "" });
  });

  it("applies a preset in one press", () => {
    const submitted = renderField({
      presets: [{ label: "Last 7 days", from: "2026-09-19", to: "2026-09-25" }],
    });

    fireEvent.click(half(/^Arrival/));
    fireEvent.click(screen.getByRole("button", { name: "Last 7 days" }));

    expect(submitted()).toMatchObject({
      startsOn: "2026-09-19",
      endsOn: "2026-09-25",
    });
  });

  it("clears both ends", () => {
    const submitted = renderField({
      defaultValue: { from: "2026-10-05", to: "2026-10-08" },
    });

    fireEvent.click(half(/^Arrival/));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(submitted()).toMatchObject({ startsOn: "", endsOn: "" });
  });

  // A URL can carry anything; 2026-02-31 would otherwise roll into March.
  it("ignores a date that does not exist", () => {
    const submitted = renderField({
      defaultValue: { from: "2026-02-31", to: "2026-03-04" },
    });

    expect(submitted()).toMatchObject({
      startsOn: "",
      endsOn: "2026-03-04",
    });
    expect(half(/^Arrival/)).toHaveTextContent("Add date");
  });

  // The audit log could filter "up to the 1st" with two inputs, and a shared
  // link still can; the field must show and keep that, not drop it on the
  // next Apply.
  it("keeps an end without a start when no start is required", () => {
    const submitted = renderField({ defaultValue: { to: "2026-10-08" } });

    expect(half(/^Arrival/)).toHaveTextContent("Add date");
    expect(submitted()).toMatchObject({ startsOn: "", endsOn: "2026-10-08" });

    fireEvent.click(half(/^Departure/));
    fireEvent.click(day("2026-10-12"));

    expect(submitted()).toMatchObject({ startsOn: "", endsOn: "2026-10-12" });
  });

  it("clears an end that has no start", () => {
    const submitted = renderField({ defaultValue: { to: "2026-10-08" } });

    fireEvent.click(half(/^Departure/));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(submitted()).toMatchObject({ startsOn: "", endsOn: "" });
  });

  it("asks for the start first when a start is required", () => {
    const submitted = renderField({
      defaultValue: { to: "2026-10-08" },
      minSpan: 1,
      required: true,
    });

    fireEvent.click(half(/^Departure/));
    fireEvent.click(day("2026-10-03"));

    expect(submitted()).toMatchObject({
      startsOn: "2026-10-03",
      endsOn: "2026-10-08",
    });
  });

  it("stops a submit without a start when one is required", () => {
    renderField({ required: true });
    const form = document.querySelector("form")!;

    expect(form.checkValidity()).toBe(false);
  });
});
