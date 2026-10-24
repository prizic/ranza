/**
 * What the rail draws for a destination, and for one with nothing behind it
 * yet (SHELL-08, SHELL-09).
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PlannedScreen } from "../../packages/ui/src";
import { ALL_SCREENS } from "../../apps/operator-workspace/src/lib/screens";

afterEach(cleanup);

describe("a destination's icon", () => {
  it("SHELL-09: is its own, because the folded rail is a column of icons and nothing else tells two apart", () => {
    const owners = new Map<unknown, string[]>();
    for (const { icon, segment } of ALL_SCREENS) {
      owners.set(icon, [...(owners.get(icon) ?? []), segment]);
    }
    const shared = [...owners.values()].filter(
      (segments) => segments.length > 1,
    );
    expect(shared).toEqual([]);
  });
});

describe("a screen with nothing behind it yet", () => {
  it("SHELL-08: says what it will do and when, and sends nobody to a repository", () => {
    render(
      <PlannedScreen
        heading="Coming later"
        summary="Stock movements, counts and procurement."
        title="Inventory"
      />,
    );
    expect(screen.getByText("Coming later")).toBeInTheDocument();
    expect(
      screen.getByText("Stock movements, counts and procurement."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText(/blueprint|handover/i)).toBeNull();
  });
});
