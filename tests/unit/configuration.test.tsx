/**
 * The Configuration screen as a person sees it (ADR 0036, CF-S3-*).
 *
 * The policies decide who may change what, and the integration suite proves
 * the commands against a real database. What only the interface can keep: a
 * reader sees every value and is told who can change it, a save is offered
 * only for a change, a refusal keeps what was typed, the business date a
 * change would make is shown before saving, and the page reads in every
 * locale.
 *
 * The page itself is rendered, with the funnel and the server actions mocked,
 * as tests/unit/audit-log-page.test.tsx does.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { PropertySettings } from "../../packages/ranza/core/src";
import type { InspectionSettings } from "../../packages/ranza/housekeeping/src";
import type { MaintenanceSettings } from "../../packages/ranza/maintenance/src";
import type { PriceList } from "../../packages/ranza/rates/src";
import {
  isolate,
  supportedLocales,
  type SupportedLocale,
} from "../../packages/i18n/src";
import { messages } from "../../apps/operator-workspace/src/messages";
import { screenFor } from "../../apps/operator-workspace/src/lib/screens";

const settingsFor = vi.fn<() => Promise<PropertySettings | null>>();
const inspectionFor = vi.fn<() => Promise<InspectionSettings | null>>();
const maintenanceFor = vi.fn<() => Promise<MaintenanceSettings | null>>();
const pricesFor = vi.fn<() => Promise<PriceList | null>>();
const savePrices = vi.fn();
const saveProperty = vi.fn();
const renameOrganization = vi.fn();
const previewBusinessDate = vi.fn();
let locale: SupportedLocale = "en";
let maintenanceShown: MaintenanceSettings | null = null;
let pricesShown: PriceList | null = null;

vi.mock("../../apps/operator-workspace/node_modules/server-only", () => ({}));
// Nothing remembered on this device (OA-S3-05): the page resolves its
// Property from the URL and its own list, as it did before there was a cookie.
vi.mock("../../apps/operator-workspace/node_modules/next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
  usePathname: () => "/en/configuration",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () =>
    createTranslator({ locale, messages: messages[locale] as never }),
  setRequestLocale: vi.fn(),
}));

const PROPERTY = "cf000003-0000-4000-8000-000000000001";
const ORGANIZATION = "cf000002-0000-4000-8000-000000000001";

vi.mock("../../apps/operator-workspace/src/server/viewer", () => ({
  CONFIGURATION_CAPABILITY: {
    moduleKey: "platform_core",
    capabilityKey: "configuration",
  },
  requireViewer: async () => ({
    userId: "cf000001-0000-4000-8000-000000000001",
  }),
  entitledProperties: async () => [
    {
      propertyId: PROPERTY,
      propertyName: "Deniz Otel Kadıköy",
      timezone: "Europe/Istanbul",
      organizationId: ORGANIZATION,
      organizationName: "Deniz Otelleri",
    },
  ],
  // Every destination is on, so the Rooms and People links are offered.
  entitledPropertiesByCapability: async (
    capabilities: { moduleKey: string; capabilityKey: string }[],
  ) =>
    capabilities.map((capability) => ({
      capability,
      properties: [{ propertyId: PROPERTY }],
    })),
  propertySettings: () => settingsFor(),
  housekeepingInspection: () => inspectionFor(),
  maintenanceSettings: () => maintenanceFor(),
  priceList: () => pricesFor(),
  timezoneNames: async () => ["Europe/Istanbul", "Pacific/Kiritimati", "UTC"],
}));
vi.mock("../../apps/operator-workspace/src/server/configuration", () => ({
  saveProperty,
  renameOrganization,
  previewBusinessDate,
}));
vi.mock("../../apps/operator-workspace/src/server/housekeeping", () => ({
  setInspection: vi.fn(),
}));
vi.mock("../../apps/operator-workspace/src/server/maintenance", () => ({
  saveMaintenanceSettings: vi.fn(),
}));
vi.mock("../../apps/operator-workspace/src/server/rates", () => ({
  savePrices,
}));

const { default: ConfigurationPage } =
  await import("../../apps/operator-workspace/src/app/[locale]/(workspace)/configuration/page");

const MANAGER: PropertySettings = {
  propertyId: PROPERTY,
  name: "Deniz Otel Kadıköy",
  timezone: "Europe/Istanbul",
  currency: "TRY",
  businessDateCutoff: "04:00",
  version: "2026-09-25T13:00:00.000000Z",
  businessDate: "2026-09-25",
  currencyFixed: false,
  mayConfigure: true,
  organization: {
    organizationId: ORGANIZATION,
    name: "Deniz Otelleri",
    version: "2026-09-25T13:00:00.000000Z",
    mayRename: true,
  },
};

const INSPECTION: InspectionSettings = {
  organizationDefault: false,
  propertyOverride: null,
  effective: false,
  mayConfigure: true,
  mayConfigureDefault: true,
};

async function pageFor(
  settings: PropertySettings,
  as: SupportedLocale,
  inspection: InspectionSettings | null,
) {
  locale = as;
  settingsFor.mockResolvedValue(settings);
  inspectionFor.mockResolvedValue(inspection);
  maintenanceFor.mockResolvedValue(maintenanceShown);
  pricesFor.mockResolvedValue(pricesShown);
  const page = await ConfigurationPage({
    params: Promise.resolve({ locale: as }),
    searchParams: Promise.resolve({}),
  });
  return (
    <NextIntlClientProvider locale={as} messages={messages[as]}>
      {page}
    </NextIntlClientProvider>
  );
}

/**
 * Renders the page, and returns how to deliver the page's next read — the
 * refresh a save triggers — to the same tree, so a form keeps its state.
 */
async function show(
  settings: PropertySettings,
  {
    as = "en",
    inspection = null,
  }: { as?: SupportedLocale; inspection?: InspectionSettings | null } = {},
) {
  const { rerender } = render(await pageFor(settings, as, inspection));
  return async (next: PropertySettings) => {
    const tree = await pageFor(next, as, inspection);
    await act(async () => {
      rerender(tree);
    });
  };
}

function card(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`no ${id} section`);
  return element;
}

const scrolled = vi.fn();

beforeAll(() => {
  // jsdom has none of these; the section list, the picker and the popover
  // reach for them.
  class Observer {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("IntersectionObserver", Observer);
  vi.stubGlobal("ResizeObserver", Observer);
  Element.prototype.scrollIntoView = scrolled;
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});

beforeEach(() => {
  saveProperty.mockReset();
  renameOrganization.mockReset();
  previewBusinessDate.mockReset();
  scrolled.mockReset();
  savePrices.mockReset();
  pricesShown = null;
});
afterEach(cleanup);

describe("who may change what", () => {
  it("a_reader_sees_every_setting_read_only", async () => {
    await show({
      ...MANAGER,
      mayConfigure: false,
      organization: { ...MANAGER.organization, mayRename: false },
    });
    expect(screen.getByLabelText("Organization name")).toHaveValue(
      "Deniz Otelleri",
    );
    expect(screen.getByLabelText("Organization name")).toBeDisabled();
    expect(screen.getByLabelText("Property name")).toHaveValue(
      "Deniz Otel Kadıköy",
    );
    expect(screen.getByLabelText("Property name")).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Time zone" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
    // Told who can, once per card, rather than handed controls that fail.
    expect(
      screen.getAllByText(
        "You can see these settings. An Owner or Manager can change them.",
      ),
    ).toHaveLength(3);
  });

  it("the_organization_card_needs_organization_wide_reach", async () => {
    await show({
      ...MANAGER,
      organization: { ...MANAGER.organization, mayRename: false },
    });
    expect(screen.getByLabelText("Organization name")).toBeDisabled();
    expect(
      within(card("organization")).getByText(
        "Only someone who reaches every Property can rename the Organization.",
      ),
    ).toBeVisible();
    expect(screen.getByLabelText("Property name")).toBeEnabled();
  });

  it("shows the currency fixed, with the reason, once a folio or a priced booking exists", async () => {
    await show({ ...MANAGER, currencyFixed: true });
    expect(screen.getByRole("combobox", { name: "Currency" })).toBeDisabled();
    expect(
      screen.getByText(
        /Fixed since a folio was opened or a priced booking was taken here/,
      ),
    ).toBeVisible();
  });
});

describe("what the page holds", () => {
  it("the_inspection_setting_is_the_housekeeping_one", async () => {
    await show(MANAGER, { inspection: INSPECTION });
    expect(
      within(card("housekeeping")).getByRole("heading", {
        name: "Check rooms after cleaning",
      }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Housekeeping" })).toHaveAttribute(
      "href",
      "#housekeeping",
    );
  });

  it("no_housekeeping_section_without_housekeeping", async () => {
    await show(MANAGER);
    expect(document.getElementById("housekeeping")).toBeNull();
    expect(screen.queryByRole("link", { name: "Housekeeping" })).toBeNull();
  });

  it("the_maintenance_setting_is_maintenances_own", async () => {
    maintenanceShown = {
      organizationDefault: {
        assigneeRequired: false,
        returnOnDone: true,
        returnAs: "dirty",
      },
      propertyOverride: {
        assigneeRequired: null,
        returnOnDone: null,
        returnAs: null,
      },
      effective: {
        assigneeRequired: false,
        returnOnDone: true,
        returnAs: "dirty",
      },
      mayConfigure: true,
      mayConfigureDefault: true,
    };
    try {
      await show(MANAGER);
      expect(card("maintenance")).toBeVisible();
      expect(screen.getByRole("link", { name: "Maintenance" })).toHaveAttribute(
        "href",
        "#maintenance",
      );
    } finally {
      maintenanceShown = null;
    }
  });

  it("no maintenance section without maintenance", async () => {
    await show(MANAGER);
    expect(document.getElementById("maintenance")).toBeNull();
  });

  it("links to Rooms for this Property and to People, rather than repeating them", async () => {
    await show(MANAGER);
    const links = within(card("elsewhere")).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      `/en/rooms?property=${PROPERTY}`,
      "/en/people",
    ]);
  });

  it.each(supportedLocales)(
    "configuration_reads_in_every_locale (%s)",
    async (as) => {
      await show(MANAGER, { as, inspection: INSPECTION });
      const translate = createTranslator({
        locale: as,
        messages: messages[as] as never,
      });
      expect(
        screen
          .getAllByRole("heading", { level: 2 })
          .map((heading) => heading.textContent),
      ).toContain(
        translate("configuration.subtitle", {
          property: isolate("Deniz Otel Kadıköy"),
        }),
      );
      for (const section of [
        "organizationTitle",
        "propertyTitle",
        "timeTitle",
      ] as const) {
        expect(
          screen.getByRole("link", {
            name: translate(`configuration.${section}`),
          }),
        ).toBeVisible();
      }
    },
  );
});

describe("saving", () => {
  it("save_is_enabled_only_by_a_change", async () => {
    await show(MANAGER);
    const property = within(card("property"));
    const save = property.getByRole("button", { name: "Save changes" });
    const discard = property.getByRole("button", { name: "Discard" });
    expect(save).toBeDisabled();
    expect(discard).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Property name"), {
      target: { value: "Deniz Otel Moda" },
    });
    expect(save).toBeEnabled();
    // The other card is untouched, so it offers nothing.
    expect(
      within(card("time")).getByRole("button", { name: "Save changes" }),
    ).toBeDisabled();

    fireEvent.click(discard);
    expect(screen.getByLabelText("Property name")).toHaveValue(
      "Deniz Otel Kadıköy",
    );
    expect(save).toBeDisabled();
  });

  it("sends one card's edits with the other card's saved values", async () => {
    saveProperty.mockResolvedValue({ status: "saved", version: "v2" });
    await show(MANAGER);
    fireEvent.change(screen.getByLabelText("Property name"), {
      target: { value: "Deniz Otel Moda" },
    });
    await act(async () => {
      fireEvent.click(
        within(card("property")).getByRole("button", { name: "Save changes" }),
      );
    });
    const form = saveProperty.mock.calls[0]?.[1] as FormData;
    expect(Object.fromEntries(form)).toEqual({
      locale: "en",
      propertyId: PROPERTY,
      version: MANAGER.version,
      name: "Deniz Otel Moda",
      currency: "TRY",
      timezone: "Europe/Istanbul",
      businessDateCutoff: "04:00",
    });
    await waitFor(() =>
      expect(within(card("property")).getByText("Saved")).toBeVisible(),
    );
  });

  it("locks the other card while one is saving, so its draft is not lost to a stale answer", async () => {
    let finish!: (outcome: unknown) => void;
    previewBusinessDate.mockResolvedValue({
      current: "2026-09-25",
      proposed: "2026-09-26",
    });
    saveProperty.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await show(MANAGER);
    fireEvent.change(screen.getByLabelText("Property name"), {
      target: { value: "Deniz Otel Moda" },
    });
    fireEvent.click(screen.getByRole("combobox", { name: "Time zone" }));
    fireEvent.click(await screen.findByText(/Kiritimati · Pacific/));
    const clockSave = within(card("time")).getByRole("button", {
      name: "Save changes",
    });
    expect(clockSave).toBeEnabled();

    await act(async () => {
      fireEvent.click(
        within(card("property")).getByRole("button", { name: "Save changes" }),
      );
    });
    expect(clockSave).toBeDisabled();

    await act(async () => {
      finish({ status: "saved", version: "v2" });
    });
    await waitFor(() => expect(clockSave).toBeEnabled());
    expect(
      screen.getByRole("combobox", { name: "Time zone" }),
    ).toHaveTextContent("Kiritimati");
  });

  it("a second card saved after the first names the version the first returned, and keeps its values", async () => {
    const V2 = "2026-09-25T13:00:05.000000Z";
    previewBusinessDate.mockResolvedValue({
      current: "2026-09-25",
      proposed: "2026-09-26",
    });
    saveProperty.mockResolvedValueOnce({ status: "saved", version: V2 });
    saveProperty.mockResolvedValueOnce({
      status: "saved",
      version: "2026-09-25T13:00:09.000000Z",
    });
    await show(MANAGER);

    fireEvent.change(screen.getByLabelText("Property name"), {
      target: { value: "Deniz Otel Moda" },
    });
    fireEvent.click(screen.getByRole("combobox", { name: "Time zone" }));
    fireEvent.click(await screen.findByText(/Kiritimati · Pacific/));
    await act(async () => {
      fireEvent.click(
        within(card("property")).getByRole("button", { name: "Save changes" }),
      );
    });
    // The page's refresh has not landed: the props still say the old name.
    const clockSave = within(card("time")).getByRole("button", {
      name: "Save changes",
    });
    await waitFor(() => expect(clockSave).toBeEnabled());
    await act(async () => {
      fireEvent.click(clockSave);
    });

    const second = Object.fromEntries(
      saveProperty.mock.calls[1]?.[1] as FormData,
    );
    expect(second).toMatchObject({
      version: V2,
      name: "Deniz Otel Moda",
      timezone: "Pacific/Kiritimati",
    });
  });

  it("after the currency is fixed under a draft, shows and sends the saved currency, and keeps the name", async () => {
    saveProperty.mockResolvedValueOnce({
      status: "currencyFixed",
      field: "currency",
    });
    const refresh = await show(MANAGER);

    fireEvent.change(screen.getByLabelText("Property name"), {
      target: { value: "Deniz Otel Moda" },
    });
    fireEvent.click(screen.getByRole("combobox", { name: "Currency" }));
    fireEvent.click(await screen.findByText("Euro"));
    await act(async () => {
      fireEvent.click(
        within(card("property")).getByRole("button", { name: "Save changes" }),
      );
    });
    await refresh({ ...MANAGER, currencyFixed: true });

    const currency = screen.getByRole("combobox", { name: "Currency" });
    expect(currency).toBeDisabled();
    expect(currency).toHaveTextContent("TRY");
    expect(screen.getByLabelText("Property name")).toHaveValue(
      "Deniz Otel Moda",
    );

    saveProperty.mockResolvedValueOnce({
      status: "saved",
      version: "2026-09-25T13:00:05.000000Z",
    });
    await act(async () => {
      fireEvent.click(
        within(card("property")).getByRole("button", { name: "Save changes" }),
      );
    });
    expect(
      Object.fromEntries(saveProperty.mock.calls[1]?.[1] as FormData),
    ).toMatchObject({ name: "Deniz Otel Moda", currency: "TRY" });
  });

  it("a_change_that_reopens_a_closed_day_is_refused_as_such (on screen)", async () => {
    previewBusinessDate.mockResolvedValue({
      current: "2026-09-25",
      proposed: "2026-09-26",
    });
    saveProperty.mockResolvedValue({
      status: "closedDay",
      field: "businessDateCutoff",
    });
    await show(MANAGER);
    fireEvent.click(screen.getByRole("combobox", { name: "Time zone" }));
    fireEvent.click(await screen.findByText(/Kiritimati · Pacific/));
    // The picker hands focus back to its trigger as it closes; a person then
    // moves on to Save, and so does the test, rather than in the same tick.
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Time zone" })).toHaveFocus(),
    );
    await act(async () => {
      fireEvent.click(
        within(card("time")).getByRole("button", { name: "Save changes" }),
      );
    });
    await waitFor(() =>
      expect(
        within(card("time")).getByText(/already been closed/),
      ).toBeVisible(),
    );
    // The choice is kept.
    expect(
      screen.getByRole("combobox", { name: "Time zone" }),
    ).toHaveTextContent("Kiritimati");
    // Only the time zone changed, so that is where focus goes.
    expect(screen.getByRole("combobox", { name: "Time zone" })).toHaveFocus();
  });

  it("a closed day after a cutoff change focuses the cutoff", async () => {
    previewBusinessDate.mockResolvedValue({
      current: "2026-09-25",
      proposed: "2026-09-24",
    });
    saveProperty.mockResolvedValue({
      status: "closedDay",
      field: "businessDateCutoff",
    });
    await show(MANAGER);
    const cutoff = screen.getByRole("combobox", {
      name: "Business day ends at",
    });
    fireEvent.click(cutoff);
    fireEvent.click(await screen.findByRole("option", { name: "11:45" }));
    await waitFor(() => expect(cutoff).toHaveFocus());
    cutoff.blur();
    await act(async () => {
      fireEvent.click(
        within(card("time")).getByRole("button", { name: "Save changes" }),
      );
    });
    await waitFor(() =>
      expect(
        within(card("time")).getByText(/already been closed/),
      ).toBeVisible(),
    );
    expect(cutoff).toHaveFocus();
  });

  it("a_refused_save_keeps_the_input", async () => {
    saveProperty.mockResolvedValue({ status: "invalid", field: "name" });
    await show(MANAGER);
    const name = screen.getByLabelText("Property name");
    fireEvent.change(name, { target: { value: "K" } });
    await act(async () => {
      fireEvent.click(
        within(card("property")).getByRole("button", { name: "Save changes" }),
      );
    });
    await waitFor(() =>
      expect(screen.getByText("A name is 2 to 120 characters.")).toBeVisible(),
    );
    expect(name).toHaveValue("K");
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveFocus();
  });

  it("a stale save shows what was saved instead, and says so", async () => {
    saveProperty.mockResolvedValue({ status: "stale" });
    await show(MANAGER);
    fireEvent.change(screen.getByLabelText("Property name"), {
      target: { value: "Mine" },
    });
    await act(async () => {
      fireEvent.click(
        within(card("property")).getByRole("button", { name: "Save changes" }),
      );
    });
    await waitFor(() =>
      expect(
        screen.getByText(/Someone saved these settings a moment ago/),
      ).toBeVisible(),
    );
    // The draft is dropped: the fresh read of the page is what shows.
    expect(screen.getByLabelText("Property name")).toHaveValue(
      "Deniz Otel Kadıköy",
    );
  });

  it("the_form_previews_the_business_date_a_change_makes", async () => {
    previewBusinessDate.mockResolvedValue({
      current: "2026-09-25",
      proposed: "2026-09-26",
    });
    await show(MANAGER);
    const time = within(card("time"));
    expect(time.getByText("Friday, September 25, 2026")).toBeVisible();
    expect(time.queryByText("After saving")).toBeNull();

    fireEvent.click(screen.getByRole("combobox", { name: "Time zone" }));
    fireEvent.click(await screen.findByText(/Kiritimati · Pacific/));

    await waitFor(() =>
      expect(
        time.getByText("Today moves forward to Saturday, September 26, 2026."),
      ).toBeVisible(),
    );
    expect(previewBusinessDate).toHaveBeenCalledWith(
      PROPERTY,
      "Pacific/Kiritimati",
      "04:00",
    );
  });

  it("compares the proposed date with the business date the server says now", async () => {
    // The page was read on the 25th and left open past the cutoff: the server
    // says it is the 26th now, and the proposed date is the 26th too.
    previewBusinessDate.mockResolvedValue({
      current: "2026-09-26",
      proposed: "2026-09-26",
    });
    await show(MANAGER);
    fireEvent.click(screen.getByRole("combobox", { name: "Time zone" }));
    fireEvent.click(await screen.findByText(/Kiritimati · Pacific/));
    const time = within(card("time"));
    await waitFor(() => expect(time.getByText("After saving")).toBeVisible());
    expect(time.queryByText(/Today moves/)).toBeNull();
    expect(time.getAllByText("Saturday, September 26, 2026")).toHaveLength(2);
  });

  it("warns in words when the business date would move back", async () => {
    previewBusinessDate.mockResolvedValue({
      current: "2026-09-25",
      proposed: "2026-09-24",
    });
    await show(MANAGER);
    fireEvent.click(screen.getByRole("combobox", { name: "Time zone" }));
    fireEvent.click(await screen.findByText(/Kiritimati · Pacific/));
    await waitFor(() =>
      expect(
        within(card("time")).getByText(
          /Today moves back to Thursday, September 24, 2026/,
        ),
      ).toHaveClass("text-destructive"),
    );
  });
});

describe("finding a section", () => {
  it("the_section_list_jumps_to_each_card", async () => {
    await show(MANAGER);
    const link = screen.getByRole("link", {
      name: "Time and the business day",
    });
    fireEvent.click(link);
    expect(scrolled).toHaveBeenCalled();
    expect(scrolled.mock.contexts[0]).toBe(card("time"));
    expect(link).toHaveAttribute("aria-current", "location");
  });

  it("configuration_is_built_in_the_rail", () => {
    expect(screenFor("configuration")?.built).toBe(true);
  });
});

const PRICES: PriceList = {
  propertyId: PROPERTY,
  currency: "TRY",
  version: "0123456789abcdef0123456789abcdef",
  mayManage: true,
  entries: [
    {
      unitType: "room",
      amountMinor: 150000,
      currency: "TRY",
      stale: false,
      sellableUnits: 12,
    },
    {
      unitType: "bed",
      amountMinor: null,
      currency: null,
      stale: false,
      sellableUnits: 1,
    },
    {
      unitType: "apartment",
      amountMinor: 900000,
      currency: "EUR",
      stale: true,
      sellableUnits: 2,
    },
    {
      unitType: "suite",
      amountMinor: null,
      currency: null,
      stale: false,
      sellableUnits: 0,
    },
  ],
};

describe("nightly rates", () => {
  it("rates_section_lists_every_kind_with_its_price_and_units", async () => {
    pricesShown = PRICES;
    await show(MANAGER);
    const rates = within(card("rates"));
    expect(rates.getByLabelText("Price per night for Room")).toHaveValue(
      "1500",
    );
    expect(rates.getByText("12 Units")).toBeVisible();
    expect(rates.getByText("1 Unit")).toBeVisible();
    expect(rates.getByText("None at this Property yet")).toBeVisible();
    // Unpriced says what that means for a booking (RT-S1-13) — where the
    // Property has Units of that kind, and not for a kind it has none of.
    expect(rates.getByLabelText("Price per night for Bed")).toHaveValue("");
    expect(
      rates.getAllByText(
        "Bookings of this kind are taken without a price, and their nights are not charged.",
      ),
    ).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Nightly rates" })).toBeVisible();
  });

  it("a_stale_price_says_it_prices_nothing_until_saved_again", async () => {
    pricesShown = PRICES;
    await show(MANAGER);
    expect(
      within(card("rates")).getByText(
        /Set in EUR\. This Property now trades in TRY/,
      ),
    ).toBeVisible();
  });

  it("a_reader_sees_prices_and_changes_none", async () => {
    pricesShown = { ...PRICES, mayManage: false };
    await show(MANAGER);
    const rates = within(card("rates"));
    expect(rates.queryByRole("textbox")).toBeNull();
    expect(rates.queryByRole("button", { name: "Save changes" })).toBeNull();
    expect(rates.getByText(/1,500\.00/)).toBeVisible();
    expect(
      rates.getByText(
        "Prices are changed by whoever may set rates. You can see them here.",
      ),
    ).toBeVisible();
  });

  it("sends_minor_units_for_the_types_touched_and_blank_clears", async () => {
    savePrices.mockResolvedValue({ status: "saved", version: PRICES.version });
    pricesShown = PRICES;
    await show(MANAGER);
    const rates = within(card("rates"));
    fireEvent.change(rates.getByLabelText("Price per night for Room"), {
      target: { value: "1750,5" },
    });
    fireEvent.change(rates.getByLabelText("Price per night for Bed"), {
      target: { value: "٤٥٠" },
    });
    await act(async () => {
      fireEvent.click(rates.getByRole("button", { name: "Save changes" }));
    });
    const form = savePrices.mock.calls[0]?.[1] as FormData;
    expect(form.get("room")).toBe("175050");
    expect(form.get("bed")).toBe("45000");
    // Untouched types are not sent, so a stale price is not restated by a
    // save about another type.
    expect(form.has("apartment")).toBe(false);
    expect(form.get("version")).toBe(PRICES.version);

    savePrices.mockClear();
    fireEvent.change(rates.getByLabelText("Price per night for Room"), {
      target: { value: "" },
    });
    await act(async () => {
      fireEvent.click(rates.getByRole("button", { name: "Save changes" }));
    });
    expect((savePrices.mock.calls[0]?.[1] as FormData).get("room")).toBe("");
  });

  it("an_unreadable_price_is_refused_at_the_field_and_kept", async () => {
    pricesShown = PRICES;
    await show(MANAGER);
    const rates = within(card("rates"));
    const room = rates.getByLabelText("Price per night for Room");
    fireEvent.change(room, { target: { value: "12.345" } });
    await act(async () => {
      fireEvent.click(rates.getByRole("button", { name: "Save changes" }));
    });
    expect(savePrices).not.toHaveBeenCalled();
    expect(rates.getByText("That is not a price in TRY.")).toBeVisible();
    expect(room).toHaveValue("12.345");
    expect(room).toHaveAttribute("aria-invalid", "true");
    expect(room).toHaveFocus();
  });

  it("no_rates_section_without_the_configuration_gate", async () => {
    await show(MANAGER);
    expect(document.getElementById("rates")).toBeNull();
    expect(screen.queryByRole("link", { name: "Nightly rates" })).toBeNull();
  });

  it.each(supportedLocales)("the rates section reads in %s", async (as) => {
    pricesShown = PRICES;
    await show(MANAGER, { as });
    const title = messages[as].rates.title;
    expect(within(card("rates")).getByText(title)).toBeVisible();
    expect(within(card("rates")).getAllByRole("textbox")).toHaveLength(4);
  });
});
