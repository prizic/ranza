/**
 * A page opened without ?property= names one Property — in the page, the
 * switcher and the rail alike (OA-S3-02, HK-S1-24, OA-S3-05).
 *
 * A page resolves the remembered Property against its own capability's list;
 * the shell resolves its default against Today's. They can differ, and when
 * both answered a bare URL on their own, a page showed one Property under a
 * switcher and a rail naming another. So the page writes its answer into the
 * URL, and the shell reads the URL.
 *
 * Each scenario opens the bare URL as the page does — following its redirect
 * when there is one — then renders the switcher and the rail on the URL it
 * ends at, with the default the layout computes, and asks all three.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EntitledProperty } from "../../packages/ranza/core/src";
import { messages } from "../../apps/operator-workspace/src/messages";

// Shared with the hoisted mocks below, so it is hoisted with them.
const state = vi.hoisted(() => ({
  query: new URLSearchParams(),
  remembered: undefined as string | undefined,
}));

vi.mock("../../apps/operator-workspace/node_modules/next/navigation", () => ({
  useSearchParams: () => state.query,
  usePathname: () => "/tr/housekeeping",
  redirect: (to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), {
      digest: `NEXT_REDIRECT;replace;${to};307;`,
    });
  },
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => state.query,
  usePathname: () => "/tr/housekeeping",
}));
vi.mock("../../apps/operator-workspace/node_modules/server-only", () => ({}));
vi.mock("../../apps/operator-workspace/node_modules/next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "ranza_property" && state.remembered !== undefined
        ? { name, value: state.remembered }
        : undefined,
  }),
}));

const { frontDeskProperty } =
  await import("../../apps/operator-workspace/src/server/front-desk");
const { switchableProperties, workingProperty } =
  await import("../../apps/operator-workspace/src/lib/property-choice");
const { PropertySwitcher } =
  await import("../../apps/operator-workspace/src/app/[locale]/(workspace)/property-switcher");
const { WorkspaceRail } =
  await import("../../apps/operator-workspace/src/app/[locale]/(workspace)/workspace-rail");

function property(
  propertyId: string,
  propertyName: string,
  organizationName: string,
): EntitledProperty {
  return {
    propertyId,
    propertyName,
    timezone: "Europe/Istanbul",
    organizationId: `org-${organizationName}`,
    organizationName,
  };
}

const A = property(
  "aa000000-0000-4000-8000-00000000000a",
  "Kadıköy",
  "Deniz Otelleri",
);
const B = property(
  "aa000000-0000-4000-8000-00000000000b",
  "Moda",
  "Ada Otelleri",
);

/**
 * Opens /tr/housekeeping with no ?property= and the given device memory, and
 * reports what the page, the switcher and the rail each name.
 */
async function openBare({
  today,
  housekeeping,
  cookie,
}: {
  today: readonly EntitledProperty[];
  housekeeping: readonly EntitledProperty[];
  cookie: string;
}) {
  state.remembered = cookie;
  let search: Record<string, string> = {};
  let shown: EntitledProperty | undefined;
  try {
    shown = await frontDeskProperty(housekeeping, search, "/tr/housekeeping");
  } catch (error) {
    const to = (error as { digest?: string }).digest?.split(";")[2];
    if (!to) throw error;
    search = Object.fromEntries(new URL(to, "http://x").searchParams);
    shown = await frontDeskProperty(housekeeping, search, "/tr/housekeeping");
  }
  state.query = new URLSearchParams(search);

  // What the layout computes, from the same lists.
  const switchable = switchableProperties([
    { segment: "today", properties: today },
    { segment: "housekeeping", properties: housekeeping },
  ]);
  const first = workingProperty(today, switchable, cookie)!;

  render(
    <NextIntlClientProvider locale="tr" messages={messages.tr}>
      <PropertySwitcher
        chooseLabel="Tesis seçin"
        defaultId={first.propertyId}
        label="Tesisler"
        locale="tr"
        slots={switchable.map((slot) => ({
          id: slot.propertyId,
          name: slot.propertyName,
          organization: slot.organizationName,
          segments: slot.segments,
        }))}
      />
      <WorkspaceRail
        brand={<span>R</span>}
        defaultProperty={first.propertyId}
        entitled={["today", "housekeeping"]}
        labels={{
          collapse: "Daralt",
          expand: "Genişlet",
          home: "Ranza",
          mainNavigation: "Ana gezinme",
          badge: "Çalışma alanı",
        }}
        locale="tr"
        organization={first.organizationName}
        organizations={Object.fromEntries(
          switchable.map((slot) => [slot.propertyId, slot.organizationName]),
        )}
        root="/tr/today"
      />
    </NextIntlClientProvider>,
  );

  const railLinks = screen
    .getAllByRole("link")
    .map((link) => link.getAttribute("href") ?? "")
    .filter((href) => href.includes("?property="))
    .map((href) => new URL(href, "http://x").searchParams.get("property"));

  return {
    page: shown,
    switcher: screen.getByRole("button", { name: "Tesisler" }).textContent,
    railLinks: [...new Set(railLinks)],
  };
}

afterEach(() => {
  cleanup();
  state.remembered = undefined;
});

describe("a bare URL names one Property", () => {
  it("when the remembered Property has the page but not Today (scenario A)", async () => {
    const seen = await openBare({
      today: [A],
      housekeeping: [A, B],
      cookie: B.propertyId,
    });

    expect(seen.page).toBe(B);
    expect(seen.switcher).toContain(B.propertyName);
    expect(seen.railLinks).toEqual([B.propertyId]);
    expect(screen.getByText(B.organizationName)).toBeInTheDocument();
  });

  it("when the remembered Property has Today but not the page (scenario B)", async () => {
    const seen = await openBare({
      today: [A, B],
      housekeeping: [A],
      cookie: B.propertyId,
    });

    expect(seen.page).toBe(A);
    expect(seen.switcher).toContain(A.propertyName);
    expect(seen.railLinks).toEqual([A.propertyId]);
    expect(screen.getByText(A.organizationName)).toBeInTheDocument();
  });
});
