/**
 * A brand that cannot be read does not take the Portal down (RANZ-47, BR-S1-37).
 *
 * The colour of an Organization is decoration; the Stay is what the Portal is
 * for. A failed read of the first used to be the failure of both: the layout
 * threw and the Guest saw an error page where their room should be. The real
 * funnel runs here, with its connection mocked to fail.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "../../apps/guest-portal/src/messages";

const stayBrands = vi.fn();
const listOwnStays = vi.fn();

vi.mock("../../apps/guest-portal/node_modules/server-only", () => ({}));
vi.mock("../../apps/guest-portal/node_modules/next/headers", () => ({
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
  usePathname: () => "/en/stay",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () =>
    createTranslator({ locale: "en", messages: messages.en as never }),
  setRequestLocale: vi.fn(),
}));
vi.mock("../../apps/guest-portal/src/server/composition", () => ({
  getComposition: () => ({
    auth: {
      api: {
        getSession: async () => ({
          user: { id: "subject", email: "resident@example.test" },
        }),
      },
    },
    linkRanzaUser: async () => "d9200001-0000-4000-8000-000000000001",
    stays: { listOwnStays },
    branding: { stayBrands },
  }),
}));

const STAY = {
  stayId: "d9200002-0000-4000-8000-000000000001",
  stayType: "resident",
  status: "in_house",
  startsOn: "2026-09-01",
  endsOn: null,
  propertyId: "d9200003-0000-4000-8000-000000000001",
  propertyName: "Residence Hall",
  timezone: "Europe/Istanbul",
  unitId: "d9200004-0000-4000-8000-000000000001",
  unitName: "Room 101",
  unitType: "room",
  unitCapacity: 2,
};

const { default: PortalLayout } =
  await import("../../apps/guest-portal/src/app/[locale]/(portal)/layout");
const { default: StayPage } =
  await import("../../apps/guest-portal/src/app/[locale]/(portal)/stay/page");

let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  stayBrands.mockReset();
  listOwnStays.mockReset().mockResolvedValue([STAY]);
  logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  logged.mockRestore();
});

const params = Promise.resolve({ locale: "en" });

describe("a Portal whose brand cannot be read", () => {
  it("BR-S1-37: draws the default theme and reports the failure, in the layout", async () => {
    const outage = new Error("connection refused");
    stayBrands.mockRejectedValue(outage);

    const shell = await PortalLayout({ children: null, params });

    expect(shell.props.style).toBeUndefined();
    expect(logged).toHaveBeenCalledWith(
      "branding.read_failed",
      { userId: "d9200001-0000-4000-8000-000000000001" },
      outage,
    );
  });

  it("BR-S1-37: still shows the Stay on the Stay page", async () => {
    stayBrands.mockRejectedValue(new Error("connection refused"));

    const page = await StayPage({ params });
    const markup = renderToStaticMarkup(page);

    expect(markup).toContain("Residence Hall");
    expect(markup).toContain("Room 101");
    // No Organization's colour is claimed for it: the theme's own tokens.
    expect(markup).toContain("--primary:var(--accent)");
  });

  it("BR-S1-37: and draws the brand when it can be read", async () => {
    stayBrands.mockResolvedValue([
      {
        stayId: STAY.stayId,
        primaryColor: "#e67e22",
        primaryForeground: "#000000",
        primaryText: "#a35200",
        logo: null,
      },
    ]);

    const shell = await PortalLayout({ children: null, params });

    expect(shell.props.style).toMatchObject({
      "--primary": "#e67e22",
      "--primary-foreground": "#000000",
      "--primary-text": "#a35200",
    });
    expect(logged).not.toHaveBeenCalled();
  });
});
