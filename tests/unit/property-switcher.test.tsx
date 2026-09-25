/**
 * What the page bar's Property switcher names (HK-S1-24).
 *
 * Every page reads `?property=` the same way: none means the first Property,
 * one it lists means that one, and one it does not list means none. The
 * switcher has to say the same, or it names a Property above a page that is
 * not working in it. The browser suite sees the many-Property viewer; the
 * one-Property cases are only reachable here.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let query = new URLSearchParams();
vi.mock("../../apps/operator-workspace/node_modules/next/navigation", () => ({
  useSearchParams: () => query,
}));

const { PropertySwitcher } =
  await import("../../apps/operator-workspace/src/app/[locale]/(workspace)/property-switcher");

const kadikoy = { href: "/en/today?property=k", id: "k", name: "Kadıköy" };
const besiktas = { href: "/en/today?property=b", id: "b", name: "Beşiktaş" };

function show(url: string, slots: (typeof kadikoy)[]) {
  query = new URLSearchParams(url);
  render(
    <PropertySwitcher
      chooseLabel="Choose a Property"
      label="Properties"
      organization="Deniz Otelleri"
      slots={slots}
    />,
  );
}

afterEach(cleanup);

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

  it("offers the lone Property as a choice rather than naming it, when the URL names another", () => {
    show("property=out-of-reach", [kadikoy]);
    const trigger = screen.getByRole("button", { name: "Properties" });
    expect(trigger).toHaveTextContent("Choose a Property");
    expect(screen.queryByText("Kadıköy")).not.toBeInTheDocument();
  });
});
