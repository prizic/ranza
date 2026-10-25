"use client";

import Link from "next/link";
import { useState } from "react";
import { LogIn, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatNumber, type SupportedLocale } from "@ranza/i18n";
import { cn } from "@ranza/ui";
import type {
  ArrivalRow,
  DepartureRow,
  DeskRoom,
  RoomState,
} from "../../../server/today-derive";
import { unitLabel } from "../../front-office/unit-label";
import { cutoffTime, money, nights, shortDay } from "../format";
import { todayHref } from "../links";
import {
  actionsFor,
  alternativesFor,
  countsByState,
  floorsOf,
  isToCome,
  readinessOf,
  roomNameOf,
  roomsByName,
} from "./model";
import {
  ArrivalCommand,
  blockerScreen,
  DepartureCommand,
  Eyebrow,
  LINK_BUTTON,
  Panel,
  StateBadge,
  stateIcon,
  STATE_ORDER,
  useArrivalReason,
  useCheckOutReviews,
  usePropertyMinutes,
  type LayoutProps,
} from "./parts";

type Filter = RoomState | "arriving" | "leaving";
type Selection =
  | { kind: "arrival"; room: string }
  | { kind: "departure"; room: string }
  | { kind: "room"; room: string };

const FILTERS: readonly Filter[] = [...STATE_ORDER, "arriving", "leaving"];

const TILE: Record<RoomState, string> = {
  in_house: "border-primary bg-primary text-primary-foreground",
  ready: "border-success/40 bg-card",
  awaiting_inspection: "border-warning/40 bg-warning-soft",
  dirty:
    "border-danger/40 bg-danger-soft [background-image:repeating-linear-gradient(135deg,transparent_0_8px,color-mix(in_srgb,var(--danger)_12%,transparent)_8px_10px)]",
  out_of_service:
    "border-dashed border-line-strong bg-muted text-muted-foreground [background-image:repeating-linear-gradient(45deg,transparent_0_8px,color-mix(in_srgb,var(--ink-muted)_14%,transparent)_8px_10px)]",
};

const TILE_TEXT: Record<RoomState, string> = {
  in_house: "",
  ready: "text-success",
  awaiting_inspection: "text-warning",
  dirty: "text-danger",
  out_of_service: "",
};

/**
 * Today as the building: every room a tile, said in colour, icon and words
 * together. Choose a guest still to arrive and the map answers the desk's
 * actual question: the room they are booked into is ringed, every other ready
 * room of the same type says it can take them, the rest step back.
 */
export function HouseLayout(props: LayoutProps) {
  const { desk, locale, nowMs, onChanged, scope, summary } = props;
  const t = useTranslations("todayLayouts");
  const nowMinutes = usePropertyMinutes(nowMs, summary.day.timezone);
  const { reviews, changed } = useCheckOutReviews(
    scope,
    desk.departures,
    onChanged,
  );
  const rooms = roomsByName(desk.rooms);
  const counts = countsByState(desk.rooms);
  const toCome = desk.arrivals.filter(isToCome);
  const arrivalIn = new Map(toCome.map((a) => [roomNameOf(a.unit), a]));
  const departureOf = new Map(
    desk.departures.map((d) => [roomNameOf(d.unit), d]),
  );

  const first = actionsFor(desk, nowMinutes).find((a) => a.arrival)?.arrival;
  const [filter, setFilter] = useState<Filter | null>(null);
  const [selection, setSelection] = useState<Selection | null>(
    first ? { kind: "arrival", room: roomNameOf(first.unit) } : null,
  );

  const chosenArrival =
    selection?.kind === "arrival" ? arrivalIn.get(selection.room) : undefined;
  const alternatives = chosenArrival
    ? new Set(alternativesFor(chosenArrival, desk).map((room) => room.name))
    : new Set<string>();

  const matches = (room: DeskRoom) =>
    filter === null ||
    (filter === "arriving"
      ? arrivalIn.has(room.name)
      : filter === "leaving"
        ? departureOf.has(room.name)
        : room.state === filter);

  const countOf = (key: Filter) =>
    key === "arriving"
      ? toCome.length
      : key === "leaving"
        ? desk.departures.length
        : counts[key];

  return (
    <div className="flex flex-col gap-6">
      <ul
        className="flex flex-wrap gap-3"
        role="group"
        aria-label={t("house.filter")}
      >
        {FILTERS.map((key) => (
          <li key={key}>
            <button
              aria-pressed={filter === key}
              className={cn(
                "flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-card py-2 ps-4 pe-5 text-start transition-colors hover:border-line-strong focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                filter === key &&
                  "border-primary bg-accent ring-1 ring-primary",
              )}
              onClick={() => setFilter(filter === key ? null : key)}
              type="button"
            >
              <span className="text-4xl leading-none font-light tabular-nums">
                {formatNumber(countOf(key), locale)}
              </span>
              <span className="text-sm leading-tight font-medium whitespace-nowrap">
                {t(`house.filters.${key}`)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_22rem]">
        <Panel labelledBy="house-title">
          <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
            <h2
              className="text-xl font-semibold tracking-tight"
              id="house-title"
            >
              {t("house.title")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("house.hint")}</p>
          </div>
          {floorsOf(desk.rooms).map(({ floor, rooms: onFloor }) => (
            <div
              className="mb-3 grid gap-2 sm:grid-cols-[4rem_1fr]"
              key={floor ?? "none"}
            >
              <Eyebrow>
                {floor === null
                  ? t("house.noFloor")
                  : t("house.floor", { floor: formatNumber(floor, locale) })}
              </Eyebrow>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2.5">
                {onFloor.map((room) => (
                  <li key={room.unitId}>
                    <Tile
                      arrival={arrivalIn.get(room.name)}
                      canTake={alternatives.has(room.name)}
                      departure={departureOf.get(room.name)}
                      dim={
                        // A chosen filter decides what steps back; a chosen
                        // guest does only while there is none.
                        filter !== null
                          ? !matches(room)
                          : selection?.kind === "arrival" &&
                            selection.room !== room.name &&
                            !alternatives.has(room.name)
                      }
                      locale={locale}
                      onSelect={() =>
                        setSelection(
                          arrivalIn.has(room.name)
                            ? { kind: "arrival", room: room.name }
                            : { kind: "room", room: room.name },
                        )
                      }
                      room={room}
                      selected={selection?.room === room.name}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Panel>

        <div className="flex flex-col gap-6 xl:sticky xl:top-6">
          <Detail
            changed={changed}
            desk={desk}
            locale={locale}
            mayBook={summary.mayBook}
            propertyId={scope.propertyId}
            rooms={rooms}
            reviews={reviews}
            scope={scope}
            selection={selection}
            currency={summary.day.currency}
            arrivalIn={arrivalIn}
            departureOf={departureOf}
          />
          <Lists
            arrivals={toCome}
            departures={desk.departures}
            locale={locale}
            onArrival={(a) =>
              setSelection({ kind: "arrival", room: roomNameOf(a.unit) })
            }
            onDeparture={(d) =>
              setSelection({ kind: "departure", room: roomNameOf(d.unit) })
            }
            rooms={rooms}
            selection={selection}
            total={desk.arrivals.length}
            totalDepartures={desk.departed + desk.departures.length}
          />
        </div>
      </div>
    </div>
  );
}

function Tile({
  arrival,
  canTake,
  departure,
  dim,
  locale,
  onSelect,
  room,
  selected,
}: {
  arrival: ArrivalRow | undefined;
  canTake: boolean;
  departure: DepartureRow | undefined;
  dim: boolean;
  locale: SupportedLocale;
  onSelect: () => void;
  room: DeskRoom;
  selected: boolean;
}) {
  const t = useTranslations("todayLayouts");
  const Icon = stateIcon(room.state);
  const guest = room.guestName ?? arrival?.guestName ?? null;
  const label = departure?.overdue
    ? t("house.overdue")
    : t(`state.${room.state}`);
  // Everything the tile shows, in one phrase: the room, who is in it or coming,
  // and what is happening, so a screen reader hears what a sighted desk sees
  // (TODAY-15). Joined by hand: ICU puts "and" between the parts in Arabic.
  const spoken = [
    room.name,
    guest,
    label,
    arrival
      ? arrival.expectedArrival
        ? t("house.arrivalAt", {
            time: cutoffTime(arrival.expectedArrival, locale),
          })
        : t("house.arrival")
      : departure && !departure.overdue
        ? t("house.leaves")
        : null,
  ]
    .filter((part) => part !== null)
    .join(locale === "ar" ? "، " : ", ");
  return (
    <button
      aria-label={spoken}
      aria-pressed={selected}
      className={cn(
        "relative flex min-h-32 w-full flex-col justify-between gap-1.5 overflow-hidden rounded-2xl border-[1.5px] p-3 text-start transition-[opacity,transform] hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        TILE[room.state],
        dim && "opacity-30",
        selected && "ring-2 ring-foreground ring-offset-2 ring-offset-card",
        canTake && "outline-2 outline-offset-2 outline-success outline-dashed",
      )}
      onClick={onSelect}
      type="button"
    >
      <span className="flex items-baseline justify-between gap-2">
        <bdi className="text-xl font-light tracking-tight">{room.name}</bdi>
        <span className="text-[10.5px] opacity-70">{room.unitType}</span>
      </span>
      <span className="min-h-5 text-xs">
        {arrival ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 font-mono font-semibold text-primary">
            <LogIn aria-hidden="true" className="size-3" />
            {arrival.expectedArrival
              ? cutoffTime(arrival.expectedArrival, locale)
              : t("house.noTime")}
          </span>
        ) : departure ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold",
              room.state === "in_house"
                ? "bg-primary-foreground/20"
                : "bg-accent text-primary",
            )}
          >
            <LogOut aria-hidden="true" className="size-3" />
            {t("house.leaves")}
          </span>
        ) : null}
      </span>
      <bdi
        className="block min-h-4 text-sm leading-tight font-semibold [overflow-wrap:anywhere] line-clamp-2"
        {...(guest && !canTake ? { title: guest } : {})}
      >
        {canTake ? t("house.canTake") : guest}
      </bdi>
      <span
        className={cn(
          "flex items-center gap-1 text-[11.5px] leading-tight",
          departure?.overdue ? "font-semibold" : TILE_TEXT[room.state],
        )}
      >
        <Icon aria-hidden="true" className="size-3.5 shrink-0" />
        {label}
      </span>
      {departure?.overdue ? (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-1.5 bg-danger"
        />
      ) : null}
    </button>
  );
}

function Detail({
  arrivalIn,
  changed,
  currency,
  departureOf,
  desk,
  locale,
  mayBook,
  propertyId,
  reviews,
  rooms,
  scope,
  selection,
}: {
  arrivalIn: ReadonlyMap<string, ArrivalRow>;
  changed: () => void;
  currency: string;
  departureOf: ReadonlyMap<string, DepartureRow>;
  desk: LayoutProps["desk"];
  locale: SupportedLocale;
  mayBook: boolean;
  propertyId: string;
  reviews: ReturnType<typeof useCheckOutReviews>["reviews"];
  rooms: ReadonlyMap<string, DeskRoom>;
  scope: LayoutProps["scope"];
  selection: Selection | null;
}) {
  const t = useTranslations("todayLayouts");
  const room = selection ? rooms.get(selection.room) : undefined;
  const arrival =
    selection?.kind === "arrival" ? arrivalIn.get(selection.room) : undefined;
  const departure =
    selection?.kind === "departure"
      ? departureOf.get(selection.room)
      : undefined;
  const reasonOf = useArrivalReason();

  if (!selection || !room) {
    return (
      <Panel>
        <p className="text-sm text-muted-foreground">{t("house.pick")}</p>
      </Panel>
    );
  }

  if (arrival) {
    const readiness = readinessOf(arrival, rooms);
    const length = nights(arrival.startsOn, arrival.endsOn);
    const alternatives = alternativesFor(arrival, desk);
    return (
      <Panel>
        <Eyebrow>
          {t("house.arrivalEyebrow", { reference: arrival.reference })}
        </Eyebrow>
        <h2 className="mt-3 text-3xl leading-tight font-light tracking-tight">
          {t("house.arrivalTitle", {
            guest: arrival.guestName ?? arrival.reference,
            room: unitLabel(arrival.unit.roomName, arrival.unit.unitName),
          })}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {length === null
            ? t("house.openEnded")
            : t("house.nights", { count: length })}
        </p>
        <dl className="my-5 grid grid-cols-2 gap-4 border-y border-line py-4">
          <Fact label={t("house.expected")}>
            {arrival.expectedArrival
              ? cutoffTime(arrival.expectedArrival, locale)
              : t("house.noTime")}
          </Fact>
          <Fact label={unitLabel(arrival.unit.roomName, arrival.unit.unitName)}>
            <StateBadge state={readiness} />
            {readiness === "blocked" ? (
              <span className="mt-1 block text-xs font-normal text-warning">
                {reasonOf(arrival, readiness)}
              </span>
            ) : null}
          </Fact>
        </dl>
        <div className="flex flex-wrap items-center gap-2">
          {readiness === "blocked" ? null : (
            <ArrivalCommand
              arrival={arrival}
              locale={locale}
              onChanged={changed}
              readiness={readiness}
            />
          )}
          {readiness !== "ready" ? (
            <Link
              className={LINK_BUTTON}
              href={todayHref(
                locale,
                readiness === "blocked"
                  ? blockerScreen(arrival)
                  : "housekeeping",
                propertyId,
              )}
            >
              {t(
                `open.${readiness === "blocked" ? blockerScreen(arrival) : "housekeeping"}`,
              )}
            </Link>
          ) : null}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {readiness === "ready"
            ? t("house.nothingBlocks")
            : alternatives.length > 0
              ? t("house.alternatives", {
                  rooms: alternatives.map((r) => r.name).join(", "),
                })
              : t("house.noAlternative")}
        </p>
      </Panel>
    );
  }

  if (departure) {
    return (
      <Panel>
        <Eyebrow>
          {t("house.departureEyebrow", {
            room: unitLabel(departure.unit.roomName, departure.unit.unitName),
          })}
        </Eyebrow>
        <h2 className="mt-3 text-3xl leading-tight font-light tracking-tight">
          <bdi>{departure.guestName}</bdi>
        </h2>
        <p
          className={cn(
            "mt-1 text-sm",
            departure.overdue
              ? "font-semibold text-danger"
              : "text-muted-foreground",
          )}
        >
          {departure.overdue && departure.endsOn
            ? t("flow.overdueSince", {
                date: shortDay(departure.endsOn, locale),
              })
            : t("flow.leavesToday")}
        </p>
        {departure.balance ? (
          <dl className="my-5 border-y border-line py-4">
            <Fact label={t("house.balance")}>
              {departure.balance.amountMinor > 0
                ? t("flow.owes", {
                    amount: money([departure.balance], currency, locale),
                  })
                : t("house.nothingOwed")}
            </Fact>
          </dl>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <DepartureCommand
            departure={departure}
            locale={locale}
            onChanged={changed}
            reviews={reviews}
            scope={scope}
          />
          <Link
            className={LINK_BUTTON}
            href={todayHref(locale, "departures", propertyId)}
          >
            {t("open.departures")}
          </Link>
        </div>
      </Panel>
    );
  }

  return (
    <Panel>
      <Eyebrow>
        {t("house.roomEyebrow", {
          room: room.name,
          type: room.unitType,
        })}
      </Eyebrow>
      <h2 className="mt-3 text-3xl leading-tight font-light tracking-tight">
        {room.guestName
          ? t("house.inHouseTitle", { guest: room.guestName })
          : t(`state.${room.state}`)}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {room.guestName && room.endsOn
          ? t("house.leavesOn", { date: shortDay(room.endsOn, locale) })
          : room.state === "ready"
            ? t("house.canBeSold")
            : room.state === "out_of_service"
              ? t("house.outOfServiceNote")
              : room.state === "in_house"
                ? ""
                : t("house.notSellable")}
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {room.state === "awaiting_inspection" || room.state === "dirty" ? (
          <Link
            className={LINK_BUTTON}
            href={todayHref(locale, "housekeeping", propertyId)}
          >
            {t("open.housekeeping")}
          </Link>
        ) : null}
        {room.state === "ready" && mayBook ? (
          <Link
            className={LINK_BUTTON}
            href={todayHref(locale, "reservations", propertyId)}
          >
            {t("house.newBooking")}
          </Link>
        ) : null}
      </div>
    </Panel>
  );
}

function Fact({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div>
      <dt className="mb-1 text-[10px] font-bold tracking-[0.15em] text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

function Lists({
  arrivals,
  departures,
  locale,
  onArrival,
  onDeparture,
  rooms,
  selection,
  total,
  totalDepartures,
}: {
  arrivals: readonly ArrivalRow[];
  departures: readonly DepartureRow[];
  locale: SupportedLocale;
  onArrival: (arrival: ArrivalRow) => void;
  onDeparture: (departure: DepartureRow) => void;
  rooms: ReadonlyMap<string, DeskRoom>;
  selection: Selection | null;
  total: number;
  totalDepartures: number;
}) {
  const t = useTranslations("todayLayouts");
  const reasonOf = useArrivalReason();
  const row =
    "grid w-full grid-cols-[3.25rem_1fr_auto] items-center gap-2.5 rounded-xl px-3 py-2 text-start transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-pressed:bg-accent aria-pressed:ring-1 aria-pressed:ring-primary";
  return (
    <Panel className="p-3 md:p-3">
      <h3 className="flex items-baseline justify-between px-3 pt-3 pb-1">
        <span className="font-semibold">{t("house.stillToArrive")}</span>
        <Eyebrow>
          {t("house.ofTotal", {
            count: formatNumber(arrivals.length, locale),
            total: formatNumber(total, locale),
          })}
        </Eyebrow>
      </h3>
      <ul>
        {arrivals.map((arrival) => {
          const readiness = readinessOf(arrival, rooms);
          return (
            <li key={arrival.reservationId}>
              <button
                aria-pressed={
                  selection?.kind === "arrival" &&
                  selection.room === roomNameOf(arrival.unit)
                }
                className={row}
                onClick={() => onArrival(arrival)}
                type="button"
              >
                <span
                  className={cn(
                    "font-mono text-sm font-semibold",
                    arrival.expectedArrivalPassed && "text-danger",
                  )}
                >
                  {arrival.expectedArrival
                    ? cutoffTime(arrival.expectedArrival, locale)
                    : "—"}
                </span>
                <span className="min-w-0 text-sm font-medium">
                  <bdi className="block truncate">
                    {arrival.guestName ?? arrival.reference}
                  </bdi>
                  <bdi className="block text-xs font-normal text-muted-foreground">
                    {unitLabel(arrival.unit.roomName, arrival.unit.unitName)}
                  </bdi>
                  {readiness === "blocked" ? (
                    <span className="block text-xs font-normal text-warning">
                      {reasonOf(arrival, readiness)}
                    </span>
                  ) : null}
                </span>
                <StateBadge state={readiness} />
              </button>
            </li>
          );
        })}
      </ul>
      <h3 className="mt-3 flex items-baseline justify-between px-3 pt-3 pb-1">
        <span className="font-semibold">{t("house.stillToLeave")}</span>
        <Eyebrow>
          {t("house.ofTotal", {
            count: formatNumber(departures.length, locale),
            total: formatNumber(totalDepartures, locale),
          })}
        </Eyebrow>
      </h3>
      <ul>
        {departures.map((departure) => (
          <li key={departure.stayId}>
            <button
              aria-pressed={
                selection?.kind === "departure" &&
                selection.room === roomNameOf(departure.unit)
              }
              className={row}
              onClick={() => onDeparture(departure)}
              type="button"
            >
              <bdi className="font-mono text-sm font-semibold">
                {unitLabel(departure.unit.roomName, departure.unit.unitName)}
              </bdi>
              <span className="min-w-0 text-sm font-medium">
                <bdi className="block truncate">{departure.guestName}</bdi>
                <span
                  className={cn(
                    "block text-xs font-normal",
                    departure.overdue
                      ? "font-semibold text-danger"
                      : "text-muted-foreground",
                  )}
                >
                  {departure.overdue && departure.endsOn
                    ? t("flow.overdueSince", {
                        date: shortDay(departure.endsOn, locale),
                      })
                    : t("flow.leavesToday")}
                </span>
              </span>
              <span />
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
