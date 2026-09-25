"use client";

import { useState, type ReactNode } from "react";
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
  Users,
  Wrench,
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
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ranza/ui";
import type {
  RoomsMaintenance,
  UnitEntry,
  UnitHold,
  UnitMap,
} from "../../../server/viewer";
import { AddRoomsDialog } from "./add-rooms-dialog";
import { BlockUnitDialog } from "./block-unit-dialog";

export function RoomsView({
  locale,
  propertyId,
  data,
  propertyName,
  maintenance,
}: {
  locale: string;
  propertyId: string;
  data: UnitMap;
  propertyName: string;
  maintenance: RoomsMaintenance;
}) {
  const t = useTranslations();
  const mt = useTranslations("maintenance");
  const [viewMode, setViewMode] = useState<"map" | "list">("map");
  const [selectedUnit, setSelectedUnit] = useState<UnitEntry | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);

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

  function handleSelectUnit(unit: UnitEntry, roomId: string | null = null) {
    setSelectedUnit(unit);
    setSelectedRoomId(roomId);
    setBlockDialogOpen(true);
  }

  // Group top-level units by Building, then Floor
  const buildingsMap = new Map<string, Map<number | null, UnitEntry[]>>();
  for (const room of data.units) {
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-sm font-medium text-muted-foreground">
            {t("roomsAt", { property: propertyName })}
          </h2>
          <p className="text-sm text-muted-foreground">{t("roomsSubtitle")}</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full border bg-card p-1 shadow-xs">
            <Button
              aria-pressed={viewMode === "map"}
              size="sm"
              variant={viewMode === "map" ? "default" : "ghost"}
              onClick={() => setViewMode("map")}
            >
              <LayoutGrid aria-hidden="true" />
              {t("bedMap")}
            </Button>
            <Button
              aria-pressed={viewMode === "list"}
              size="sm"
              variant={viewMode === "list" ? "default" : "ghost"}
              onClick={() => setViewMode("list")}
            >
              <List aria-hidden="true" />
              {t("bedList")}
            </Button>
          </div>

          <AddRoomsDialog locale={locale} propertyId={propertyId} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        <StatTile icon={DoorOpen} label={t("statRooms")} tone="neutral">
          {data.counts.rooms}
        </StatTile>
        <StatTile icon={Bed} label={t("statBeds")} tone="neutral">
          {data.counts.sellable}
        </StatTile>
        <StatTile icon={Users} label={t("statOccupied")} tone="info">
          {data.counts.inHouse}
        </StatTile>
        <StatTile
          icon={CheckCircle2}
          label={t("statEmpty")}
          note={
            data.counts.reserved > 0
              ? t("reservedCount", { count: data.counts.reserved })
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

      {/* Main Content */}
      {data.units.length === 0 ? (
        <EmptyState
          title={t("noRoomsTitle")}
          description={t("noRoomsDescription")}
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
                    <h4 className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
                      {floorNum !== null
                        ? t("floorNumber", { floor: floorNum })
                        : t("noFloor")}
                    </h4>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                      {rooms.map((room) => {
                        const isLetByTheBed = room.beds.length > 0;

                        return (
                          <Card
                            key={room.unitId}
                            className="justify-between gap-4 rounded-4xl"
                          >
                            <CardHeader>
                              <div className="flex items-baseline justify-between gap-3">
                                <CardTitle className="flex items-center gap-2 text-3xl font-light tracking-tight tabular-nums">
                                  {room.name}
                                  {isLetByTheBed &&
                                  room.status === "out_of_service" ? (
                                    <StatusBadge
                                      className={OUT_OF_ORDER_WRAPS}
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
                              {/* Not prefetched: one tile is one request, and
                                  all it would fetch is the loading boundary —
                                  the report form is read on the click. */}
                              {isLetByTheBed && reportHref(room.unitId) ? (
                                <Link
                                  className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
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
                                      type="button"
                                      onClick={() =>
                                        handleSelectUnit(bed, room.unitId)
                                      }
                                      className="hover-lift flex flex-col items-start rounded-2xl border bg-muted/40 p-2.5 text-start transition-colors hover:bg-secondary/70 focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                      <span className="text-xs font-semibold">
                                        {bed.name}
                                      </span>
                                      <div className="pt-1.5">
                                        {renderUnitStateBadge(
                                          bed,
                                          t,
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
                                  <button
                                    type="button"
                                    onClick={() => handleSelectUnit(room)}
                                    className="rounded-full focus-visible:ring-2 focus-visible:ring-ring"
                                  >
                                    {renderUnitStateBadge(
                                      room,
                                      t,
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
                <TableHead>{t("buildingColumn")}</TableHead>
                <TableHead>{t("floorColumn")}</TableHead>
                <TableHead>{t("stayTypeLabel")}</TableHead>
                <TableHead>{t("capacityPerRoom")}</TableHead>
                <TableHead>{t("tonightColumn")}</TableHead>
                <TableHead className="text-end">
                  <span className="sr-only">{t("unitActions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.units.map((room) => {
                if (room.beds.length > 0) {
                  return room.beds.map((bed) => (
                    <TableRow key={bed.unitId}>
                      <TableCell className="font-medium">
                        {room.name} &mdash; {bed.name}
                      </TableCell>
                      <TableCell>{room.building ?? "—"}</TableCell>
                      <TableCell>{room.floor ?? "—"}</TableCell>
                      <TableCell>{t("unitType.bed")}</TableCell>
                      <TableCell>1</TableCell>
                      <TableCell>
                        {renderUnitStateBadge(
                          bed,
                          t,
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
                  <TableRow key={room.unitId}>
                    <TableCell className="font-medium">{room.name}</TableCell>
                    <TableCell>{room.building ?? "—"}</TableCell>
                    <TableCell>{room.floor ?? "—"}</TableCell>
                    <TableCell>
                      {t(
                        `unitType.${room.unitType}` as Parameters<typeof t>[0],
                      )}
                    </TableCell>
                    <TableCell>{room.capacity}</TableCell>
                    <TableCell>
                      {renderUnitStateBadge(
                        room,
                        t,
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
  if (unit.status === "blocked") return t("unblockBed");
  if (unit.state?.kind === "out_of_service") return t("maintenance.outOfOrder");
  return t("blockBed");
}

// A badge is one line by default. This one carries a request number and a
// date, which is wider than a tile, so it wraps inside the tile instead.
const OUT_OF_ORDER_WRAPS =
  "h-auto max-w-full shrink whitespace-normal text-start";

function renderUnitStateBadge(
  unit: UnitEntry,
  t: ReturnType<typeof useTranslations>,
  outOfOrderLabel: string,
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
          className={OUT_OF_ORDER_WRAPS}
          icon={Wrench}
          label={outOfOrderLabel}
          tone="danger"
        />
      );
    case "free":
    default:
      return (
        <StatusBadge
          icon={CheckCircle2}
          tone="success"
          label={t("freeTonight")}
        />
      );
  }
}

const TILE_TONE = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-info-soft text-info",
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
    <div className="flex flex-col justify-between rounded-[2rem] border border-slate-100 bg-card p-5">
      <span
        className={cn(
          "inline-flex size-10 items-center justify-center rounded-2xl",
          TILE_TONE[tone],
        )}
      >
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <div className="mt-6 space-y-1">
        <p className="flex items-baseline gap-2">
          <span className="text-4xl font-light tracking-tight tabular-nums md:text-5xl">
            {children}
          </span>
          {note ? (
            <span className="text-xs text-muted-foreground">{note}</span>
          ) : null}
        </p>
        <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {label}
        </p>
      </div>
    </div>
  );
}
