import {
  BarChart3,
  Bed,
  BellRing,
  Boxes,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  ChefHat,
  History,
  Hotel,
  House,
  LogIn,
  LogOut,
  Settings,
  Sparkles,
  Users,
  Wallet,
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
   * Matched against `property_capabilities.capability_key` (gate 3), and the
   * key the rail filters on. For an entry gated by `permission` it is that
   * key alone and names no capability.
   */
  capability: string;
  /**
   * A staff permission that decides this entry instead of a capability — for
   * the one destination no package selection may remove.
   */
  permission?: string | undefined;
  /** Matched against `entitlements.module_key` (gate 2). */
  module: string;
  icon: LucideIcon;
  /** The section of the blueprint that specifies it. */
  blueprint: string;
  /** Built, or a stated intention with nothing behind it. */
  built: boolean;
  /** Section grouping in the sidebar: operations, management, or system */
  section?: string | undefined;
  /** Children make this a rail category rather than a destination. */
  children?: Screen[] | undefined;
}

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
        module: "front_office",
        icon: CalendarDays,
        blueprint: "5.3",
        built: true,
      },
      {
        segment: "room-calendar",
        capability: "front_desk",
        module: "front_office",
        icon: CalendarRange,
        blueprint: "18.6",
        built: true,
      },
      {
        segment: "rooms",
        capability: "front_desk",
        module: "front_office",
        icon: Bed,
        blueprint: "4.7",
        built: true,
      },
      {
        segment: "arrivals",
        capability: "front_desk",
        module: "front_office",
        icon: LogIn,
        blueprint: "5.3",
        built: true,
      },
      {
        segment: "departures",
        capability: "front_desk",
        module: "front_office",
        icon: LogOut,
        blueprint: "5.3",
        built: true,
      },
      {
        segment: "close-day",
        capability: "front_desk",
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
    module: "guest_services",
    icon: BellRing,
    blueprint: "5.5",
    built: false,
    section: "operations",
  },
  {
    segment: "housekeeping",
    capability: "housekeeping",
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
    module: "maintenance",
    icon: Wrench,
    blueprint: "5.13",
    built: true,
    section: "operations",
  },
  {
    segment: "food-and-beverage",
    capability: "food_and_beverage",
    module: "food_and_beverage",
    icon: ChefHat,
    blueprint: "5.6",
    built: false,
    section: "operations",
  },
  {
    segment: "inventory",
    capability: "inventory",
    module: "inventory",
    icon: Boxes,
    blueprint: "5.7",
    built: false,
    section: "management",
  },
  {
    segment: "finance",
    capability: "finance",
    module: "billing_folios",
    icon: Wallet,
    blueprint: "5.9",
    built: true,
    section: "management",
  },
  {
    segment: "people",
    // Staff and permissions, not payroll. Who works here and what they may do
    // is part of the platform every Organization has (blueprint 7.2); Human
    // Resources (5.11) is contracts and wages and is a later destination.
    capability: "staff_administration",
    module: "platform_core",
    icon: Users,
    blueprint: "7.2",
    built: true,
    section: "management",
  },
  {
    segment: "analytics",
    capability: "analytics",
    module: "analytics",
    icon: BarChart3,
    blueprint: "5.14",
    built: false,
    section: "management",
  },
  {
    segment: "configuration",
    capability: "configuration",
    module: "platform_core",
    icon: Settings,
    blueprint: "5.1",
    built: false,
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

/** Every destination, flattened — what a page or a title lookup iterates. */
export const ALL_SCREENS: Screen[] = SCREENS.flatMap((screen) =>
  screen.children ? [screen, ...screen.children] : [screen],
);

export function screenFor(segment: string): Screen | undefined {
  return ALL_SCREENS.find((screen) => screen.segment === segment);
}
