/**
 * What the page bar's Property switcher names (HK-S1-24).
 *
 * Every page reads `?property=` the same way: none means the first Property,
 * one it lists means that one, and one it does not list means none. The
 * switcher has to say the same, or it names a Property above a page that is
 * not working in it. The browser suite sees the many-Property viewer; the
 * one-Property cases are only reachable here.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let query = new URLSearchParams();
let pathname = "/en/today";
vi.mock("../../apps/operator-workspace/node_modules/next/navigation", () => ({
  useSearchParams: () => query,
  usePathname: () => pathname,
}));

const { PropertySwitcher } =
  await import("../../apps/operator-workspace/src/app/[locale]/(workspace)/property-switcher");

interface Slot {
  id: string;
  name: string;
  organization: string;
  segments: readonly string[];
}

const kadikoy: Slot = {
  id: "k",
  name: "Kadıköy",
  organization: "Deniz Otelleri",
  segments: ["today", "housekeeping", "finance"],
};
const besiktas: Slot = {
  id: "b",
  name: "Beşiktaş",
  organization: "Deniz Otelleri",
  segments: ["today", "housekeeping"],
};
// Housekeeping without Today (OA-S3-07): listed all the same.
const moda: Slot = {
  id: "m",
  name: "Moda",
  organization: "Ada Otelleri",
  segments: ["housekeeping", "audit-log"],
};

function show(
  url: string,
  slots: readonly Slot[],
  { defaultId = slots[0]?.id ?? "", path = "/en/today" } = {},
) {
  query = new URLSearchParams(url);
  pathname = path;
  render(
    <PropertySwitcher
      chooseLabel="Choose a Property"
      defaultId={defaultId}
      label="Properties"
      locale="en"
      slots={slots}
    />,
  );
}

function open() {
  fireEvent.pointerDown(screen.getByRole("button", { name: "Properties" }), {
    button: 0,
    ctrlKey: false,
  });
}

const link = (name: string) =>
  screen.getByRole("menuitem", { name }).getAttribute("href");

afterEach(() => {
  cleanup();
  document.cookie = "ranza_property=; Path=/; Max-Age=0";
});

describe("the Property switcher", () => {
  it("names the first Property when the URL names none", () => {
    show("", [kadikoy, besiktas]);
    expect(
      screen.getByRole("button", { name: "Properties" }),
    ).toHaveTextContent("Kadıköy");
  });

  it("names the Property the URL names", () => {
    show("property=b", [kadikoy, besiktas]);
    expect(
      screen.getByRole("button", { name: "Properties" }),
    ).toHaveTextContent("Beşiktaş");
  });

  it("names none when the URL names a Property it does not list", () => {
    show("property=out-of-reach", [kadikoy, besiktas]);
    const trigger = screen.getByRole("button", { name: "Properties" });
    expect(trigger).toHaveTextContent("Choose a Property");
    expect(trigger).not.toHaveTextContent("Kadıköy");
  });

  it("names a lone Property without a menu", () => {
    show("", [kadikoy]);
    expect(screen.getByText("Kadıköy")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("names the Property remembered on this device when the URL names none", () => {
    show("", [kadikoy, besiktas], { defaultId: "b" });
    expect(
      screen.getByRole("button", { name: "Properties" }),
    ).toHaveTextContent("Beşiktaş");
  });

  it("lists a Property where the viewer has a destination but not Today", () => {
    show("", [kadikoy, moda]);
    open();
    expect(screen.getByRole("menuitem", { name: "Moda" })).toBeInTheDocument();
  });

  it("keeps the page being viewed when it is open at the chosen Property", () => {
    show("property=k", [kadikoy, besiktas], { path: "/en/housekeeping" });
    open();
    expect(link("Beşiktaş")).toBe("/en/housekeeping?property=b");
  });

  it("opens Today there when the page is not, and never carries a detail across", () => {
    show("property=k", [kadikoy, besiktas], {
      path: "/en/finance/0c7a1b2e-0000-4000-8000-000000000001",
    });
    open();
    expect(link("Beşiktaş")).toBe("/en/today?property=b");
  });

  it("opens the first destination open there when Today is not either", () => {
    show("property=k", [kadikoy, moda], { path: "/en/finance" });
    open();
    expect(link("Moda")).toBe("/en/housekeeping?property=m");
  });

  it("names the Organization of the Property being worked in", () => {
    show("property=m", [kadikoy, moda]);
    open();
    expect(screen.getByText("Ada Otelleri")).toBeInTheDocument();
  });

  it("remembers the choice on this device", () => {
    show("property=k", [kadikoy, besiktas]);
    open();
    const choice = screen.getByRole("menuitem", { name: "Beşiktaş" });
    choice.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(choice);
    expect(document.cookie).toContain("ranza_property=b");
  });

  it("offers the lone Property as a choice rather than naming it, when the URL names another", () => {
    show("property=out-of-reach", [kadikoy]);
    const trigger = screen.getByRole("button", { name: "Properties" });
    expect(trigger).toHaveTextContent("Choose a Property");
    expect(screen.queryByText("Kadıköy")).not.toBeInTheDocument();
  });
});
