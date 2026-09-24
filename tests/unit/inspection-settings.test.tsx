/**
 * The inspection setting, as a person sees it (RANZ-28 slice 3, HK-S3-09).
 *
 * The policies decide who may change it and the integration suite proves the
 * commands. What only the interface can keep: a Property following the default
 * says what it inherits, the flow shows the step inspection adds, and a reader
 * who may not change a setting is told why rather than handed a control that
 * fails.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InspectionSettings as Settings } from "../../packages/ranza/housekeeping/src";
import { messages } from "../../apps/operator-workspace/src/messages";

// The server action, which the card only calls.
vi.mock("../../apps/operator-workspace/src/server/housekeeping", () => ({
  setInspection: vi.fn(),
}));

const { InspectionSettings } =
  await import("../../apps/operator-workspace/src/features/housekeeping/components/inspection-settings");

function show(settings: Settings) {
  cleanup();
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <InspectionSettings
        locale="en"
        propertyId="dd000003-0000-4000-8000-000000000001"
        settings={settings}
      />
    </NextIntlClientProvider>,
  );
}

const manager: Settings = {
  organizationDefault: true,
  propertyOverride: null,
  effective: true,
  mayConfigure: true,
  mayConfigureDefault: true,
};

afterEach(() => cleanup());

describe("the inspection setting", () => {
  it("says what a Property following the default inherits (HK-S3-09)", () => {
    show(manager);
    expect(
      screen.getByRole("combobox", { name: "For this Property" }),
    ).toHaveTextContent("Use the Organization's setting (On)");
  });

  it("shows the inspected step only while inspection applies", () => {
    show(manager);
    expect(
      within(screen.getByTestId("flow")).getByText("Inspected"),
    ).toBeVisible();

    show({ ...manager, organizationDefault: false, effective: false });
    expect(
      within(screen.getByTestId("flow")).queryByText("Inspected"),
    ).not.toBeInTheDocument();
  });

  it("tells a manager of one Property why the default is not theirs", () => {
    show({ ...manager, mayConfigureDefault: false });
    expect(
      screen.getByRole("combobox", { name: "For the whole Organization" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/reaches every Property can change/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "For this Property" }),
    ).toBeEnabled();
  });

  it("leaves a reader without the permission both values and no control", () => {
    show({ ...manager, mayConfigure: false, mayConfigureDefault: false });
    for (const name of ["For the whole Organization", "For this Property"]) {
      expect(screen.getByRole("combobox", { name })).toBeDisabled();
    }
    expect(screen.getAllByText("A manager can change this.")).toHaveLength(2);
  });
});
