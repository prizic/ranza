import {
  BarChart3,
  Bed,
  Boxes,
  CalendarDays,
  ChefHat,
  BellRing,
  Hotel,
  House,
  Settings,
  Sparkles,
  Users,
  Wallet,
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
 * Four are built. The rest are routes with a stated purpose and nothing behind
 * them, which is the honest shape while blueprint section 13 forbids building
 * tables ahead of the workflows that need them. `docs/handover/operator-workspace-screens.md`
 * says what each one needs first.
 *
 * Every entry is gated. A capability the Organization has not bought is absent
 * from the rail entirely (blueprint 4.6) — never greyed out, and never an
 * upsell. Hiding is not the boundary: the server and the database deny an
 * unentitled route either way (blueprint 3.5).
 */

export interface Screen {
  /** Route segment, locale-prefixed at render. */
  segment: string;
  /** Matched against `property_capabilities.capability_key` (gate 3). */
  capability: string;
  /** Matched against `entitlements.module_key` (gate 2). */
  module: string;
  icon: LucideIcon;
  /** The section of the blueprint that specifies it. */
  blueprint: string;
  /** Built, or a stated intention with nothing behind it. */
  built: boolean;
  /** Children make this a rail category rather than a destination. */
  children?: Screen[];
}

export const SCREENS: Screen[] = [
  {
    segment: "today",
    capability: "today",
    module: "platform_core",
    icon: House,
    blueprint: "18.4",
    built: true,
  },
  {
    segment: "front-office",
    capability: "front_desk",
    module: "front_office",
    icon: Hotel,
    blueprint: "5.3",
    built: true,
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
        icon: House,
        blueprint: "5.3",
        built: true,
      },
      {
        segment: "departures",
        capability: "front_desk",
        module: "front_office",
        icon: House,
        blueprint: "5.3",
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
  },
  {
    segment: "housekeeping",
    capability: "housekeeping",
    module: "housekeeping",
    icon: Sparkles,
    blueprint: "5.4",
    built: false,
  },
  {
    segment: "food-and-beverage",
    capability: "food_and_beverage",
    module: "food_and_beverage",
    icon: ChefHat,
    blueprint: "5.6",
    built: false,
  },
  {
    segment: "inventory",
    capability: "inventory",
    module: "inventory",
    icon: Boxes,
    blueprint: "5.7",
    built: false,
  },
  {
    segment: "finance",
    capability: "finance",
    module: "billing_folios",
    icon: Wallet,
    blueprint: "5.9",
    built: true,
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
  },
  {
    segment: "analytics",
    capability: "analytics",
    module: "analytics",
    icon: BarChart3,
    blueprint: "5.14",
    built: false,
  },
  {
    segment: "configuration",
    capability: "configuration",
    module: "platform_core",
    icon: Settings,
    blueprint: "5.1",
    built: false,
  },
];

/** Every destination, flattened — what a page or a title lookup iterates. */
export const ALL_SCREENS: Screen[] = SCREENS.flatMap((screen) =>
  screen.children ? [screen, ...screen.children] : [screen],
);

export function screenFor(segment: string): Screen | undefined {
  return ALL_SCREENS.find((screen) => screen.segment === segment);
}
