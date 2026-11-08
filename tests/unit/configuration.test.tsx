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
import type { StayoverView } from "../../apps/operator-workspace/src/server/stayover";
import type { MaintenanceSettings } from "../../packages/ranza/maintenance/src";
import type { PriceList } from "../../packages/ranza/rates/src";
import {
  isolate,
  supportedLocales,
  type SupportedLocale,
} from "../../packages/i18n/src";
import { messages } from "../../apps/operator-workspace/src/messages";
import {
  gateOf,
  screenFor,
} from "../../apps/operator-workspace/src/lib/screens";

const settingsFor = vi.fn<() => Promise<PropertySettings | null>>();
const inspectionFor = vi.fn<() => Promise<InspectionSettings | null>>();
const stayoverFor = vi.fn<() => Promise<StayoverView | null>>();
const maintenanceFor = vi.fn<() => Promise<MaintenanceSettings | null>>();
const pricesFor = vi.fn<() => Promise<PriceList | null>>();
const savePrices = vi.fn();
const saveProperty = vi.fn();
const renameOrganization = vi.fn();
const previewBusinessDate = vi.fn();
let locale: SupportedLocale = "en";
let maintenanceShown: MaintenanceSettings | null = null;
let pricesShown: PriceList | null = null;
// Screens the viewer's role cannot open here, by segment (audit 2026-11-07, D-04).
let closedScreens: string[] = [];

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
  screenProperties: async (gate: unknown) =>
    closedScreens.some((segment) => gate === gateOf(segment))
      ? []
      : [
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
  timezoneNames: async () => [
    "Europe/Istanbul",
    "Pacific/Kiritimati",
    "America/Kentucky/Louisville",
    "Asia/Yekaterinburg",
    "UTC",
  ],
}));
vi.mock("../../apps/operator-workspace/src/server/configuration", () => ({
  saveProperty,
  renameOrganization,
  previewBusinessDate,
}));
vi.mock("../../apps/operator-workspace/src/server/housekeeping", () => ({
  setInspection: vi.fn(),
  setStayover: vi.fn(),
}));
vi.mock("../../apps/operator-workspace/src/server/stayover", () => ({
  stayoverViewOf: () => stayoverFor(),
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
  operatingModel: "hotel",
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

const STAYOVER: StayoverView = {
  settings: { own: null, mayConfigure: true },
  fallback: { kind: "weekly", weekday: 1 },
  limits: { everyDays: { min: 1, max: 14 }, weekdays: [1, 2, 3, 4, 5, 6, 7] },
};

let stayoverShown: StayoverView | null = null;

async function pageFor(
  settings: PropertySettings,
  as: SupportedLocale,
  inspection: InspectionSettings | null,
) {
  locale = as;
  settingsFor.mockResolvedValue(settings);
  inspectionFor.mockResolvedValue(inspection);
  stayoverFor.mockResolvedValue(stayoverShown);
  maintenanceFor.mockResolvedValue(maintenanceShown);
  pricesFor.mockResolvedValue(pricesShown);
  const page = await ConfigurationPage({
    params: Promise.resolve({ locale: as }),
    // Named, as every page's URL is once it has opened (OA-S3-02); a bare URL
    // redirects, which front-desk-property.test.ts asserts.
    searchParams: Promise.resolve({ property: PROPERTY }),
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

/** The page's own list of sections, apart from the tiles that lead elsewhere. */
function sectionNav() {
  return within(screen.getByRole("navigation", { name: "On this page" }));
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
  closedScreens = [];
  saveProperty.mockReset();
  renameOrganization.mockReset();
  previewBusinessDate.mockReset();
  scrolled.mockReset();
  savePrices.mockReset();
  pricesShown = null;
  stayoverShown = null;
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
        "You can see these settings. To change them, your role needs “Change Property and Organization settings”.",
      ),
    ).toHaveLength(4);
  });

  it("the_organization_card_needs_organization_wide_reach", async () => {
    await show({
      ...MANAGER,
      organization: { ...MANAGER.organization, mayRename: false },
    });
    expect(screen.getByLabelText("Organization name")).toBeDisabled();
    expect(
      within(card("organization")).getByText(
        "This applies to every Property, so only an Owner, or a role with access to every Property, can change it.",
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
  it("the_stayover_schedule_sits_with_housekeeping_and_says_what_it_follows (HK-S4-02)", async () => {
    stayoverShown = STAYOVER;
    await show(MANAGER);
    expect(
      within(card("stayover")).getByText("Cleaning rooms in use"),
    ).toBeVisible();
    expect(
      within(card("stayover")).getByText(
        /Applies at this Property: Every week on Monday/,
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Cleaning rooms in use" }),
    ).toHaveAttribute("href", "#stayover");
  });

  it("no_stayover_card_without_housekeeping (HK-S4-02)", async () => {
    stayoverShown = null;
    await show(MANAGER);
    expect(document.getElementById("stayover")).toBeNull();
  });

  it("the_inspection_setting_is_the_housekeeping_one", async () => {
    await show(MANAGER, { inspection: INSPECTION });
    expect(
      within(card("housekeeping")).getByText("Check rooms after cleaning"),
    ).toBeVisible();
    expect(
      sectionNav().getByRole("link", { name: "Housekeeping" }),
    ).toHaveAttribute("href", "#housekeeping");
  });

  it("no_housekeeping_section_without_housekeeping", async () => {
    await show(MANAGER);
    expect(document.getElementById("housekeeping")).toBeNull();
    expect(
      sectionNav().queryByRole("link", { name: "Housekeeping" }),
    ).toBeNull();
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
      expect(
        sectionNav().getByRole("link", { name: "Maintenance" }),
      ).toHaveAttribute("href", "#maintenance");
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
      `/en/people?property=${PROPERTY}`,
    ]);
  });

  it("offers People only where the viewer may open it, and Rooms likewise (audit D-04)", async () => {
    closedScreens = ["people"];
    await show(MANAGER);
    const links = within(card("elsewhere")).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      `/en/rooms?property=${PROPERTY}`,
    ]);
  });

  it("drops the whole Elsewhere card, and its place in the section list, when neither opens", async () => {
    closedScreens = ["people", "rooms"];
    await show(MANAGER);
    expect(document.getElementById("elsewhere")).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Managed on their own screens" }),
    ).toBeNull();
  });

  it("makes a switched-on screen a link where it opens, and plain text where it does not (audit D-12)", async () => {
    closedScreens = ["housekeeping"];
    await show(MANAGER);
    card("modules").querySelector("details")?.setAttribute("open", "");
    const modules = within(card("modules"));
    expect(modules.getByRole("link", { name: "Maintenance" })).toHaveAttribute(
      "href",
      `/en/maintenance?property=${PROPERTY}`,
    );
    expect(modules.getByText("Housekeeping")).toBeVisible();
    expect(modules.queryByRole("link", { name: "Housekeeping" })).toBeNull();
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
      operatingModel: "hotel",
    });
    await waitFor(() =>
      expect(within(card("property")).getByText("Saved")).toBeVisible(),
    );
  });

  it("offers both operating models, each saying what it changes, and saves the one chosen alone", async () => {
    saveProperty.mockResolvedValue({ status: "saved", version: "v2" });
    await show(MANAGER);
    const model = card("model");
    const hotel = within(model).getByRole("radio", { name: /^Hotel/ });
    const dormitory = within(model).getByRole("radio", {
      name: /^Student dormitory/,
    });
    expect(hotel).toBeChecked();
    expect(
      within(model).getByText(/new bookings start as a Resident stay/),
    ).toBeVisible();
    const save = within(model).getByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();

    fireEvent.click(dormitory);
    expect(dormitory).toBeChecked();
    await act(async () => {
      fireEvent.click(save);
    });
    const form = saveProperty.mock.calls[0]?.[1] as FormData;
    expect(Object.fromEntries(form)).toMatchObject({
      name: MANAGER.name,
      businessDateCutoff: MANAGER.businessDateCutoff,
      operatingModel: "dormitory",
    });
  });

  it("shows a reader the operating model without letting them change it", async () => {
    await show({
      ...MANAGER,
      operatingModel: "dormitory",
      mayConfigure: false,
    });
    const model = card("model");
    expect(
      within(model).getByRole("radio", { name: /^Student dormitory/ }),
    ).toBeChecked();
    expect(within(model).getByRole("radio", { name: /^Hotel/ })).toBeDisabled();
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
    fireEvent.click(await screen.findByText(/Kiritimati, Kiribati/));
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
    fireEvent.click(await screen.findByText(/Kiritimati, Kiribati/));
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
    fireEvent.click(await screen.findByText(/Kiritimati, Kiribati/));
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
      name: "Today rolls over at",
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
    fireEvent.click(await screen.findByText(/Kiritimati, Kiribati/));

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
    fireEvent.click(await screen.findByText(/Kiritimati, Kiribati/));
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
    fireEvent.click(await screen.findByText(/Kiritimati, Kiribati/));
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
      key: "room",
      unitType: "room",
      roomCapacity: null,
      amountMinor: 150000,
      currency: "TRY",
      stale: false,
      sellableUnits: 12,
    },
    {
      key: "bed",
      unitType: "bed",
      roomCapacity: null,
      amountMinor: null,
      currency: null,
      stale: false,
      sellableUnits: 1,
    },
    {
      key: "apartment",
      unitType: "apartment",
      roomCapacity: null,
      amountMinor: 900000,
      currency: "EUR",
      stale: true,
      sellableUnits: 2,
    },
    {
      key: "suite",
      unitType: "suite",
      roomCapacity: null,
      amountMinor: null,
      currency: null,
      stale: false,
      sellableUnits: 0,
    },
  ],
};

/**
 * A yurt's list: beds in rooms of one, three and four. `general` is the price
 * of a bed in a room without a price of its own, `three` the price of the
 * triple; the single and the room of four are priced.
 */
function sizedPrices(prices: {
  general: number | null;
  three: number | null;
}): PriceList {
  const entry = (
    unitType: PriceList["entries"][number]["unitType"],
    roomCapacity: number | null,
    amountMinor: number | null,
    sellableUnits: number,
  ) => ({
    key: roomCapacity === null ? unitType : `${unitType}:${roomCapacity}`,
    unitType,
    roomCapacity,
    amountMinor,
    currency: amountMinor === null ? null : "TRY",
    stale: false,
    sellableUnits,
  });
  return {
    ...PRICES,
    entries: [
      entry("room", null, 150000, 0),
      // Beds a size price does not already cover: the triple's.
      entry("bed", null, prices.general, prices.three === null ? 3 : 0),
      entry("bed", 1, 900000, 1),
      entry("bed", 3, prices.three, 3),
      entry("bed", 4, 400000, 4),
      entry("apartment", null, null, 0),
      entry("suite", null, null, 0),
    ],
  };
}

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
    // A kind it has none of says a price now is not wasted and not yet in use
    // (CONFIG-12), and the kind it has Units of and no price for is warned
    // about on the card and by a count beside the section (CONFIG-01).
    expect(
      rates.getByText(
        "None here yet. A price set now applies from the first one you add.",
      ),
    ).toBeVisible();
    // Unpriced says what that means for a booking (RT-S1-13) — where the
    // Property has Units of that kind, and not for a kind it has none of.
    expect(rates.getByLabelText("Price per night for Bed")).toHaveValue("");
    expect(
      rates.getAllByText(
        "Bookings of this kind are taken without a price, and their nights are not charged.",
      ),
    ).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: "Nightly rates · 1 unpriced" }),
    ).toBeVisible();
    expect(card("rates").querySelector("[data-slot=card]")).toHaveClass(
      "border-warning/40",
    );
  });

  it("RT-S4-13: lists the general bed price and one row for each size of room", async () => {
    pricesShown = sizedPrices({ general: 300000, three: null });
    await show(MANAGER);
    const rates = within(card("rates"));
    expect(rates.getByLabelText("Price per night for Bed")).toHaveValue("3000");
    expect(
      rates.getByLabelText("Price per night for Bed in a single room"),
    ).toHaveValue("9000");
    expect(
      rates.getByLabelText("Price per night for Bed in a 3-bed room"),
    ).toHaveValue("");
    expect(
      rates.getByLabelText("Price per night for Bed in a 4-bed room"),
    ).toHaveValue("4000");
    expect(rates.getByText("3 beds")).toBeVisible();
    expect(
      rates.getByText(
        "Used for every size of room below that has no price of its own.",
      ),
    ).toBeVisible();
  });

  it("RT-S4-15: only beds that would be unpriced are warned about", async () => {
    // The general price is set: a size with none of its own is not a gap.
    pricesShown = sizedPrices({ general: 300000, three: null });
    await show(MANAGER);
    expect(
      within(card("rates")).getByText(
        "No price of its own: these beds take the bed price above.",
      ),
    ).toBeVisible();
    expect(
      within(card("rates")).queryByText(
        "Bookings of this kind are taken without a price, and their nights are not charged.",
      ),
    ).toBeNull();
    expect(screen.getByRole("link", { name: "Nightly rates" })).toBeVisible();
  });

  it("RT-S4-15: with the general price blank, the beds of a size without one are unpriced", async () => {
    pricesShown = sizedPrices({ general: null, three: null });
    await show(MANAGER);
    const rates = within(card("rates"));
    // The beds no size price covers fall to the blank general price, which is
    // where they are counted and where the warning is: the section counts one
    // unpriced kind, not one per size.
    expect(
      rates.getAllByText(
        "Bookings of this kind are taken without a price, and their nights are not charged.",
      ),
    ).toHaveLength(2);
    expect(
      screen.getByRole("link", { name: "Nightly rates · 1 unpriced" }),
    ).toBeVisible();
  });

  it("RT-S4-13: sends a size by its key, and only the prices touched", async () => {
    savePrices.mockResolvedValue({ status: "saved", version: PRICES.version });
    pricesShown = sizedPrices({ general: 300000, three: null });
    await show(MANAGER);
    const rates = within(card("rates"));
    fireEvent.change(
      rates.getByLabelText("Price per night for Bed in a 4-bed room"),
      { target: { value: "4500" } },
    );
    fireEvent.change(
      rates.getByLabelText("Price per night for Bed in a single room"),
      { target: { value: "" } },
    );
    await act(async () => {
      fireEvent.click(rates.getByRole("button", { name: "Save changes" }));
    });
    const form = savePrices.mock.calls[0]?.[1] as FormData;
    expect(form.get("bed:4")).toBe("450000");
    expect(form.get("bed:1")).toBe("");
    expect(form.has("bed")).toBe(false);
    expect(form.has("bed:3")).toBe(false);
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
        "You can see these settings. To change them, your role needs “Set nightly rates”.",
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

describe("finding a time zone, and what it is called (RANZ-73)", () => {
  async function openTimezones() {
    fireEvent.click(screen.getByRole("combobox", { name: "Time zone" }));
    return screen.findByPlaceholderText("Search time zones");
  }

  it("CF-S3-15: the country a person is in finds its zone, and the letters of its name scattered through others do not", async () => {
    await show(MANAGER);
    const search = await openTimezones();
    fireEvent.change(search, { target: { value: "Turkey" } });
    expect(await screen.findByText("Istanbul, Türkiye")).toBeVisible();
    expect(screen.queryByText(/Louisville/)).toBeNull();
    expect(screen.queryByText(/Yekaterinburg/)).toBeNull();
    // Whichever way the country is spelled, and by its own name for itself.
    fireEvent.change(search, { target: { value: "türkiye" } });
    expect(await screen.findByText("Istanbul, Türkiye")).toBeVisible();
    fireEvent.change(search, { target: { value: "europe/ist" } });
    expect(await screen.findByText("Istanbul, Türkiye")).toBeVisible();
  });

  it("CF-S3-15: says there is none when nothing matches, rather than the nearest letters", async () => {
    await show(MANAGER);
    fireEvent.change(await openTimezones(), {
      target: { value: "Turkeyy" },
    });
    expect(await screen.findByText("No time zone matches.")).toBeVisible();
  });

  for (const [as, expected] of [
    ["en", "Istanbul, Türkiye"],
    ["tr", "İstanbul, Türkiye"],
    ["ar", "إسطنبول، تركيا"],
  ] as const) {
    it(`CF-S3-16: names the zone with its country in the reader's language, in ${as}`, async () => {
      await show(MANAGER, { as });
      expect(
        screen.getByRole("combobox", {
          name: messages[as].configuration.timezone,
        }),
      ).toHaveTextContent(expected);
    });
  }
});

describe("what the page says before it is too late (RANZ-73)", () => {
  it("CF-S3-17: says where the currency is chosen that it is chosen for good, and not only after the lock", async () => {
    await show(MANAGER);
    expect(
      screen.getByText(/Choose it before you trade\. Once a folio is opened/),
    ).toBeVisible();
    cleanup();
    await show({ ...MANAGER, currencyFixed: true });
    expect(screen.queryByText(/Choose it before you trade/)).toBeNull();
    expect(
      screen.getByText(/a different currency needs a Property of its own/),
    ).toBeVisible();
  });

  it("CF-S3-18: says what moves with the day's end, in the words the screens use", async () => {
    await show(MANAGER);
    expect(
      screen.getByText(
        /arrivals, departures, closing the day and the nightly room charge all follow it/,
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("combobox", { name: "Today rolls over at" }),
    ).toBeVisible();
  });

  it("CF-S3-19: keeps the list of what is switched on closed until it is wanted", async () => {
    await show(MANAGER);
    const details = card("modules").querySelector("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    expect(
      within(card("modules")).getByText(/\d+ screens? in use/),
    ).toBeVisible();
  });

  it("CF-S3-20: stays under the page bar while the cards scroll, so a section is one press away", async () => {
    await show(MANAGER);
    const nav = screen.getByRole("navigation", { name: "On this page" });
    expect(nav).toHaveClass("sticky", "top-20");
  });
});
