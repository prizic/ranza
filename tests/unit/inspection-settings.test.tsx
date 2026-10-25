/**
 * The inspection setting, as a person sees it (RANZ-28 slice 3, HK-S3-09).
 *
 * The policies decide who may change it and the integration suite proves the
 * commands. What only the interface can keep: a Property following the default
 * says what it inherits, the flow shows the step inspection adds, and a reader
 * who may not change a setting is told why rather than handed a control that
 * fails.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { InspectionSettings as Settings } from "../../packages/ranza/housekeeping/src";
import { messages } from "../../apps/operator-workspace/src/messages";

// The server action, which the card only calls.
const setInspection = vi.fn();
vi.mock("../../apps/operator-workspace/src/server/housekeeping", () => ({
  setInspection,
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
  defaultReach: { following: 3, keepingOwn: ["Demo Otel"] },
};

beforeAll(() => {
  // jsdom has none of these; an opened select reaches for them.
  class Observer {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", Observer);
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
});

afterEach(() => {
  cleanup();
  setInspection.mockReset();
});

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
    show({ ...manager, mayConfigureDefault: false, defaultReach: null });
    expect(
      screen.getByRole("combobox", { name: "For the whole Organization" }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        "This applies to every Property, so only an Owner, or a role with access to every Property, can change it.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "For this Property" }),
    ).toBeEnabled();
  });

  it("tells a reader without the permission what applies in a sentence, with no control to try (HK-S3-12)", () => {
    show({
      ...manager,
      mayConfigure: false,
      mayConfigureDefault: false,
      defaultReach: null,
    });
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(
      screen.getByText(/waits for an inspection before it is ready to let/),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/A manager can change this/)).toHaveLength(1);

    show({
      ...manager,
      organizationDefault: false,
      effective: false,
      mayConfigure: false,
      mayConfigureDefault: false,
      defaultReach: null,
    });
    expect(
      screen.getByText(/is ready to let without an inspection/),
    ).toBeInTheDocument();
  });

  it("CF-S3-25: embedded in Configuration, a reader who may change neither keeps both values and is told the permission they lack", () => {
    cleanup();
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <InspectionSettings
          embedded
          locale="en"
          propertyId="dd000003-0000-4000-8000-000000000001"
          settings={{
            ...manager,
            mayConfigure: false,
            mayConfigureDefault: false,
          }}
        />
      </NextIntlClientProvider>,
    );
    for (const name of ["For the whole Organization", "For this Property"]) {
      expect(screen.getByRole("combobox", { name })).toBeDisabled();
    }
    expect(
      screen.getAllByText(
        "You can see these settings. To change them, your role needs “Configure rooms & beds”.",
      ),
    ).toHaveLength(2);
  });
});

describe("saving the inspection setting (RANZ-73, CONFIG-02)", () => {
  async function choose(label: string, option: string | RegExp) {
    fireEvent.click(screen.getByRole("combobox", { name: label }));
    fireEvent.click(await screen.findByRole("option", { name: option }));
  }

  it("CF-S3-21: writes nothing when a choice is made, and shows what it would do", async () => {
    show({ ...manager, organizationDefault: false, effective: false });
    expect(
      within(screen.getByTestId("flow")).queryByText("Inspected"),
    ).not.toBeInTheDocument();

    await choose("For this Property", "On");

    expect(setInspection).not.toHaveBeenCalled();
    // The flow follows the choice at once; the buttons wait for it.
    expect(
      within(screen.getByTestId("flow")).getByText("Inspected"),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Save for this Property" }),
    ).toBeEnabled();
    expect(screen.getByText("Not saved yet.")).toBeVisible();
  });

  it("CF-S3-21: offers no save until there is a change, and discards one", async () => {
    show(manager);
    expect(
      screen.getByRole("button", { name: "Save for this Property" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Save for every Property" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Discard changes" }),
    ).toBeNull();

    await choose("For this Property", "Off");
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(
      screen.getByRole("combobox", { name: "For this Property" }),
    ).toHaveTextContent("Use the Organization's setting (On)");
    expect(
      screen.getByRole("button", { name: "Save for this Property" }),
    ).toBeDisabled();
  });

  it("CF-S3-21: saving this Property's own answer sends that scope and that value only", async () => {
    setInspection.mockResolvedValue({ status: "done" });
    show(manager);
    await choose("For this Property", "Off");

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Save for this Property" }),
      );
    });

    await waitFor(() => expect(setInspection).toHaveBeenCalledTimes(1));
    const form = setInspection.mock.calls[0]![1] as FormData;
    expect(form.get("scope")).toBe("property");
    expect(form.get("value")).toBe("off");
    expect(await screen.findByText("Saved")).toBeVisible();
    // And what was saved is what the card now holds, while the refreshed
    // settings are on their way.
    expect(
      screen.getByRole("combobox", { name: "For this Property" }),
    ).toHaveTextContent("Off");
    expect(screen.queryByText("Not saved yet.")).toBeNull();
  });

  it("CF-S3-22: saving the Organization's default asks first and says whom it reaches, and does nothing until it is confirmed", async () => {
    setInspection.mockResolvedValue({ status: "done" });
    show(manager);
    await choose("For the whole Organization", "Off");

    fireEvent.click(
      screen.getByRole("button", { name: "Save for every Property" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("Change the Organization's default?"),
    ).toBeVisible();
    expect(
      within(dialog).getByText(
        "The Organization's default for Check rooms after cleaning changes from “On” to “Off”.",
      ),
    ).toBeVisible();
    expect(setInspection).not.toHaveBeenCalled();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Keep editing" }),
    );
    expect(setInspection).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Save for every Property" }),
    );
    await act(async () => {
      fireEvent.click(
        within(await screen.findByRole("dialog")).getByRole("button", {
          name: "Change the default",
        }),
      );
    });
    await waitFor(() => expect(setInspection).toHaveBeenCalledTimes(1));
    const form = setInspection.mock.calls[0]![1] as FormData;
    expect(form.get("scope")).toBe("organization");
    expect(form.get("value")).toBe("off");
  });

  it("CONFIGURATION-11: the confirm says how many Properties change and which keep their own answer", async () => {
    show(manager);
    await choose("For the whole Organization", "Off");
    fireEvent.click(
      screen.getByRole("button", { name: "Save for every Property" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(
        "3 Properties follow the default and will change.",
      ),
    ).toBeVisible();
    expect(
      within(dialog).getByText(
        /1 Property keeps its own answer and does not change: .*Demo Otel.*\./,
      ),
    ).toBeVisible();
    expect(dialog).not.toHaveTextContent("for every Property");
  });

  it("CONFIGURATION-11: when every Property has its own answer, nothing changes and the confirm says so", async () => {
    show({
      ...manager,
      defaultReach: { following: 0, keepingOwn: ["Demo Otel", "Demo Plaj"] },
    });
    await choose("For the whole Organization", "Off");
    fireEvent.click(
      screen.getByRole("button", { name: "Save for every Property" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(
        "No Property follows the default, so none of them changes.",
      ),
    ).toBeVisible();
    expect(dialog).toHaveTextContent(
      "2 Properties keep their own answer and do not change",
    );
  });

  it("CONFIGURATION-11: a long list of Properties that keep their own answer is counted past the fourth", async () => {
    show({
      ...manager,
      defaultReach: {
        following: 1,
        keepingOwn: ["A", "B", "C", "D", "E", "F"],
      },
    });
    await choose("For the whole Organization", "Off");
    fireEvent.click(
      screen.getByRole("button", { name: "Save for every Property" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/6 Properties keep their own answer/);
    expect(dialog).toHaveTextContent(/and 2 more/);
    expect(dialog.textContent).not.toMatch(/\bE\b|\bF\b/);
  });

  it("CF-S3-23: asks before the tab is closed while a choice is unsaved, and not before", async () => {
    show(manager);
    const quiet = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(quiet);
    expect(quiet.defaultPrevented).toBe(false);

    await choose("For this Property", "Off");
    const asking = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(asking);
    expect(asking.defaultPrevented).toBe(true);
  });

  it("CF-S3-21: embedded in another screen's card, it draws no title of its own", () => {
    cleanup();
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <InspectionSettings
          embedded
          locale="en"
          propertyId="dd000003-0000-4000-8000-000000000001"
          settings={manager}
        />
      </NextIntlClientProvider>,
    );
    expect(
      screen.queryByRole("heading", { name: "Check rooms after cleaning" }),
    ).toBeNull();
    expect(
      screen.getByRole("combobox", { name: "For this Property" }),
    ).toBeVisible();
  });
});
