/**
 * The rail lists what is open at the Property being worked in, and carries only
 * a Property the viewer can switch to (RANZ-53, PORTFOLIO-03).
 *
 * A page the Property has switched off is not offered there, and a `?property=`
 * naming nothing the viewer reaches — a stale bookmark — is not handed on to
 * the next page.
 */
import { renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "../../apps/operator-workspace/src/messages";

let query = new URLSearchParams();
vi.mock("../../apps/operator-workspace/node_modules/next/navigation", () => ({
  useSearchParams: () => query,
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => query,
}));

const { useWorkspaceNav } =
  await import("../../apps/operator-workspace/src/lib/nav");

const KADIKOY = "aa000000-0000-4000-8000-00000000000a";
const MODA = "aa000000-0000-4000-8000-00000000000b";

const OPEN_AT = {
  [KADIKOY]: ["today", "reservations", "hr", "integrations"],
  [MODA]: ["today", "reservations"],
};
const REACHABLE = ["today", "reservations", "hr", "integrations", "portfolio"];

function links(search: string): string[] {
  query = new URLSearchParams(search);
  const { result } = renderHook(
    () => useWorkspaceNav("en", REACHABLE, KADIKOY, OPEN_AT),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <NextIntlClientProvider locale="en" messages={messages.en}>
          {children}
        </NextIntlClientProvider>
      ),
    },
  );
  return result.current.flatMap((entry) =>
    "children" in entry && entry.children
      ? entry.children.map((child) => child.href)
      : "href" in entry && entry.href
        ? [entry.href]
        : [],
  );
}

afterEach(() => {
  query = new URLSearchParams();
});

describe("the rail at a Property", () => {
  it("RAIL-01: lists a page where the Property has it, and not where it has not", () => {
    const atKadikoy = links(`property=${KADIKOY}`).join(" ");
    expect(atKadikoy).toContain("/en/hr?");
    expect(atKadikoy).toContain("/en/integrations?");

    const atModa = links(`property=${MODA}`).join(" ");
    expect(atModa).not.toContain("/en/hr");
    expect(atModa).not.toContain("/en/integrations");
    expect(atModa).toContain("/en/reservations?");
  });

  it("RAIL-02: offers All Properties from anywhere the viewer is entitled to it", () => {
    expect(links(`property=${MODA}`).join(" ")).toContain("/en/portfolio?");
  });

  it("RAIL-03: carries the Property the URL names", () => {
    expect(links(`property=${MODA}`)).toContain(
      `/en/reservations?property=${MODA}`,
    );
  });

  it("RAIL-04: does not carry a Property that is not one the viewer reaches", () => {
    const stale = "00000000-0000-4000-8000-00000000dead";
    const hrefs = links(`property=${stale}`);
    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.filter((href) => href.includes(stale))).toEqual([]);
    expect(hrefs).toContain(`/en/reservations?property=${KADIKOY}`);
  });
});
