/**
 * The All Properties route (docs/features/portfolio, slice 2): which
 * Organization it reads, what it does with a Property the viewer does not
 * reach, and how it answers a refusal.
 *
 * The viewer's reads are mocked — they are proved against a database in the
 * integration suite — but the Property choice is the real one
 * (`frontDeskProperty`), because the route is only as honest as that.
 */
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EntitledProperty } from "../../packages/ranza/core/src";
import { gateOf } from "../../apps/operator-workspace/src/lib/screens";
import { aPortfolio, aProperty } from "./portfolio-fixtures";

const viewer = vi.hoisted(() => {
  class PortfolioTooLargeError extends Error {
    readonly ceiling = 200;
    constructor(readonly propertyCount: number) {
      super("too large");
    }
  }
  return {
    screenProperties: vi.fn(),
    portfolio: vi.fn(),
    requireViewer: vi.fn(),
    whyDenied: vi.fn(),
    PortfolioTooLargeError,
  };
});
const state = vi.hoisted(() => ({
  remembered: undefined as string | undefined,
}));

vi.mock("../../apps/operator-workspace/src/server/viewer", () => viewer);
vi.mock("../../apps/operator-workspace/node_modules/server-only", () => ({}));
vi.mock("../../apps/operator-workspace/node_modules/next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "ranza_property" && state.remembered !== undefined
        ? { name, value: state.remembered }
        : undefined,
  }),
}));
vi.mock("../../apps/operator-workspace/node_modules/next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), {
      digest: `NEXT_REDIRECT;replace;${to};307;`,
    });
  },
}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getTranslations:
    async () => (key: string, values?: Record<string, unknown>) =>
      values ? `${key} ${JSON.stringify(values)}` : key,
}));

const { default: PortfolioPage } =
  await import("../../apps/operator-workspace/src/app/[locale]/(workspace)/portfolio/page");
const { PortfolioView } =
  await import("../../apps/operator-workspace/src/features/portfolio");
const { ScreenDenied } =
  await import("../../apps/operator-workspace/src/app/[locale]/(workspace)/screen-denied");

function entitled(
  propertyId: string,
  organizationId: string,
): EntitledProperty {
  return {
    propertyId,
    propertyName: `Name of ${propertyId}`,
    timezone: "Europe/Istanbul",
    organizationId,
    organizationName: `Organization ${organizationId}`,
  };
}

const KADIKOY = entitled("aa000000-0000-4000-8000-00000000000a", "org-1");
const MODA = entitled("aa000000-0000-4000-8000-00000000000b", "org-2");

const open = (property?: string, more: { sort?: string; view?: string } = {}) =>
  PortfolioPage({
    params: Promise.resolve({ locale: "en" }),
    searchParams: Promise.resolve(property ? { property, ...more } : more),
  }) as Promise<ReactElement<Record<string, unknown>>>;

beforeEach(() => {
  viewer.screenProperties.mockReset();
  viewer.portfolio.mockReset();
  viewer.requireViewer.mockReset();
  viewer.whyDenied.mockReset();
  viewer.whyDenied.mockResolvedValue({ reason: "not_reachable" });
  state.remembered = undefined;
  viewer.screenProperties.mockResolvedValue([KADIKOY, MODA]);
});

describe("all_properties_route", () => {
  it("the_page_reads_the_organization_of_the_working_property", async () => {
    viewer.portfolio.mockResolvedValue(aPortfolio([aProperty(), aProperty()]));
    const page = await open(MODA.propertyId);
    expect(viewer.portfolio).toHaveBeenCalledWith("org-2");
    expect(page.type).toBe(PortfolioView);
    expect(page.props.organizationName).toBe("Organization org-2");
  });

  it("a_bare_url_names_the_property_it_reads_for_in_the_url", async () => {
    state.remembered = MODA.propertyId;
    viewer.portfolio.mockResolvedValue(aPortfolio([aProperty(), aProperty()]));
    await expect(open()).rejects.toMatchObject({
      digest: `NEXT_REDIRECT;replace;/en/portfolio?property=${MODA.propertyId};307;`,
    });
    // Nothing is read until the URL says which Organization it is for.
    expect(viewer.portfolio).not.toHaveBeenCalled();
  });

  it("a_property_the_viewer_does_not_reach_reads_no_portfolio", async () => {
    const stale = "aa000000-0000-4000-8000-0000000000ff";
    const page = await open(stale);
    expect(viewer.portfolio).not.toHaveBeenCalled();
    // Told why, with what the URL named: a stale link is not "not in your
    // Subscription" (PORTFOLIO-03).
    expect(page.type).toBe(ScreenDenied);
    expect(viewer.whyDenied).toHaveBeenCalledWith(gateOf("analytics"), stale);
    expect(page.props.denial).toEqual({ reason: "not_reachable" });
  });

  it("no_property_with_analytics_reads_no_portfolio", async () => {
    viewer.screenProperties.mockResolvedValue([]);
    state.remembered = KADIKOY.propertyId;
    viewer.whyDenied.mockResolvedValue({ reason: "not_enabled" });
    const page = await open(KADIKOY.propertyId);
    expect(viewer.portfolio).not.toHaveBeenCalled();
    expect(page.type).toBe(ScreenDenied);
    expect(page.props.denial).toEqual({ reason: "not_enabled" });
  });

  it("more_than_the_ceiling_is_a_message_with_the_count_and_not_a_shorter_list", async () => {
    viewer.portfolio.mockRejectedValue(new viewer.PortfolioTooLargeError(201));
    const page = await open(KADIKOY.propertyId);
    expect(page.props.title).toBe("portfolio.tooLargeTitle");
    expect(page.props.description).toBe(
      'portfolio.tooLargeDescription {"count":201,"max":200}',
    );
  });

  it("any_other_failure_is_rethrown_to_the_error_boundary", async () => {
    const failure = new Error("connection reset");
    viewer.portfolio.mockRejectedValue(failure);
    await expect(open(KADIKOY.propertyId)).rejects.toBe(failure);
  });

  it("a_session_that_ended_since_the_check_reads_as_not_available", async () => {
    viewer.portfolio.mockResolvedValue(null);
    viewer.whyDenied.mockResolvedValue({ reason: "not_subscribed" });
    const page = await open(KADIKOY.propertyId);
    expect(page.type).toBe(ScreenDenied);
    expect(page.props.denial).toEqual({ reason: "not_subscribed" });
  });

  it("the_figures_are_stamped_in_the_working_propertys_own_zone", async () => {
    viewer.portfolio.mockResolvedValue(aPortfolio([aProperty(), aProperty()]));
    const page = await open(KADIKOY.propertyId);
    // 09:30Z is 12:30 in Istanbul, and the day and the zone are said with it:
    // a tab left open overnight must not show yesterday at a plausible hour
    // (PORTFOLIO-05).
    expect(page.props.asOf).toMatch(
      /^portfolio\.asOf \{"when":"Sep 16, 2026, 12:30 · [^"]+"\}$/,
    );
  });

  it("passes the order and the shape asked for, and falls back to name and cards", async () => {
    viewer.portfolio.mockResolvedValue(aPortfolio([aProperty(), aProperty()]));
    const asked = await open(KADIKOY.propertyId, {
      sort: "occupancy",
      view: "table",
    });
    expect(asked.props).toMatchObject({ sort: "occupancy", view: "table" });
    const nonsense = await open(KADIKOY.propertyId, {
      sort: "colour",
      view: "wall",
    });
    expect(nonsense.props).toMatchObject({ sort: "name", view: "cards" });
  });
});
