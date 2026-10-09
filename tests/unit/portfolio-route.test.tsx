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
import { aPortfolio, aProperty } from "./portfolio-fixtures";

const viewer = vi.hoisted(() => {
  class PortfolioTooLargeError extends Error {
    readonly ceiling = 200;
    constructor(readonly propertyCount: number) {
      super("too large");
    }
  }
  return {
    entitledProperties: vi.fn(),
    portfolio: vi.fn(),
    requireViewer: vi.fn(),
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

const open = (property?: string) =>
  PortfolioPage({
    params: Promise.resolve({ locale: "en" }),
    searchParams: Promise.resolve(property ? { property } : {}),
  }) as Promise<ReactElement<Record<string, unknown>>>;

beforeEach(() => {
  viewer.entitledProperties.mockReset();
  viewer.portfolio.mockReset();
  viewer.requireViewer.mockReset();
  state.remembered = undefined;
  viewer.entitledProperties.mockResolvedValue([KADIKOY, MODA]);
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
    const page = await open("aa000000-0000-4000-8000-0000000000ff");
    expect(viewer.portfolio).not.toHaveBeenCalled();
    expect(page.props.title).toBe("notEntitledTitle");
  });

  it("no_property_with_analytics_reads_no_portfolio", async () => {
    viewer.entitledProperties.mockResolvedValue([]);
    state.remembered = KADIKOY.propertyId;
    const page = await open(KADIKOY.propertyId);
    expect(viewer.portfolio).not.toHaveBeenCalled();
    expect(page.props.title).toBe("notEntitledTitle");
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
    const page = await open(KADIKOY.propertyId);
    expect(page.props.title).toBe("notEntitledTitle");
  });

  it("the_figures_are_stamped_in_the_working_propertys_own_zone", async () => {
    viewer.portfolio.mockResolvedValue(aPortfolio([aProperty(), aProperty()]));
    const page = await open(KADIKOY.propertyId);
    // 09:30Z is 12:30 in Istanbul.
    expect(page.props.asOf).toBe('portfolio.asOf {"time":"12:30"}');
  });
});
