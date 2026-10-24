/**
 * The ruler under a stay reads as a calendar (RESERVATIONS-14): the labels are
 * the same number of days apart, and none is dropped while its neighbour stays.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { rulerLabelStep, StayRuler } from "../../packages/ui/src";

afterEach(cleanup);

function labelsFor(start: string, end: string): string[] {
  const { container } = render(
    <StayRuler
      end={end}
      format={(iso) => iso.slice(8)}
      label="stay"
      start={start}
      today={null}
      todayLabel="Today"
    />,
  );
  return [...container.querySelectorAll("text")].map(
    (text) => text.textContent ?? "",
  );
}

describe("the stay ruler's labels", () => {
  it("labels Oct 16 to Oct 24 every other day, from the first to the last", () => {
    expect(labelsFor("2026-10-16", "2026-10-24")).toEqual([
      "16",
      "18",
      "20",
      "22",
      "24",
    ]);
  });

  it("labels a short stay every day", () => {
    expect(labelsFor("2026-10-16", "2026-10-19")).toEqual([
      "16",
      "17",
      "18",
      "19",
    ]);
  });

  it("uses a step that divides the stay when one keeps the labels apart, so the last day is always labelled", () => {
    for (const nights of [4, 6, 8, 9, 10, 12, 14, 21, 28, 30]) {
      const step = rulerLabelStep(nights);
      expect(nights % step).toBe(0);
      expect(nights / step).toBeLessThan(7);
    }
  });
});
