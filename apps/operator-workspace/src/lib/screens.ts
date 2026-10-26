import {
  BarChart3,
  Bed,
  BellRing,
  BookText,
  Boxes,
  Briefcase,
  Building2,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  ChefHat,
  Download,
  History,
  Hotel,
  House,
  LogIn,
  LogOut,
  Palette,
  Settings,
  Sparkles,
  Users,
  Wallet,
  Warehouse,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/**
 * The Operator Workspace's destinations, from blueprint 4.6.
 *
 * That section lists them, and this is that list: Today, Front Office, Guest
 * Experience, Housekeeping, Food and Beverage, Inventory and Procurement,
 * Finance, People, CRM, Analytics, Configuration. It is job-based on purpose —
 * "organize navigation around jobs rather than expose a flat list of every ERP
 * module" — so these are not the section 5 modules and do not map one to one
 * onto them.
 *
 * `built` says which are built. The rest are routes with a stated purpose and
 * nothing behind them, which is the honest shape while blueprint section 13 forbids building
 * tables ahead of the workflows that need them. `docs/handover/operator-workspace-screens.md`
 * says what each one needs first.
 *
 * The audit log is the one entry section 4.6 does not list. It is here because
 * section 3.6 makes audit a baseline right no package can remove, and a record
 * nobody can open is not evidence of anything. Where it sits in the rail is an
 * open question in `docs/features/audit-log/use-case.mmd`; last is the honest
 * default for a record that is consulted rather than worked.
 *
 * Every entry is gated. A capability the Organization has not bought is absent
 * from the rail entirely (blueprint 4.6) — never greyed out, and never an
 * upsell. Hiding is not the boundary: the server and the database deny an
 * unentitled route either way (blueprint 3.5).
 *
 * The audit log is gated by a permission instead, because audit is not
 * something an Organization buys (blueprint 3.6): it is in the rail for
 * whoever may read it, whatever the Organization's package (ADR 0031).
 */

export interface Screen {
  /** Route segment, locale-prefixed at render. */
  segment: string;
  /**
   * Matched against `property_capabilities.capability_key` (gate 3). For an
   * entry gated by `permission` alone it names no capability — `requires` does,
   * where there is one. Two entries may share a key under different modules
   * (People and HR), so nothing keys on it: the rail filters by `segment`.
   */
  capability: string;
  /**
   * A staff permission the role must hold, or any one of several. On its own it
   * decides the entry instead of a capability, for a destination no package
   * selection may remove; with `requires` it is asked in addition to it.
   */
  permission?: string | readonly string[] | undefined;
  /**
   * For an entry decided by `permission` that is an Organization's to
   * configure and not a baseline right: the capability, in `module`, a Property
   * must also have for the entry to be offered there (gates 1 to 3). The same
   * three the write policies ask, so the rail, the page and the policy agree.
   */
  requires?: string | undefined;
  /** Matched against `entitlements.module_key` (gate 2). */
  module: string;
  icon: LucideIcon;
  /** The section of the blueprint that specifies it. */
  blueprint: string;
  /** Built, or a stated intention with nothing behind it. */
  built: boolean;
  /** Section grouping in the sidebar: operations, management, or system */
  section?: string | undefined;
  /**
   * Its rows carry no Property, so only a viewer who reaches every Property of
   * an Organization can read them (the ledger): the rail, the Property
   * switcher and the page offer it to no one else.
   */
  organizationWide?: boolean | undefined;
  /** Children make this a rail category rather than a destination. */
  children?: Screen[] | undefined;
  /**
   * Not a capability a Property switches on: the shell decides whether to
   * offer it, from what the viewer reaches (`lib/portfolio-offer.ts`). Its
   * `capability` is only the key the rail filters on, so it is never asked of
   * the database.
   */
  derived?: boolean | undefined;
}

/**
 * What a role must hold to be offered a destination: any one of these. A role
 * reaches the pages of the work it does and no others — a Housekeeping Staff
 * Member is not offered Finance because the shell would otherwise show them
 * guest folios they have no job reading (ADR 0056, amending the approved
 * read-only rows it names).
 *
 * The lists are the commands of the destination's own work, so a role gains a
 * page by being given a command in it and loses it by losing the last one. The
 * database still decides each command; this decides what is offered and opened.
 */
const FRONT_DESK_WORK = [
  "front_desk.book",
  "front_desk.check_in",
  "front_desk.check_out",
  "front_desk.cancel",
  "front_desk.amend",
] as const;

const ROOM_WORK = [...FRONT_DESK_WORK, "accommodation.configure"] as const;

/**
 * Departures is also the page that says what each leaving Guest owes, which is
 * why Today's finance focus links its balance figures to it: a role that
 * manages Folios reads it, and checks nobody out for lack of `check_out`.
 */
const DEPARTURE_WORK = [...FRONT_DESK_WORK, "finance.manage_folio"] as const;

const GUEST_SERVICES_WORK = [
  "guest_services.create_request",
  "guest_services.manage_requests",
] as const;

const MAINTENANCE_WORK = [
  "maintenance.report",
  "maintenance.manage",
  "maintenance.take_out_of_order",
  "maintenance.equipment",
] as const;

const FINANCE_WORK = [
  "finance.manage_folio",
  "finance.post_charge",
  "finance.reverse_charge",
  "finance.post_payment",
  "finance.reverse_payment",
  "finance.view_ledger",
] as const;

const STAFF_WORK = ["staff.administer", "staff.define_roles"] as const;

const CONFIGURATION_WORK = [
  "configuration.manage",
  "accommodation.configure",
  "rates.manage",
] as const;

/** Revenue, and the comparison of Properties by it: for a role that reads the ledger. */
const REVENUE_READING = ["finance.view_ledger"] as const;

export const SCREENS: Screen[] = [
  {
    segment: "today",
    capability: "today",
    module: "platform_core",
    icon: House,
    blueprint: "18.4",
    built: true,
    section: "operations",
  },
  {
    segment: "front-office",
    capability: "front_desk",
    module: "front_office",
    icon: Hotel,
    blueprint: "5.3",
    built: true,
    section: "operations",
    children: [
      {
        segment: "reservations",
        capability: "front_desk",
        permission: FRONT_DESK_WORK,
        requires: "front_desk",
        module: "front_office",
        icon: CalendarDays,
        blueprint: "5.3",
        built: true,
      },
      {
        segment: "room-calendar",
        capability: "front_desk",
        permission: FRONT_DESK_WORK,
        requires: "front_desk",
        module: "front_office",
        icon: CalendarRange,
        blueprint: "18.6",
        built: true,
      },
      {
        segment: "rooms",
        capability: "front_desk",
        permission: ROOM_WORK,
        requires: "front_desk",
        module: "front_office",
        icon: Bed,
        blueprint: "4.7",
        built: true,
      },
      {
        segment: "arrivals",
        capability: "front_desk",
        permission: FRONT_DESK_WORK,
        requires: "front_desk",
        module: "front_office",
        icon: LogIn,
        blueprint: "5.3",
        built: true,
      },
      {
        segment: "departures",
        capability: "front_desk",
        permission: DEPARTURE_WORK,
        requires: "front_desk",
        module: "front_office",
        icon: LogOut,
        blueprint: "5.3",
        built: true,
      },
      {
        segment: "close-day",
        capability: "front_desk",
        permission: "front_desk.close_day",
        requires: "front_desk",
        module: "front_office",
        icon: CalendarCheck,
        blueprint: "6.4",
        built: true,
      },
    ],
  },
  {
    segment: "guest-experience",
    capability: "guest_experience",
    permission: GUEST_SERVICES_WORK,
    requires: "guest_experience",
    module: "guest_services",
    icon: BellRing,
    blueprint: "5.5",
    built: true,
    section: "operations",
  },
  {
    segment: "housekeeping",
    capability: "housekeeping",
    permission: "housekeeping.update_status",
    requires: "housekeeping",
    module: "housekeeping",
    icon: Sparkles,
    blueprint: "5.4",
    built: true,
    section: "operations",
  },
  // Blueprint 4.6 lists no Maintenance destination: its work sits under the
  // physical places, next to Housekeeping, where the mockup puts it and where
  // a desk that finds a broken room will look (RANZ-33, blueprint 5.13).
  {
    segment: "maintenance",
    capability: "maintenance",
    permission: MAINTENANCE_WORK,
    requires: "maintenance",
    module: "maintenance",
    icon: Wrench,
    blueprint: "5.13",
    built: true,
    section: "operations",
  },
  {
    segment: "food-and-beverage",
    capability: "food_and_beverage",
    permission: "configuration.manage",
    requires: "food_and_beverage",
    module: "food_and_beverage",
    icon: ChefHat,
    blueprint: "5.6",
    built: false,
    section: "operations",
  },
  {
    segment: "inventory",
    capability: "inventory",
    permission: "configuration.manage",
    requires: "inventory",
    module: "inventory",
    icon: Warehouse,
    blueprint: "5.7",
    built: false,
    section: "management",
  },
  {
    segment: "finance",
    capability: "finance",
    permission: FINANCE_WORK,
    requires: "finance",
    module: "billing_folios",
    icon: Wallet,
    blueprint: "5.9",
    built: true,
    section: "management",
  },
  {
    segment: "ledger",
    // The books, read: an entry carries no Property, so the permission alone is
    // not enough and the Organization's whole reach is asked as well (ACC-S2-05).
    // Its capability is Folio finance, the one that feeds it (ACC-S2-09).
    capability: "finance",
    permission: "finance.view_ledger",
    requires: "finance",
    organizationWide: true,
    module: "billing_folios",
    icon: BookText,
    blueprint: "5.10",
    built: true,
    section: "management",
  },
  {
    segment: "people",
    // Staff and permissions, not payroll. Who works here and what they may do
    // is part of the platform every Organization has (blueprint 7.2); Human
    // Resources (5.11) is contracts and wages and is a later destination.
    capability: "staff_administration",
    permission: STAFF_WORK,
    requires: "staff_administration",
    module: "platform_core",
    icon: Users,
    blueprint: "7.2",
    built: true,
    section: "management",
  },
  {
    segment: "hr",
    // Contracts and wages are stricter than the roster (blueprint 5.11): the
    // module being bought is not enough, the role must hold `hr.view` too. Its
    // capability key is People's, so the rail asks for it by segment.
    capability: "staff_administration",
    permission: "hr.view",
    requires: "staff_administration",
    module: "human_resources",
    icon: Briefcase,
    blueprint: "5.11",
    built: true,
    section: "management",
  },
  {
    segment: "analytics",
    capability: "analytics",
    permission: REVENUE_READING,
    requires: "analytics",
    module: "analytics",
    icon: BarChart3,
    blueprint: "5.14",
    built: true,
    section: "management",
  },
  // The Owner's view across Properties (RANZ-43). Offered only to someone who
  // reaches more than one Property in an Organization, because with one there
  // is nothing to put beside it (docs/features/portfolio/edge-cases.csv). The
  // Enterprise-plan gate the mockup hints at is the owner's to decide, so none
  // is invented here.
  {
    segment: "portfolio",
    capability: "portfolio",
    module: "analytics",
    icon: Building2,
    blueprint: "11",
    built: true,
    section: "management",
    derived: true,
  },
  {
    segment: "integrations",
    capability: "integrations",
    // To see them or to manage them: a role that may manage what it cannot see
    // would otherwise be refused the screen it is to act on.
    permission: ["integrations.view", "integrations.manage"],
    requires: "integrations",
    module: "platform_core",
    icon: Boxes,
    blueprint: "5.15",
    built: true,
    section: "system",
  },
  {
    segment: "configuration",
    capability: "configuration",
    permission: CONFIGURATION_WORK,
    requires: "configuration",
    module: "platform_core",
    icon: Settings,
    blueprint: "5.1",
    built: true,
    section: "system",
  },
  {
    segment: "branding",
    capability: "branding",
    permission: "branding.manage",
    requires: "configuration",
    module: "platform_core",
    icon: Palette,
    blueprint: "8",
    built: true,
    section: "system",
  },
  {
    segment: "data-export",
    capability: "data_export",
    permission: "data_export.read",
    module: "platform_core",
    icon: Download,
    blueprint: "7.5",
    built: true,
    section: "system",
  },
  {
    segment: "audit-log",
    capability: "audit",
    permission: "audit.read",
    module: "platform_core",
    icon: History,
    blueprint: "7.4",
    built: true,
  },
];

/**
 * What a destination asks of a Property and of the person — the one gate the
 * rail, the Property switcher and the page itself all read, so they cannot
 * disagree about whether a page is open.
 *
 * `capability` is gates 1 to 3 (Subscription, Entitlement, Property); it is
 * absent for a destination no package selection may remove. `permission` is
 * what the role must hold in the Organization.
 */
export interface ScreenGate {
  capability?: { moduleKey: string; capabilityKey: string } | undefined;
  /** What the role must hold; any one of several is enough. */
  permission?: string | readonly string[] | undefined;
  /** The viewer must reach the whole Organization, not only some Properties. */
  organizationWide?: boolean | undefined;
}

/**
 * Stable objects, built once: a server read keyed on a capability is cached
 * per request by the identity of what it was asked, and a fresh object per
 * call would defeat that.
 */
const GATES = new Map<string, ScreenGate>();

function gateFor(screen: Screen): ScreenGate {
  const capability =
    screen.permission && !screen.requires
      ? undefined
      : {
          moduleKey: screen.module,
          capabilityKey: screen.requires ?? screen.capability,
        };
  return {
    capability,
    permission: screen.permission,
    organizationWide: screen.organizationWide,
  };
}

/** Every destination, flattened — what a page or a title lookup iterates. */
export const ALL_SCREENS: Screen[] = SCREENS.flatMap((screen) =>
  screen.children ? [screen, ...screen.children] : [screen],
);

export function screenFor(segment: string): Screen | undefined {
  return ALL_SCREENS.find((screen) => screen.segment === segment);
}

/**
 * The gate of one destination, by route segment. A segment with no gate — one
 * that is not a destination, or one the shell offers by what the viewer reaches
 * instead (`derived`) — is a mistake in the caller, so it is thrown rather than
 * answered with a gate that opens everything or nothing.
 */
export function gateOf(segment: string): ScreenGate {
  const known = GATES.get(segment);
  if (known) return known;
  const screen = screenFor(segment);
  if (!screen || screen.derived) {
    throw new Error(`"${segment}" is not a destination with a gate`);
  }
  const gate = gateFor(screen);
  GATES.set(segment, gate);
  return gate;
}
