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
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTranslator } from "next-intl";
import { messages } from "../../apps/operator-workspace/src/messages";

const ORG_A = "9e000002-0000-4000-8000-00000000000a";
const ORG_B = "9e000002-0000-4000-8000-00000000000b";
const PROPERTY_A = "9e000003-0000-4000-8000-00000000000a";
const PROPERTY_B = "9e000003-0000-4000-8000-00000000000b";

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
  entitledProperties: async () => [
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
  permittedProperties: async () => [],
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
