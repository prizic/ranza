/**
 * The Integrations page reads `?endpoint=` to narrow the failures to one
 * endpoint (INT-S1-82). It must pass an id on and nothing else: the value
 * reaches SQL as a `::uuid`, where a malformed one is a database error rather
 * than an empty list.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const propertyIntegrations = vi.fn();
const seen: { props: Record<string, unknown> | null } = { props: null };

vi.mock("../../apps/operator-workspace/node_modules/server-only", () => ({}));
vi.mock("../../apps/operator-workspace/node_modules/next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
const { navigation } = vi.hoisted(() => ({
  navigation: () => ({
    notFound: () => {
      throw new Error("notFound");
    },
    redirect: (to: string) => {
      throw new Error(`redirect ${to}`);
    },
  }),
}));
vi.mock("next/navigation", navigation);
vi.mock(
  "../../apps/operator-workspace/node_modules/next/navigation",
  navigation,
);
vi.mock("next-intl/server", () => ({ setRequestLocale: vi.fn() }));

const PROPERTY = {
  propertyId: "bb111111-1111-4111-8111-111111111111",
  propertyName: "Kadıköy",
  timezone: "Europe/Istanbul",
  organizationId: "aa111111-1111-4111-8111-111111111111",
  organizationName: "Deniz",
};
vi.mock("../../apps/operator-workspace/src/server/viewer", () => ({
  INTEGRATIONS_PAGE_SIZE: 25,
  permittedProperties: async () => [PROPERTY],
  propertyIntegrations,
  requireViewer: async () => ({ userId: "u-1" }),
  screenProperties: async () => [PROPERTY],
  whyDenied: async () => ({ reason: "not_enabled" }),
}));
vi.mock("../../apps/operator-workspace/src/server/front-desk", () => ({
  frontDeskProperty: async () => PROPERTY,
}));
vi.mock(
  "../../apps/operator-workspace/src/features/integrations/components/integrations-view",
  () => ({
    IntegrationsView: (props: Record<string, unknown>) => {
      seen.props = props;
      return null;
    },
  }),
);

const { default: IntegrationsPage } =
  await import("../../apps/operator-workspace/src/app/[locale]/(workspace)/integrations/page");

const ENDPOINT = "E1111111-1111-4111-8111-111111111111";

async function open(search: Record<string, string>) {
  const element = await IntegrationsPage({
    params: Promise.resolve({ locale: "en" }),
    searchParams: Promise.resolve({ property: PROPERTY.propertyId, ...search }),
  });
  (element as unknown as { type: (props: unknown) => unknown }).type(
    (element as unknown as { props: unknown }).props,
  );
}

beforeEach(() => {
  seen.props = null;
  propertyIntegrations.mockReset().mockResolvedValue({
    endpoints: { endpoints: [], mayManage: false },
    failures: { records: [], total: 0 },
    openTotal: 0,
    viewerId: "u-1",
  });
});

describe("the Integrations page reads which endpoint to narrow to (INT-S1-82)", () => {
  it("INT-S1-82: passes an endpoint id on, in lower case, and builds the narrowed links from it", async () => {
    await open({ endpoint: ENDPOINT });
    const id = ENDPOINT.toLowerCase();
    expect(propertyIntegrations).toHaveBeenCalledWith(
      PROPERTY.organizationId,
      PROPERTY.propertyId,
      "open",
      1,
      id,
    );
    expect(seen.props).toMatchObject({
      endpointId: id,
      hrefs: {
        open: `/en/integrations?property=${PROPERTY.propertyId}&endpoint=${id}`,
        closed: `/en/integrations?property=${PROPERTY.propertyId}&view=closed&endpoint=${id}`,
      },
      hrefsToAll: {
        open: `/en/integrations?property=${PROPERTY.propertyId}`,
        closed: `/en/integrations?property=${PROPERTY.propertyId}&view=closed`,
      },
    });
  });

  it.each(["not-an-id", "", "e1111111-1111-4111-8111-11111111111g"])(
    "INT-S1-82: %j is no narrowing, and never reaches the query",
    async (endpoint) => {
      await open({ endpoint });
      expect(propertyIntegrations).toHaveBeenCalledWith(
        PROPERTY.organizationId,
        PROPERTY.propertyId,
        "open",
        1,
        null,
      );
      expect(seen.props).toMatchObject({ endpointId: null });
    },
  );

  it("INT-S1-82: with no endpoint, the links are the plain ones", async () => {
    await open({});
    expect(seen.props).toMatchObject({
      endpointId: null,
      hrefs: { open: `/en/integrations?property=${PROPERTY.propertyId}` },
    });
  });
});
