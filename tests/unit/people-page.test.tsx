/**
 * Whose roster the People page reads (OA-S3-07, OA-S1-19).
 *
 * Staff administration is about an Organization, and the page finds it from the
 * Property being worked in. It once took the viewer's first Property whatever
 * the URL said, so a Staff Member of two Organizations who switched to the
 * other's Property kept seeing — and inviting into — the first one's roster
 * under a switcher naming the second. The rendered page is not asked about
 * here, only which Organization it read.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import { gateOf } from "../../apps/operator-workspace/src/lib/screens";
import { messages } from "../../apps/operator-workspace/src/messages";

const ORG_A = "9e000002-0000-4000-8000-00000000000a";
const ORG_B = "9e000002-0000-4000-8000-00000000000b";
const PROPERTY_A = "9e000003-0000-4000-8000-00000000000a";
const PROPERTY_B = "9e000003-0000-4000-8000-00000000000b";

// Whether the HR screen opens at the Property, which its own gate decides.
let hrOpen = true;
// What the viewer holds at their Property; the HR pointer once asked only this.
let held = new Set(["hr.view"]);
const readRoster = vi.fn(async (_organizationId: string) => []);
const readRoles = vi.fn(async (_organizationId: string) => []);

vi.mock("../../apps/operator-workspace/node_modules/server-only", () => ({}));
vi.mock("../../apps/operator-workspace/node_modules/next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () =>
    createTranslator({ locale: "en", messages: messages.en as never }),
  setRequestLocale: vi.fn(),
}));
vi.mock("../../apps/operator-workspace/src/server/viewer", () => ({
  requireViewer: async () => ({
    userId: "9e000001-0000-4000-8000-000000000001",
  }),
  screenProperties: async (gate: unknown) =>
    gate === gateOf("hr") && !hrOpen
      ? []
      : [
          {
            propertyId: PROPERTY_A,
            propertyName: "Ada Kadıköy",
            timezone: "Europe/Istanbul",
            organizationId: ORG_A,
            organizationName: "Ada Otelleri",
          },
          {
            propertyId: PROPERTY_B,
            propertyName: "Deniz Moda",
            timezone: "Europe/Istanbul",
            organizationId: ORG_B,
            organizationName: "Deniz Otelleri",
          },
        ],
  // The viewer holds hr.view everywhere, which is all the pointer once asked.
  permittedProperties: async (permission: string) =>
    held.has(permission)
      ? [{ propertyId: PROPERTY_A, organizationId: ORG_A }]
      : [],
  employmentOfLogins: async () => ({}),
  whyDenied: async () => ({ reason: "not_reachable" as const }),
}));
vi.mock("../../apps/operator-workspace/src/server/staff", () => ({
  readRoster: (organizationId: string) => readRoster(organizationId),
  readRoles: (organizationId: string) => readRoles(organizationId),
}));

const { default: PeoplePage } =
  await import("../../apps/operator-workspace/src/app/[locale]/(workspace)/people/page");

const open = (search: { property?: string }) =>
  PeoplePage({
    params: Promise.resolve({ locale: "en" }),
    searchParams: Promise.resolve(search),
  });

afterEach(() => {
  cleanup();
  hrOpen = true;
  held = new Set(["hr.view"]);
  readRoster.mockClear();
  readRoles.mockClear();
});

describe("the People page", () => {
  it("reads the roster of the Organization whose Property the URL names", async () => {
    await open({ property: PROPERTY_B });
    expect(readRoster).toHaveBeenCalledWith(ORG_B);
    expect(readRoles).toHaveBeenCalledWith(ORG_B);
    expect(readRoster).not.toHaveBeenCalledWith(ORG_A);
  });

  it("names the first Property in the URL when it names none, and reads nothing yet", async () => {
    // Next's own redirect: it throws, and its digest carries where to.
    await expect(open({})).rejects.toMatchObject({
      digest: expect.stringContaining(`/en/people?property=${PROPERTY_A}`),
    });
    expect(readRoster).not.toHaveBeenCalled();
  });

  it("reads no roster for a Property it does not list", async () => {
    await open({ property: "9e000003-0000-4000-8000-0000000000ff" });
    expect(readRoster).not.toHaveBeenCalled();
  });
});

describe("the pointer to Human Resources (audit 2026-11-07, D-05)", () => {
  async function show() {
    const page = await open({ property: PROPERTY_A });
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        {page}
      </NextIntlClientProvider>,
    );
  }

  it("leads to HR at this Property where HR opens", async () => {
    await show();

    expect(
      screen.getByRole("link", { name: messages.en.staff.hrPointerLink }),
    ).toHaveAttribute("href", `/en/hr?property=${PROPERTY_A}`);
  });

  it("is not shown where the HR screen is closed, though the viewer holds hr.view", async () => {
    hrOpen = false;
    await show();

    expect(
      screen.queryByRole("link", { name: messages.en.staff.hrPointerLink }),
    ).toBeNull();
  });
});

describe("a viewer who may administer and has no role to invite into (C-13)", () => {
  async function show() {
    const page = await open({ property: PROPERTY_A });
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        {page}
      </NextIntlClientProvider>,
    );
  }

  it("C-13: says why there is no Invite button", async () => {
    held = new Set(["staff.administer"]);
    await show();
    expect(screen.getByText(messages.en.staff.cannotInvite)).toBeVisible();
    expect(screen.queryByText(messages.en.staff.readOnly)).toBeNull();
  });

  it("C-13: says the page is read-only, not this, to somebody who may not administer", async () => {
    await show();
    expect(screen.queryByText(messages.en.staff.cannotInvite)).toBeNull();
    expect(screen.getByText(messages.en.staff.readOnly)).toBeVisible();
  });
});
