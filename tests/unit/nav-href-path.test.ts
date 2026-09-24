/**
 * A rail link is still the page it points at, whatever it carries.
 *
 * Workspace links carry `?property=`, and the rail, the section tabs and the
 * group that opens itself all ask "is this the current page" by comparing a
 * link with the pathname. Broken, nothing fails to navigate — the current page
 * simply stops being marked, which no other test would notice.
 */
import { describe, expect, it } from "vitest";
import {
  hrefPath,
  navGroupFor,
  type NavEntry,
  type NavLeaf,
} from "../../packages/ui/src/components/nav";

// Never rendered here: only the hrefs are asked about.
const icon = (() => null) as unknown as NavLeaf["icon"];

describe("hrefPath", () => {
  it("drops the query a link carries", () => {
    expect(hrefPath("/en/arrivals?property=p1")).toBe("/en/arrivals");
  });

  it("leaves a bare path alone", () => {
    expect(hrefPath("/en/arrivals")).toBe("/en/arrivals");
  });
});

describe("navGroupFor", () => {
  const entries: NavEntry[] = [
    { href: "/en/today?property=p1", icon, label: "Today" },
    {
      icon,
      label: "Front Office",
      children: [
        { href: "/en/arrivals?property=p1", icon, label: "Arrivals" },
        {
          href: "/en/departures?property=p1",
          icon,
          label: "Departures",
        },
      ],
    },
  ];

  it("finds the group of a page whose links carry the Property", () => {
    expect(navGroupFor("/en/departures", entries)?.label).toBe("Front Office");
  });
});
