/**
 * Which Organization the rail names (OA-S1-19, OA-S3-07).
 *
 * The layout renders once, so the rail reads `?property=` on the client, as
 * the switcher does. A Staff Member of two Organizations working in the
 * second one's Property must see its name, not the first one's.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "../../apps/operator-workspace/src/messages";

let query = new URLSearchParams();
vi.mock("../../apps/operator-workspace/node_modules/next/navigation", () => ({
  useSearchParams: () => query,
  usePathname: () => "/en/housekeeping",
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => query,
  usePathname: () => "/en/housekeeping",
}));

const { WorkspaceRail } =
  await import("../../apps/operator-workspace/src/app/[locale]/(workspace)/workspace-rail");

function show(url: string) {
  query = new URLSearchParams(url);
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <WorkspaceRail
        brand={<span>R</span>}
        defaultProperty="k"
        entitled={["today", "housekeeping"]}
        labels={{
          collapse: "Collapse",
          expand: "Expand",
          home: "Ranza",
          mainNavigation: "Main navigation",
          badge: "Workspace",
        }}
        locale="en"
        organization="Deniz Otelleri"
        organizations={{ k: "Deniz Otelleri", m: "Ada Otelleri" }}
        root="/en/today"
      />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe("the rail's Organization", () => {
  it("is the one whose Property the URL names", () => {
    show("property=m");
    expect(screen.getByText("Ada Otelleri")).toBeInTheDocument();
    expect(screen.queryByText("Deniz Otelleri")).not.toBeInTheDocument();
  });

  it("is the working Property's when the URL names none", () => {
    show("");
    expect(screen.getByText("Deniz Otelleri")).toBeInTheDocument();
  });
});
