"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { formatDate, isSupportedLocale } from "@ranza/i18n";
import {
  Ban,
  Bed,
  Building2,
  CalendarDays,
  CheckCircle2,
  DoorOpen,
  LayoutGrid,
  List,
  RefreshCw,
  Search,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  EmptyState,
  Input,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ranza/ui";
import type { AddRoomsOutcome } from "../../../server/accommodation";
import type {
  RoomsMaintenance,
  UnitEntry,
  UnitHold,
  UnitMap,
  UnitState,
} from "../../../server/viewer";
import { AddRoomsDialog } from "./add-rooms-dialog";
import { BlockUnitDialog } from "./block-unit-dialog";

type StateKind = UnitState["kind"];

const KIND_FILTERS: readonly StateKind[] = [
  "free",
  "reserved",
  "in_house",
  "blocked",
  "out_of_service",
];

type AddedRooms = Extract<AddRoomsOutcome, { status: "done" }>;

/** How often the page asks the server again while it is open and in view. */
const REFRESH_MS = 30_000;

export function RoomsView({
  locale,
  propertyId,
  data,
  housekeepingHref,
  initialView,
  maintenance,
  mayConfigure,
  targetUnitId,
}: {
  locale: string;
  propertyId: string;
  data: UnitMap;
  /** The board that says which rooms are clean, for a viewer who has one. */
  housekeepingHref: string | null;
  initialView: "map" | "list";
  maintenance: RoomsMaintenance;
  /** Whether the viewer holds `accommodation.configure` at this Property. */
  mayConfigure: boolean;
  targetUnitId?: string | null | undefined;
}) {
  const t = useTranslations();
  const rp = useTranslations("roomsPage");
  const mt = useTranslations("maintenance");
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [viewMode, setViewMode] = useState<"map" | "list">(initialView);
  const [query, setQuery] = useState("");
  const [kinds, setKinds] = useState<ReadonlySet<StateKind>>(new Set());
  const [added, setAdded] = useState<AddedRooms | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<UnitEntry | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);

  const targetRoomId = useMemo(() => {
    if (!targetUnitId) return null;
    const directRoom = data.units.find((u) => u.unitId === targetUnitId);
    if (directRoom) return directRoom.unitId;
    const parentRoom = data.units.find((u) =>
      u.beds.some((b) => b.unitId === targetUnitId),
    );
    return parentRoom?.unitId ?? null;
  }, [data.units, targetUnitId]);

  useEffect(() => {
    if (!targetUnitId) return;
    const el =
      document.getElementById(`unit-${targetUnitId}`) ??
      document.getElementById(`room-${targetUnitId}`) ??
      document.getElementById(`list-unit-${targetUnitId}`);
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [targetUnitId]);

  // A bed under a room out of order is held by the room's request.
  const holdByUnit = new Map(
    maintenance.holds.map((hold) => [hold.unitId, hold]),
  );
  const holdFor = (unitId: string, roomId: string | null) =>
    holdByUnit.get(unitId) ?? (roomId ? holdByUnit.get(roomId) : undefined);
  const maintenanceHref = `/${locale}/maintenance?property=${propertyId}`;
  const reportHref = (unitId: string) =>
    maintenance.mayReport ? `${maintenanceHref}&report=${unitId}` : null;
  // Out of order, with the request that holds it and when the room is expected
  // back: the front desk reads the same words Arrivals uses (MT-S2-28,
  // MT-DIFF-01). Day and month only — a tile has no room for the year.
  const outOfOrderLabel = (hold: UnitHold | undefined) => {
    if (!hold) return mt("outOfOrder");
    const back =
      hold.expectedBackOn && isSupportedLocale(locale)
        ? ` · ${mt("backOn", {
            date: formatDate(
              new Date(`${hold.expectedBackOn}T12:00:00Z`),
              locale,
              { timeZone: "UTC", year: undefined },
            ),
          })}`
        : "";
    return `${mt("outOfOrder")} · ${mt("reference", { number: hold.number })}${back}`;
  };

  // A free Unit says when its next arrival is, beside the word free (RB-S1-05).
  const nextArrivalLabel = (day: string) =>
    t("nextArrivalOn", {
      date: isSupportedLocale(locale)
        ? formatDate(new Date(`${day}T12:00:00Z`), locale, {
            timeZone: "UTC",
            year: undefined,
          })
        : day,
    });
  const stateBadge = (unit: UnitEntry, outOfOrder: string) =>
    renderUnitStateBadge(unit, t, outOfOrder, nextArrivalLabel);

  function handleSelectUnit(unit: UnitEntry, roomId: string | null = null) {
    setSelectedUnit(unit);
    setSelectedRoomId(roomId);
    setBlockDialogOpen(true);
  }

  const hasBeds = data.units.some((room) => room.beds.length > 0);

  // The page is a server render, and a second desk that blocks a room or checks
  // someone in changes it. Asking again while it is open and in view keeps a
  // screen for "right now" honest; a refresh while a dialog is open is left for
  // after it closes (ROOMS-15).
  useEffect(() => {
    const ask = () => {
      if (document.visibilityState === "visible" && !blockDialogOpen) {
        startRefresh(() => router.refresh());
      }
    };
    const timer = setInterval(ask, REFRESH_MS);
    document.addEventListener("visibilitychange", ask);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", ask);
    };
  }, [blockDialogOpen, router]);

  function chooseView(next: "map" | "list") {
    setViewMode(next);
    const url = new URL(window.location.href);
    url.searchParams.set("view", next);
    window.history.replaceState(null, "", url);
  }

  const needle = query.trim().toLowerCase();
  const filtered = needle !== "" || kinds.size > 0;
  const visibleUnits = data.units.filter((room) => {
    const leaves = room.beds.length > 0 ? room.beds : [room];
    const named =
      needle === "" ||
      room.name.toLowerCase().includes(needle) ||
      leaves.some(
        (leaf) =>
          leaf.state?.kind === "in_house" &&
          leaf.state.guestName.toLowerCase().includes(needle),
      );
    const inState =
      kinds.size === 0 ||
      leaves.some((leaf) => leaf.state && kinds.has(leaf.state.kind));
    return named && inState;
  });

  function clearFilters() {
    setQuery("");
    setKinds(new Set());
  }

  function toggleKind(kind: StateKind) {
    const next = new Set(kinds);
    if (!next.delete(kind)) next.add(kind);
    setKinds(next);
  }

  const kindLabel: Record<StateKind, string> = {
    free: t("freeTonight"),
    reserved: t("reservedTonight"),
    in_house: t("inHouseTonight"),
    blocked: t("blockedStatus"),
    out_of_service: mt("outOfOrder"),
  };

  // Group top-level units by Building, then Floor
  const buildingsMap = new Map<string, Map<number | null, UnitEntry[]>>();
  for (const room of visibleUnits) {
    const buildingKey = room.building ?? "default";
    let floorsMap = buildingsMap.get(buildingKey);
    if (!floorsMap) {
      floorsMap = new Map<number | null, UnitEntry[]>();
      buildingsMap.set(buildingKey, floorsMap);
    }
    const floorUnits = floorsMap.get(room.floor) ?? [];
    floorUnits.push(room);
    floorsMap.set(room.floor, floorUnits);
  }

  const addRooms = mayConfigure ? (
    <AddRoomsDialog
      locale={locale}
      onAdded={setAdded}
      propertyId={propertyId}
    />
  ) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-sm text-muted-foreground">{t("roomsSubtitle")}</p>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={refreshing}
            onClick={() => startRefresh(() => router.refresh())}
            size="sm"
            variant="ghost"
          >
            <RefreshCw
              aria-hidden="true"
              className={cn(refreshing && "animate-spin")}
            />
            {rp("refresh")}
          </Button>

          {data.units.length > 0 ? (
            <div className="inline-flex rounded-full border bg-card p-1 shadow-xs">
              <Button
                aria-pressed={viewMode === "map"}
                size="sm"
                variant={viewMode === "map" ? "default" : "ghost"}
                onClick={() => chooseView("map")}
              >
                <LayoutGrid aria-hidden="true" />
                {t("bedMap")}
              </Button>
              <Button
                aria-pressed={viewMode === "list"}
                size="sm"
                variant={viewMode === "list" ? "default" : "ghost"}
                onClick={() => chooseView("list")}
              >
                <List aria-hidden="true" />
                {t("bedList")}
              </Button>
            </div>
          ) : null}

          {data.units.length > 0 ? addRooms : null}
        </div>
      </div>

      {added ? (
        <p
          className="flex items-center justify-between gap-3 rounded-2xl border border-success/30 bg-success-soft px-4 py-2.5 text-sm text-success"
          role="status"
        >
          {rp("added", {
            count: added.count,
            first: added.first,
            last: added.last,
          })}
          <button
            aria-label={t("closeDialog")}
            className="rounded-full p-1 hover:bg-success/10 focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setAdded(null)}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </p>
      ) : null}

      {data.units.length > 0 ? (
        <>
          <div className="grid grid-cols-3 gap-2 sm:gap-4 xl:grid-cols-6">
            <StatTile icon={DoorOpen} label={t("statRooms")} tone="neutral">
              {data.counts.rooms}
            </StatTile>
            {hasBeds ? (
              <StatTile
                icon={Bed}
                label={t("statBeds")}
                note={
                  data.counts.outOfService > 0
                    ? t("outOfOrderBeds", { count: data.counts.outOfService })
                    : undefined
                }
                tone="neutral"
              >
                {data.counts.sellable}
              </StatTile>
            ) : null}
            <StatTile icon={Users} label={t("statOccupied")} tone="info">
              {data.counts.inHouse}
            </StatTile>
            <StatTile
              icon={CalendarDays}
              label={t("statReserved")}
              tone="warning"
            >
              {data.counts.reserved}
            </StatTile>
            <StatTile
              icon={CheckCircle2}
              label={hasBeds ? t("statEmpty") : rp("statFree")}
              note={
                !hasBeds && data.counts.outOfService > 0
                  ? t("outOfOrderBeds", { count: data.counts.outOfService })
                  : undefined
              }
              tone="success"
            >
              {data.counts.free}
            </StatTile>
            <StatTile icon={Ban} label={t("statBlocked")} tone="danger">
              {data.counts.blocked}
            </StatTile>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[160px] flex-1 sm:flex-none">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute start-3.5 top-3 size-4 text-muted-foreground"
              />
              <Input
                aria-label={rp("findRoom")}
                className="h-10 w-full rounded-2xl ps-10 pe-4 sm:w-[240px] [&::-webkit-search-cancel-button]:appearance-none"
                onChange={(event) => setQuery(event.target.value)}
                placeholder={rp("findRoom")}
                type="search"
                value={query}
              />
            </div>
            <div
              aria-label={rp("showStates")}
              className="flex flex-wrap items-center gap-1.5"
              role="group"
            >
              {KIND_FILTERS.map((kind) => (
                <Button
                  aria-pressed={kinds.has(kind)}
                  className="min-h-11 md:min-h-0"
                  key={kind}
                  onClick={() => toggleKind(kind)}
                  size="sm"
                  variant={kinds.has(kind) ? "default" : "outline"}
                >
                  {kindLabel[kind]}
                </Button>
              ))}
            </div>
            {filtered && visibleUnits.length > 0 ? (
              <Button onClick={clearFilters} size="sm" variant="ghost">
                {rp("showAll")}
                <X aria-hidden="true" />
              </Button>
            ) : null}
            {housekeepingHref ? (
              <Link
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline md:ms-auto"
                href={housekeepingHref}
                prefetch={false}
              >
                {rp("housekeepingLink")}
              </Link>
            ) : null}
          </div>
        </>
      ) : null}

      {/* Main Content */}
      {data.units.length === 0 ? (
        <EmptyState
          action={addRooms}
          description={
            mayConfigure
              ? t("noRoomsDescription")
              : rp("noRoomsReadOnly", {
                  permission: t("staff.permissions.configureAccommodation"),
                })
          }
          title={t("noRoomsTitle")}
        />
      ) : visibleUnits.length === 0 ? (
        <EmptyState
          action={
            <Button onClick={clearFilters} size="sm" variant="outline">
              {rp("showAll")}
            </Button>
          }
          description={rp("noMatchDescription")}
          title={rp("noMatchTitle")}
        />
      ) : viewMode === "map" ? (
        <div className="space-y-8">
          {Array.from(buildingsMap.entries()).map(
            ([buildingKey, floorsMap]) => (
              <div key={buildingKey} className="space-y-6">
                {buildingKey !== "default" && (
                  <h3 className="flex items-center gap-2.5 text-xl font-medium">
                    <Building2
                      aria-hidden="true"
                      className="size-5 text-muted-foreground"
                    />
                    {buildingKey}
                  </h3>
                )}

                {Array.from(floorsMap.entries()).map(([floorNum, rooms]) => (
                  <div key={floorNum ?? "nofloor"} className="space-y-3">
                    {/* "No floor set" is a heading only beside floors that are
                        set: over every room it reads as something wrong. */}
                    {floorNum !== null || floorsMap.size > 1 ? (
                      <h4 className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
                        {floorNum !== null
                          ? t("floorNumber", { floor: floorNum })
                          : t("noFloor")}
                      </h4>
                    ) : null}

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                      {rooms.map((room) => {
                        const isLetByTheBed = room.beds.length > 0;

                        return (
                          <Card
                            key={room.unitId}
                            id={`room-${room.unitId}`}
                            className={cn(
                              "relative justify-between gap-4 rounded-4xl transition-all duration-300",
                              room.unitId === targetRoomId &&
                                "ring-2 ring-primary ring-offset-2",
                            )}
                          >
                            <CardHeader>
                              <div className="flex items-baseline justify-between gap-3">
                                <CardTitle className="flex items-center gap-2 text-3xl font-light tracking-tight tabular-nums">
                                  {room.name}
                                  {isLetByTheBed &&
                                  room.status === "out_of_service" ? (
                                    <StatusBadge
                                      className={WRAPPING_BADGE}
                                      icon={Wrench}
                                      label={outOfOrderLabel(
                                        holdByUnit.get(room.unitId),
                                      )}
                                      tone="danger"
                                    />
                                  ) : null}
                                </CardTitle>
                                <span className="text-xs text-muted-foreground">
                                  {isLetByTheBed
                                    ? t("bedCount", { count: room.beds.length })
                                    : t("sleeps", { count: room.capacity })}
                                </span>
                              </div>
                              {isLetByTheBed ? null : (
                                <p className="text-xs text-muted-foreground">
                                  {t(
                                    `unitType.${room.unitType}` as Parameters<
                                      typeof t
                                    >[0],
                                  )}
                                </p>
                              )}
                              {/* Not prefetched: one tile is one request, and
                                  all it would fetch is the loading boundary —
                                  the report form is read on the click. */}
                              {isLetByTheBed && reportHref(room.unitId) ? (
                                <Link
                                  className="relative z-10 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                                  href={reportHref(room.unitId) ?? ""}
                                  prefetch={false}
                                >
                                  {t("maintenance.reportProblem")}
                                </Link>
                              ) : null}
                            </CardHeader>

                            <CardContent>
                              {isLetByTheBed ? (
                                <div className="grid grid-cols-2 gap-2">
                                  {room.beds.map((bed) => (
                                    <button
                                      key={bed.unitId}
                                      id={`unit-${bed.unitId}`}
                                      type="button"
                                      onClick={() =>
                                        handleSelectUnit(bed, room.unitId)
                                      }
                                      className={cn(
                                        "hover-lift flex flex-col items-start rounded-2xl border bg-muted/40 p-2.5 text-start transition-colors hover:bg-secondary/70 focus-visible:ring-2 focus-visible:ring-ring",
                                        bed.unitId === targetUnitId &&
                                          "ring-2 ring-primary ring-offset-1",
                                      )}
                                    >
                                      <span className="text-xs font-semibold">
                                        {bed.name}
                                      </span>
                                      <div className="pt-1.5">
                                        {stateBadge(
                                          bed,
                                          outOfOrderLabel(
                                            holdFor(bed.unitId, room.unitId),
                                          ),
                                        )}
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <div className="flex items-center justify-between">
                                  {/* The whole tile is the target: the badge
                                      stretches over it, so pressing the number
                                      or the corner does what pressing the
                                      status does (ROOMS-10). */}
                                  <button
                                    type="button"
                                    id={`unit-${room.unitId}`}
                                    onClick={() => handleSelectUnit(room)}
                                    className={cn(
                                      "rounded-full text-start after:absolute after:inset-0 after:rounded-4xl after:content-[''] focus-visible:ring-2 focus-visible:ring-ring",
                                      room.unitId === targetUnitId &&
                                        "ring-2 ring-primary ring-offset-2",
                                    )}
                                  >
                                    {stateBadge(
                                      room,
                                      outOfOrderLabel(
                                        holdByUnit.get(room.unitId),
                                      ),
                                    )}
                                  </button>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ),
          )}
        </div>
      ) : (
        /* List View */
        <div className="overflow-hidden rounded-3xl border bg-card shadow-low">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("rooms")}</TableHead>
                <TableHead className="hidden md:table-cell">
                  {t("buildingColumn")}
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  {t("floorColumn")}
                </TableHead>
                <TableHead>{rp("roomTypeLabel")}</TableHead>
                <TableHead>{t("capacityPerRoom")}</TableHead>
                <TableHead>{t("tonightColumn")}</TableHead>
                <TableHead className="text-end">
                  <span className="sr-only">{t("unitActions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleUnits.map((room) => {
                if (room.beds.length > 0) {
                  return room.beds.map((bed) => (
                    <TableRow
                      key={bed.unitId}
                      id={`list-unit-${bed.unitId}`}
                      className={cn(
                        bed.unitId === targetUnitId &&
                          "bg-primary/5 ring-1 ring-primary/30",
                      )}
                    >
                      <TableCell className="font-medium">
                        {room.name} &mdash; {bed.name}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {room.building ?? "—"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {room.floor ?? "—"}
                      </TableCell>
                      <TableCell>{t("unitType.bed")}</TableCell>
                      <TableCell>1</TableCell>
                      <TableCell>
                        {stateBadge(
                          bed,
                          outOfOrderLabel(holdFor(bed.unitId, room.unitId)),
                        )}
                      </TableCell>
                      <TableCell className="text-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSelectUnit(bed, room.unitId)}
                        >
                          {unitActionLabel(bed, t)}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ));
                }

                return (
                  <TableRow
                    key={room.unitId}
                    id={`list-unit-${room.unitId}`}
                    className={cn(
                      room.unitId === targetUnitId &&
                        "bg-primary/5 ring-1 ring-primary/30",
                    )}
                  >
                    <TableCell className="font-medium">{room.name}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {room.building ?? "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {room.floor ?? "—"}
                    </TableCell>
                    <TableCell>
                      {t(
                        `unitType.${room.unitType}` as Parameters<typeof t>[0],
                      )}
                    </TableCell>
                    <TableCell>{room.capacity}</TableCell>
                    <TableCell>
                      {stateBadge(
                        room,
                        outOfOrderLabel(holdByUnit.get(room.unitId)),
                      )}
                    </TableCell>
                    <TableCell className="text-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSelectUnit(room)}
                      >
                        {unitActionLabel(room, t)}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <BlockUnitDialog
        hold={
          selectedUnit
            ? (holdFor(selectedUnit.unitId, selectedRoomId) ?? null)
            : null
        }
        locale={locale}
        maintenanceHref={maintenanceHref}
        open={blockDialogOpen}
        onOpenChange={setBlockDialogOpen}
        reportHref={selectedUnit ? reportHref(selectedUnit.unitId) : null}
        roomName={
          data.units.find((room) => room.unitId === selectedRoomId)?.name ??
          null
        }
        unit={selectedUnit}
      />
    </div>
  );
}

/**
 * What pressing a Unit opens: its block, or — out of order — its request.
 */
function unitActionLabel(
  unit: UnitEntry,
  t: ReturnType<typeof useTranslations>,
): string {
  if (unit.status === "blocked") return t("unblockUnit");
  if (unit.state?.kind === "out_of_service") return t("maintenance.outOfOrder");
  return t("manageUnit");
}

// A badge is one line by default. These carry a request number, an arrival and
// a date, or a block's reason, which is wider than a tile, so they wrap inside
// the tile instead.
const WRAPPING_BADGE = "h-auto max-w-full shrink whitespace-normal text-start";

function renderUnitStateBadge(
  unit: UnitEntry,
  t: ReturnType<typeof useTranslations>,
  outOfOrderLabel: string,
  nextArrivalLabel: (day: string) => string,
) {
  const state = unit.state;
  if (!state) return null;

  switch (state.kind) {
    case "in_house":
      return (
        <StatusBadge
          icon={Users}
          tone="info"
          label={state.guestName || t("inHouseTonight")}
        />
      );
    case "blocked":
      return (
        <StatusBadge
          className={WRAPPING_BADGE}
          icon={Ban}
          tone="danger"
          label={state.reason || t("blockedStatus")}
        />
      );
    case "reserved":
      return (
        <StatusBadge
          icon={CalendarDays}
          tone="warning"
          label={t("reservedTonight")}
        />
      );
    case "out_of_service":
      return (
        <StatusBadge
          className={WRAPPING_BADGE}
          icon={Wrench}
          label={outOfOrderLabel}
          tone="danger"
        />
      );
    case "free":
    default:
      return (
        <StatusBadge
          className={WRAPPING_BADGE}
          icon={CheckCircle2}
          tone="success"
          label={
            state.kind === "free" && state.nextArrivalOn
              ? `${t("freeTonight")} · ${nextArrivalLabel(state.nextArrivalOn)}`
              : t("freeTonight")
          }
        />
      );
  }
}

const TILE_TONE = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
} as const;

/**
 * One count at the head of the map: a tinted icon, the number set large and
 * light, and what it counts. The tone repeats the icon's meaning; the label
 * always says it in words.
 */
function StatTile({
  children,
  icon: Icon,
  label,
  note,
  tone,
}: {
  children: ReactNode;
  icon: LucideIcon;
  label: string;
  note?: string | undefined;
  tone: keyof typeof TILE_TONE;
}) {
  return (
    <div className="flex flex-col justify-between rounded-3xl border border-slate-100 bg-card p-3 sm:rounded-[2rem] sm:p-5">
      <span
        className={cn(
          "inline-flex size-8 items-center justify-center rounded-xl sm:size-10 sm:rounded-2xl",
          TILE_TONE[tone],
        )}
      >
        <Icon aria-hidden="true" className="size-4 sm:size-5" />
      </span>
      <div className="mt-3 space-y-1 sm:mt-6">
        <p className="flex items-baseline gap-2">
          <span className="text-3xl font-light tracking-tight tabular-nums sm:text-4xl md:text-5xl">
            {children}
          </span>
          {note ? (
            <span className="text-xs text-muted-foreground">{note}</span>
          ) : null}
        </p>
        <p className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase sm:text-xs">
          {label}
        </p>
      </div>
    </div>
  );
}
