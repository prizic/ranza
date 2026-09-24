"use client";

import { useState } from "react";
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
} from "lucide-react";
import Link from "next/link";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <PageHeader>
            <h1 className="text-2xl font-bold tracking-tight">
              {t("roomsAt", { property: propertyName })}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("roomsSubtitle")}
            </p>
          </PageHeader>
          <p className="text-xs text-muted-foreground pt-2">
            {t("today")}: <span className="font-mono">{data.today}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border bg-muted p-0.5">
            <Button
              size="sm"
              variant={viewMode === "map" ? "default" : "ghost"}
              className="h-8 gap-1.5 px-3 text-xs"
              onClick={() => setViewMode("map")}
            >
              <LayoutGrid aria-hidden="true" className="size-3.5" />
              {t("bedMap")}
            </Button>
            <Button
              size="sm"
              variant={viewMode === "list" ? "default" : "ghost"}
              className="h-8 gap-1.5 px-3 text-xs"
              onClick={() => setViewMode("list")}
            >
              <List aria-hidden="true" className="size-3.5" />
              {t("bedList")}
            </Button>
          </div>

          <AddRoomsDialog locale={locale} propertyId={propertyId} />
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <DoorOpen className="size-4" />
            <span className="text-xs font-medium uppercase tracking-wider">
              {t("statRooms")}
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold">{data.counts.rooms}</div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Bed className="size-4" />
            <span className="text-xs font-medium uppercase tracking-wider">
              {t("statBeds")}
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold">{data.counts.sellable}</div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="size-4" />
            <span className="text-xs font-medium uppercase tracking-wider">
              {t("statOccupied")}
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold">{data.counts.inHouse}</div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CheckCircle2 className="size-4 text-success" />
            <span className="text-xs font-medium uppercase tracking-wider">
              {t("statEmpty")}
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold">{data.counts.free}</span>
            {data.counts.reserved > 0 && (
              <span className="text-xs text-muted-foreground">
                ({data.counts.reserved} {t("reservedTonight").toLowerCase()})
              </span>
            )}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Ban className="size-4 text-danger" />
            <span className="text-xs font-medium uppercase tracking-wider">
              {t("statBlocked")}
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold">{data.counts.blocked}</div>
        </Card>
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
                  <div className="flex items-center gap-2 border-b pb-2 text-lg font-semibold">
                    <Building2 className="size-5 text-muted-foreground" />
                    {buildingKey}
                  </div>
                )}

                {Array.from(floorsMap.entries()).map(([floorNum, rooms]) => (
                  <div key={floorNum ?? "nofloor"} className="space-y-3">
                    <h3 className="text-sm font-medium text-muted-foreground">
                      {floorNum !== null
                        ? `${t("floor")} ${floorNum}`
                        : t("building")}
                    </h3>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                      {rooms.map((room) => {
                        const isLetByTheBed = room.beds.length > 0;

                        return (
                          <Card
                            key={room.unitId}
                            className="flex flex-col justify-between overflow-hidden border transition hover:border-foreground/30"
                          >
                            <CardHeader className="p-4 pb-2">
                              <div className="flex items-center justify-between">
                                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                                  {room.name}
                                  {isLetByTheBed &&
                                  room.status === "out_of_service" ? (
                                    <StatusBadge
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
                                    ? `${room.beds.length} ${t("statBeds").toLowerCase()}`
                                    : `${room.capacity} ${t("statOccupied").toLowerCase()}`}
                                </span>
                              </div>
                              {isLetByTheBed && reportHref(room.unitId) ? (
                                <Link
                                  className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                                  href={reportHref(room.unitId) ?? ""}
                                >
                                  {t("maintenance.reportProblem")}
                                </Link>
                              ) : null}
                            </CardHeader>

                            <CardContent className="p-4 pt-2">
                              {isLetByTheBed ? (
                                <div className="grid grid-cols-2 gap-2 pt-1">
                                  {room.beds.map((bed) => (
                                    <button
                                      key={bed.unitId}
                                      type="button"
                                      onClick={() =>
                                        handleSelectUnit(bed, room.unitId)
                                      }
                                      className="flex flex-col items-start rounded-md border p-2 text-start transition hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
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
                                <div className="flex items-center justify-between pt-2">
                                  <button
                                    type="button"
                                    onClick={() => handleSelectUnit(room)}
                                    className="rounded-md focus-visible:ring-2 focus-visible:ring-ring"
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
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("rooms")}</TableHead>
                <TableHead>{t("building")}</TableHead>
                <TableHead>{t("floor")}</TableHead>
                <TableHead>{t("stayTypeLabel")}</TableHead>
                <TableHead>{t("capacityPerRoom")}</TableHead>
                <TableHead>{t("balance")}</TableHead>
                <TableHead className="text-end">{t("table.columns")}</TableHead>
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
        <StatusBadge icon={Wrench} tone="danger" label={outOfOrderLabel} />
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
