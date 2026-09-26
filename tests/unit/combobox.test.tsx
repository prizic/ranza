/**
 * The searchable pickers: what they find, and what a form receives from them.
 *
 * Search is asserted in the two places a plain lower-case gets wrong, Turkish
 * dotted capitals and Arabic-Indic digits, because those are what `fieldMatches`
 * is there for and cmdk's own filter would quietly bring back.
 *
 * The form half is the contract every call site relies on: the pickers replace
 * Radix Selects inside server-action and GET forms that read `FormData`, so the
 * submitted names and values are what has to hold, and `required` has to stop a
 * submission the way the native select it replaces did.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  Combobox,
  MultiCombobox,
  type ComboboxOption,
  type MultiComboboxLabels,
} from "../../packages/ui/src";

beforeAll(() => {
  // cmdk measures its list and scrolls the active item into view; jsdom
  // implements neither.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= function scrollIntoView() {};
});

afterEach(cleanup);

const labels: MultiComboboxLabels = {
  placeholder: "Choose a Unit",
  search: "Search",
  noMatches: "No options match.",
  required: "Choose one to continue.",
  clear: "Clear selection",
  selected: (n) => `${n} selected`,
};

const units: ComboboxOption[] = [
  { value: "u-101", label: "101", description: "Room" },
  { value: "u-102", label: "102", description: "Suite" },
  { value: "u-isp", label: "ISPARTA", description: "Apartment" },
  { value: "u-ibis", label: "Istanbul Suites", description: "Suite" },
];

function openPicker(name = "Unit") {
  fireEvent.click(screen.getByRole("combobox", { name }));
}

function search(text: string) {
  fireEvent.change(screen.getByPlaceholderText(labels.search), {
    target: { value: text },
  });
}

function submitted(form: HTMLFormElement, name: string) {
  return new FormData(form).getAll(name);
}

describe("the single picker", () => {
  function renderInForm(props: Partial<Parameters<typeof Combobox>[0]> = {}) {
    render(
      <form data-testid="form">
        <Combobox
          aria-label="Unit"
          labels={labels}
          name="unit"
          options={units}
          {...props}
        />
      </form>,
    );
    return screen.getByTestId("form") as HTMLFormElement;
  }

  it("shows the placeholder until something is chosen", () => {
    renderInForm();
    expect(screen.getByRole("combobox", { name: "Unit" })).toHaveTextContent(
      "Choose a Unit",
    );
  });

  it("finds by label and description", () => {
    renderInForm();
    openPicker();
    search("suite");
    expect(screen.getByRole("option", { name: /102/ })).toBeVisible();
    expect(screen.queryByRole("option", { name: /101/ })).toBeNull();
  });

  /**
   * Dotless ı is where Turkish folding and the invariant one disagree:
   * "ISPARTA" lower-cases to "isparta" everywhere but Turkey. İ/i would not
   * do — cmdk's fuzzy match finds "İSTANBUL" from "istanbul" regardless.
   */
  it("folds case the Turkish way", () => {
    renderInForm();
    openPicker();
    search("ısparta");
    expect(screen.getByRole("option", { name: /ISPARTA/ })).toBeVisible();
  });

  /**
   * The other half: Turkish rules make a plain capital I into ı, so without
   * reading ı as i, "ist" misses "Istanbul Suites" and "isparta" misses
   * "ISPARTA" — Latin brand names, in the market this product leads with.
   */
  it("finds a plain capital I from an i", () => {
    renderInForm();
    openPicker();
    search("ist");
    expect(
      screen.getByRole("option", { name: /Istanbul Suites/ }),
    ).toBeVisible();
    search("isparta");
    expect(screen.getByRole("option", { name: /ISPARTA/ })).toBeVisible();
  });

  it("matches a run of characters, not a scattering of them", () => {
    renderInForm();
    openPicker();
    search("12");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("reads Arabic-Indic digits as the digits they are", () => {
    renderInForm();
    openPicker();
    search("١٠١");
    expect(screen.getByRole("option", { name: /101/ })).toBeVisible();
    expect(screen.queryByRole("option", { name: /102/ })).toBeNull();
  });

  it("does not match on the value, which is an id", () => {
    renderInForm();
    openPicker();
    search("u-");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText(labels.noMatches)).toBeVisible();
  });

  it("submits the chosen value under its name and closes", () => {
    const form = renderInForm();
    expect(submitted(form, "unit")).toEqual([]);

    openPicker();
    fireEvent.click(screen.getByRole("option", { name: /102/ }));

    expect(submitted(form, "unit")).toEqual(["u-102"]);
    expect(screen.queryByPlaceholderText(labels.search)).toBeNull();
    expect(screen.getByRole("combobox", { name: "Unit" })).toHaveTextContent(
      "102",
    );
  });

  it("starts from its default value", () => {
    const form = renderInForm({ defaultValue: "u-isp" });
    expect(submitted(form, "unit")).toEqual(["u-isp"]);
    expect(screen.getByRole("combobox", { name: "Unit" })).toHaveTextContent(
      "ISPARTA",
    );
  });

  it("shows a value no option matches as itself, not as the placeholder", () => {
    const form = renderInForm({ defaultValue: "u-gone" });
    expect(submitted(form, "unit")).toEqual(["u-gone"]);
    expect(screen.getByRole("combobox", { name: "Unit" })).toHaveTextContent(
      "u-gone",
    );
  });

  it("opens from the arrow keys", () => {
    renderInForm();
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Unit" }), {
      key: "ArrowDown",
    });
    expect(screen.getByRole("option", { name: /101/ })).toBeInTheDocument();
  });

  it("names its list and search in the reader's language", () => {
    render(
      <Combobox
        aria-label="Birim"
        labels={{ ...labels, search: "Ara" }}
        options={units}
      />,
    );
    openPicker("Birim");
    expect(screen.getByRole("listbox", { name: "Ara" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Ara" })).toBeInTheDocument();
    expect(screen.queryByRole("listbox", { name: "Suggestions" })).toBeNull();
  });

  it("refuses a submission while required and empty", () => {
    const form = renderInForm({ required: true });
    const trigger = screen.getByRole("combobox", { name: "Unit" });
    expect(trigger).not.toHaveAttribute("aria-invalid");

    // Outside `act`, React would not have rendered the refusal yet.
    let valid = true;
    act(() => {
      valid = form.reportValidity();
    });
    expect(valid).toBe(false);
    expect(trigger).toHaveAttribute("aria-invalid", "true");
    // The browser's bubble leaves with the focus it was anchored to, so the
    // refusal is said under the trigger too, and describes it.
    expect(trigger).toHaveAccessibleDescription("Choose one to continue.");

    openPicker();
    fireEvent.click(screen.getByRole("option", { name: /101/ }));
    expect(form.checkValidity()).toBe(true);
    expect(trigger).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText("Choose one to continue.")).toBeNull();
  });

  it("marks the chosen option checked, not merely the cursor", () => {
    renderInForm({ defaultValue: "u-102" });
    openPicker();
    expect(screen.getByRole("option", { name: /102/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("option", { name: /101/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  /**
   * The roster saves a role on change and records it in an append-only log,
   * so a re-pick that reported a change would write "Manager to Manager"
   * there for good. The list opens on the current value, so one Enter does it.
   */
  it("reports no change when the chosen option is picked again", () => {
    const onValueChange = vi.fn();
    renderInForm({ onValueChange, value: "u-101" });

    openPicker();
    fireEvent.click(screen.getByRole("option", { name: /101/ }));

    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText(labels.search)).toBeNull();
  });

  it("is only ever what its owner says when controlled", () => {
    const onValueChange = vi.fn();
    const form = renderInForm({ onValueChange, value: "u-101" });

    openPicker();
    fireEvent.click(screen.getByRole("option", { name: /102/ }));

    expect(onValueChange).toHaveBeenCalledWith("u-102");
    expect(submitted(form, "unit")).toEqual(["u-101"]);
  });

  it("lists grouped options under their headings", () => {
    render(
      <Combobox
        aria-label="Role"
        labels={labels}
        options={[
          { value: ":manager", label: "Manager", group: "Ranza" },
          { value: "o:night", label: "Night audit", group: "Yours" },
        ]}
      />,
    );
    openPicker("Role");
    expect(screen.getByText("Ranza")).toBeVisible();
    expect(screen.getByText("Yours")).toBeVisible();
  });
});

describe("the multi picker", () => {
  function renderInForm(
    props: Partial<Parameters<typeof MultiCombobox>[0]> = {},
  ) {
    render(
      <form data-testid="form">
        <MultiCombobox
          aria-label="Unit"
          labels={labels}
          name="units"
          options={units}
          {...props}
        />
      </form>,
    );
    return screen.getByTestId("form") as HTMLFormElement;
  }

  it("stays open while choosing and submits every choice", () => {
    const form = renderInForm();
    openPicker();

    fireEvent.click(screen.getByRole("option", { name: /101/ }));
    fireEvent.click(screen.getByRole("option", { name: /102/ }));

    expect(screen.getByPlaceholderText(labels.search)).toBeVisible();
    expect(submitted(form, "units")).toEqual(["u-101", "u-102"]);
  });

  it("takes a choice back when it is picked again", () => {
    const form = renderInForm({ defaultValue: ["u-101", "u-102"] });
    openPicker();
    fireEvent.click(screen.getByRole("option", { name: /101/ }));
    expect(submitted(form, "units")).toEqual(["u-102"]);
  });

  it("names the choices while they fit, then counts them", () => {
    renderInForm({ defaultValue: ["u-101", "u-102"] });
    const trigger = screen.getByRole("combobox", { name: "Unit" });
    expect(trigger).toHaveTextContent("101");
    expect(trigger).toHaveTextContent("102");

    openPicker();
    fireEvent.click(screen.getByRole("option", { name: /ISPARTA/ }));
    expect(trigger).toHaveTextContent("3 selected");
    expect(trigger).not.toHaveTextContent("101");
  });

  it("clears every choice at once", () => {
    const form = renderInForm({ defaultValue: ["u-101", "u-isp"] });
    openPicker();
    fireEvent.click(screen.getByRole("option", { name: labels.clear }));
    expect(submitted(form, "units")).toEqual([]);

    fireEvent.keyDown(screen.getByPlaceholderText(labels.search), {
      key: "Escape",
    });
    expect(screen.getByRole("combobox", { name: "Unit" })).toHaveTextContent(
      "Choose a Unit",
    );
  });

  it("marks every chosen option checked", () => {
    renderInForm({ defaultValue: ["u-101", "u-isp"] });
    openPicker();
    expect(screen.getByRole("option", { name: /101/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("option", { name: /ISPARTA/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("option", { name: /102/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("keeps the selection when Enter lands on a search that matches nothing", () => {
    const form = renderInForm({ defaultValue: ["u-101", "u-102"] });
    openPicker();
    search("zzz");
    expect(screen.queryByRole("option", { name: labels.clear })).toBeNull();
    fireEvent.keyDown(screen.getByPlaceholderText(labels.search), {
      key: "Enter",
    });
    expect(submitted(form, "units")).toEqual(["u-101", "u-102"]);
  });

  it("offers no clear while nothing is chosen", () => {
    renderInForm();
    openPicker();
    expect(screen.queryByRole("option", { name: labels.clear })).toBeNull();
  });

  it("refuses a submission while required and empty", () => {
    const form = renderInForm({ required: true });
    expect(form.checkValidity()).toBe(false);
    openPicker();
    fireEvent.click(screen.getByRole("option", { name: /101/ }));
    expect(form.checkValidity()).toBe(true);
  });
});
