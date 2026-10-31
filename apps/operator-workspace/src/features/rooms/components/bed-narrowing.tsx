"use client";

import { useTranslations } from "next-intl";
import { Button, cn } from "@ranza/ui";
import { ADMITS_FILTERS, type AdmitsFilter } from "../../today/views";
import {
  blocksOf,
  freeIn,
  hasGenderedRooms,
  hasUnbuiltRooms,
  type NarrowableRoom,
  type Narrowing,
} from "../narrowing";

/**
 * The block and whom-a-room-admits choices above the beds, on Rooms and on the
 * room calendar (RB-S6-01, RC-S7-05). What they narrow to is said by the shared
 * `ListFilterNotice`, through `noticeFor`.
 *
 * Each chip carries the empty beds it would leave, given the other choice, so
 * the reader sees where the room is before pressing anything. The counts come
 * from `free`, the places `freePlaces` named from the Rooms read: the
 * definition Today and the Rooms tiles count with. Null means the screen could
 * not say, and the chips then carry no count rather than a wrong one.
 *
 * Offered only where it means something: blocks when the Property has two or
 * more, rooms-for when any room admits one gender only. A hotel with neither
 * keeps the screen it had.
 */

function Segmented({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex max-w-full min-w-0 items-center gap-2">
      <span className="shrink-0 text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <div
        aria-label={label}
        className="inline-flex max-w-full min-w-0 overflow-x-auto rounded-lg border bg-muted p-0.5 scrollbar-none"
        role="group"
      >
        {children}
      </div>
    </div>
  );
}

function Chip({
  count,
  label,
  onPress,
  pressed,
}: {
  count: number | null;
  label: string;
  onPress: () => void;
  pressed: boolean;
}) {
  return (
    <Button
      aria-pressed={pressed}
      className="h-7 shrink-0 gap-1.5 px-3 text-xs"
      onClick={onPress}
      size="sm"
      variant={pressed ? "default" : "ghost"}
    >
      {label}
      {count === null ? null : (
        <span
          className={cn(
            "tabular-nums",
            pressed ? "opacity-80" : "text-muted-foreground",
          )}
        >
          {count}
        </span>
      )}
    </Button>
  );
}

export function BedNarrowing({
  free,
  narrowing,
  onChange,
  rooms,
}: {
  rooms: readonly NarrowableRoom[];
  free: ReadonlySet<string> | null;
  narrowing: Narrowing;
  onChange: (next: Narrowing) => void;
}) {
  const t = useTranslations("bedNarrowing");
  const wording = useTranslations("roomAdmits");
  const rooming = useTranslations("roomsPage");
  const blocks = blocksOf(rooms);
  // Rooms recorded in no building are a block of their own once there is a
  // named one to tell them from, as Today's figures and `?block=none` say.
  const unbuilt = blocks.length > 0 && hasUnbuiltRooms(rooms);
  const offerBlocks = blocks.length + (unbuilt ? 1 : 0) >= 2;
  const offerAdmits = hasGenderedRooms(rooms);
  if (!offerBlocks && !offerAdmits) return null;

  const count = (next: Narrowing) =>
    free === null ? null : freeIn(rooms, free, next);
  const admitsLabel: Record<AdmitsFilter, string> = {
    female: wording("female"),
    male: wording("male"),
    anyone: wording("anyone"),
  };

  return (
    <div
      aria-label={t("groupLabel")}
      className="flex flex-wrap items-center gap-x-5 gap-y-2"
      role="region"
    >
      {offerBlocks ? (
        <Segmented label={t("blockLabel")}>
          <Chip
            count={count({ ...narrowing, block: null })}
            label={t("allBlocks")}
            onPress={() => onChange({ ...narrowing, block: null })}
            pressed={narrowing.block === null}
          />
          {blocks.map((block) => (
            <Chip
              count={count({ ...narrowing, block: { block } })}
              key={block}
              label={block}
              onPress={() => onChange({ ...narrowing, block: { block } })}
              pressed={narrowing.block?.block === block}
            />
          ))}
          {unbuilt ? (
            <Chip
              count={count({ ...narrowing, block: { block: null } })}
              label={rooming("otherRooms")}
              onPress={() => onChange({ ...narrowing, block: { block: null } })}
              pressed={
                narrowing.block !== null && narrowing.block.block === null
              }
            />
          ) : null}
        </Segmented>
      ) : null}
      {offerAdmits ? (
        <Segmented label={t("admitsLabel")}>
          <Chip
            count={count({ ...narrowing, admits: null })}
            label={t("allAdmits")}
            onPress={() => onChange({ ...narrowing, admits: null })}
            pressed={narrowing.admits === null}
          />
          {ADMITS_FILTERS.map((admits) => (
            <Chip
              count={count({ ...narrowing, admits })}
              key={admits}
              label={admitsLabel[admits]}
              onPress={() => onChange({ ...narrowing, admits })}
              pressed={narrowing.admits === admits}
            />
          ))}
        </Segmented>
      ) : null}
    </div>
  );
}
