"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  ArrowRight,
  BedDouble,
  Check,
  ChevronDown,
  ChevronUp,
  Droplet,
  Eye,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { StatusBadge, cn, type StatusTone } from "@ranza/ui";
import type { SupportedLocale } from "@ranza/i18n";
import type {
  ArrivalRow,
  DepartureRow,
  RoomState,
  TodaySummary,
} from "../../../server/today-derive";
import type { DeskCard } from "../../../server/today-desk";
import { CheckInAction } from "../../front-office/components/check-in-action";
import { CheckOutDialog } from "../../front-office/components/check-out-dialog";
import { fetchDepartures } from "../../front-office/queries";
import { frontOfficeKeys } from "../../front-office/query-keys";
import type { TodayScope } from "../query-keys";
import { unitLabel } from "../../front-office/unit-label";
import { minutesAt, type Readiness } from "./model";

/** What every desk layout is handed: one answer, and what to do when it moves. */
export interface LayoutProps {
  summary: TodaySummary;
  desk: DeskCard;
  locale: SupportedLocale;
  scope: TodayScope;
  /** The server's clock when the page was built, so the first paint agrees. */
  nowMs: number;
  /** Somebody was checked in or out: read the day again. */
  onChanged: () => void;
}

const STATE_META: Record<Readiness, { icon: LucideIcon; tone: StatusTone }> = {
  in_house: { icon: BedDouble, tone: "info" },
  ready: { icon: Check, tone: "success" },
  awaiting_inspection: { icon: Eye, tone: "warning" },
  dirty: { icon: Droplet, tone: "danger" },
  out_of_service: { icon: Wrench, tone: "neutral" },
  blocked: { icon: AlertTriangle, tone: "danger" },
};

export function stateIcon(state: Readiness): LucideIcon {
  return STATE_META[state].icon;
}

/** A room's state: colour, icon and words together (blueprint 18.5). */
export function StateBadge({
  className,
  state,
}: {
  className?: string;
  state: Readiness;
}) {
  const t = useTranslations("todayLayouts");
  const meta = STATE_META[state];
  return (
    <StatusBadge
      {...(className ? { className } : {})}
      icon={meta.icon}
      label={t(`state.${state}`)}
      tone={meta.tone}
    />
  );
}

/** Minutes since midnight at the Property, ticking, first painted as the server did. */
export function usePropertyMinutes(nowMs: number, timeZone: string): number {
  const [instant, setInstant] = useState(nowMs);
  useEffect(() => {
    const tick = () => setInstant(Date.now());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  return minutesAt(instant, timeZone);
}

/** A secondary action drawn as a link: the way into the screen that settles a row. */
export const LINK_BUTTON =
  "inline-flex min-h-9 items-center rounded-full border border-border px-4 text-sm font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/** The width of an element, for a layout that packs things by their size. */
export function useElementWidth<T extends HTMLElement>(): [
  (node: T | null) => void,
  number,
] {
  const [width, setWidth] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);
  useEffect(() => () => observer.current?.disconnect(), []);
  const ref = useCallback((node: T | null) => {
    observer.current?.disconnect();
    if (!node) return;
    setWidth(node.clientWidth);
    observer.current = new ResizeObserver(() => setWidth(node.clientWidth));
    observer.current.observe(node);
  }, []);
  return [ref, width];
}

/**
 * The Departures screen's own rows, which the check-out dialog reviews: the
 * bill under review is that screen's, not a copy Today derived, and Today's
 * summary carries no balance for a viewer who may not see money (TD-S1-03).
 */
export function useCheckOutReviews(
  scope: TodayScope,
  departures: readonly DepartureRow[],
  onChanged: () => void,
) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: frontOfficeKeys.departures(scope, "due"),
    queryFn: () => fetchDepartures(scope.propertyId, "due"),
    enabled: departures.some((row) => row.mayCheckOut),
    refetchInterval: 60_000,
  });
  // A check-in or check-out moves a row on the screens beside this one too.
  const changed = useCallback(() => {
    void client.invalidateQueries({ queryKey: frontOfficeKeys.all(scope) });
    onChanged();
  }, [client, onChanged, scope]);
  return { reviews: query.data ?? [], changed };
}

export type CheckOutReviews = ReturnType<typeof useCheckOutReviews>["reviews"];

/**
 * Check-in from a row, where the viewer may; nothing where they may not. A room
 * that is not ready is asked about in place, with "Check in anyway", the same on
 * every layout (TODAY-09): the command still asks the server, which decides.
 */
export function ArrivalCommand({
  arrival,
  locale,
  onChanged,
  readiness,
}: {
  arrival: ArrivalRow;
  locale: SupportedLocale;
  onChanged: () => void;
  readiness?: Readiness;
}) {
  if (!arrival.mayCheckIn) return null;
  const because =
    readiness === "dirty" || readiness === "awaiting_inspection"
      ? readiness
      : null;
  return (
    <CheckInAction
      {...(arrival.guestName ? { guestName: arrival.guestName } : {})}
      locale={locale}
      onDone={onChanged}
      reservationId={arrival.reservationId}
      {...(because
        ? {
            room: {
              label: unitLabel(arrival.unit.roomName, arrival.unit.unitName),
              because,
            },
          }
        : {})}
    />
  );
}

/** Where an arrival that cannot be checked in is mended: the page that owns the blocker. */
export type BlockedScreen = "arrivals" | "housekeeping" | "departures";

export function blockerScreen(arrival: ArrivalRow): BlockedScreen {
  switch (arrival.blocker) {
    case "unit_blocked":
    case "unit_out_of_service":
      return "housekeeping";
    case "unit_occupied":
      return "departures";
    case "not_confirmed":
    case null:
      return "arrivals";
  }
}

/**
 * What stands between this arrival and the key, in words: the booking's own
 * reason when it is blocked, otherwise the state of the room (TODAY-08). One
 * wording for the plan, the map and the queue.
 */
export function useArrivalReason() {
  const t = useTranslations("todayLayouts");
  return (arrival: ArrivalRow, readiness: Readiness): string =>
    readiness === "blocked" && arrival.blocker
      ? t(`blocker.${arrival.blocker}`)
      : t("detail.room", { state: t(`state.${readiness}`) });
}

/** The bill a check-out would review, where the viewer may check out. */
export function reviewFor(departure: DepartureRow, reviews: CheckOutReviews) {
  return departure.mayCheckOut
    ? reviews.find((candidate) => candidate.stayId === departure.stayId)
    : undefined;
}

/** Check-out from a row, reviewing the bill first, where the viewer may. */
export function DepartureCommand({
  departure,
  locale,
  onChanged,
  reviews,
  scope,
}: {
  departure: DepartureRow;
  locale: SupportedLocale;
  onChanged: () => void;
  reviews: CheckOutReviews;
  scope: TodayScope;
}) {
  const review = reviewFor(departure, reviews);
  if (!review) return null;
  return (
    <CheckOutDialog
      departure={review}
      locale={locale}
      onDone={onChanged}
      propertyId={scope.propertyId}
    />
  );
}

/** Opens and folds a list that shows only its most urgent rows at first. */
export function FoldToggle({
  controls,
  expanded,
  hidden,
  onToggle,
}: {
  controls: string;
  expanded: boolean;
  /** How many rows a folded list leaves out. */
  hidden: number;
  onToggle: () => void;
}) {
  const t = useTranslations("todayLayouts");
  const Chevron = expanded ? ChevronUp : ChevronDown;
  return (
    <button
      aria-controls={controls}
      aria-expanded={expanded}
      className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-primary hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      onClick={onToggle}
      type="button"
    >
      {expanded ? t("flow.showFewer") : t("flow.showMore", { count: hidden })}
      <Chevron aria-hidden="true" className="size-4" />
    </button>
  );
}

export function Panel({
  children,
  className,
  labelledBy,
}: {
  children: ReactNode;
  className?: string;
  labelledBy?: string;
}) {
  return (
    <section
      {...(labelledBy ? { "aria-labelledby": labelledBy } : {})}
      className={cn(
        "rounded-[2rem] border border-slate-100 bg-card p-5 md:p-7",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">
      {children}
    </p>
  );
}

/** A figure's way into the list behind it. */
export function OpenLink({
  children,
  href,
}: {
  children: ReactNode;
  href: string;
}) {
  return (
    <Link
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
      href={href}
    >
      {children}
      <ArrowRight aria-hidden="true" className="size-3.5 rtl:rotate-180" />
    </Link>
  );
}

export const STATE_ORDER: readonly RoomState[] = [
  "in_house",
  "ready",
  "awaiting_inspection",
  "dirty",
  "out_of_service",
];
