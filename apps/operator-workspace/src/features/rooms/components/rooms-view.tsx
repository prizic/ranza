"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
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
  type LucideIcon,
} from "lucide-react";
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
import type { UnitEntry, UnitMap } from "../../../server/viewer";
import { AddRoomsDialog } from "./add-rooms-dialog";
import { BlockUnitDialog } from "./block-unit-dialog";

export function RoomsView({
  locale,
  propertyId,
  data,
  propertyName,
}: {
  locale: string;
  propertyId: string;
  data: UnitMap;
  propertyName: string;
}) {
  const t = useTranslations();
  const [viewMode, setViewMode] = useState<"map" | "list">("map");
  const [selectedUnit, setSelectedUnit] = useState<UnitEntry | null>(null);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);

  function handleSelectUnit(unit: UnitEntry) {
    setSelectedUnit(unit);
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
                                <CardTitle className="text-3xl font-light tracking-tight tabular-nums">
                                  {room.name}
                                </CardTitle>
                                <span className="text-xs text-muted-foreground">
                                  {isLetByTheBed
                                    ? t("bedCount", { count: room.beds.length })
                                    : t("sleeps", { count: room.capacity })}
                                </span>
                              </div>
                            </CardHeader>

                            <CardContent>
                              {isLetByTheBed ? (
                                <div className="grid grid-cols-2 gap-2">
                                  {room.beds.map((bed) => (
                                    <button
                                      key={bed.unitId}
                                      type="button"
                                      onClick={() => handleSelectUnit(bed)}
                                      className="hover-lift flex flex-col items-start rounded-2xl border bg-muted/40 p-2.5 text-start transition-colors hover:bg-secondary/70 focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                      <span className="text-xs font-semibold">
                                        {bed.name}
                                      </span>
                                      <div className="pt-1.5">
                                        {renderUnitStateBadge(bed, t)}
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
                                    {renderUnitStateBadge(room, t)}
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
                      <TableCell>{renderUnitStateBadge(bed, t)}</TableCell>
                      <TableCell className="text-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSelectUnit(bed)}
                        >
                          {bed.status === "blocked"
                            ? t("unblockBed")
                            : t("blockBed")}
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
                    <TableCell>{renderUnitStateBadge(room, t)}</TableCell>
                    <TableCell className="text-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSelectUnit(room)}
                      >
                        {room.status === "blocked"
                          ? t("unblockBed")
                          : t("blockBed")}
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
        locale={locale}
        open={blockDialogOpen}
        onOpenChange={setBlockDialogOpen}
        unit={selectedUnit}
      />
    </div>
  );
}

function renderUnitStateBadge(
  unit: UnitEntry,
  t: ReturnType<typeof useTranslations>,
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
        <StatusBadge icon={Ban} tone="neutral" label={t("blockedStatus")} />
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
