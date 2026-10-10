"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button, FormError } from "@ranza/ui";
import { markRooms, type MarkOutcome } from "../../../server/housekeeping";
import type { CleanRow } from "../../../server/today-derive";

/**
 * Marking a room from the clean-first list: the board's own command
 * (`markRooms`), one room, and the next step for it — a dirty room is cleaned,
 * a clean one awaiting inspection is inspected (TD-S2-03).
 *
 * A room with somebody in it is not marked: it is cleaned once they have gone,
 * and the row says so in place of the button rather than offering one the
 * board would also refuse. The policy decides the rest; this only reports what
 * came back, as the board does.
 */
export function MarkRoomAction({
  locale,
  onDone,
  room,
}: {
  locale: string;
  /** Called once the room is marked: Today refreshes its figures. */
  onDone?: () => void;
  room: Pick<CleanRow, "inHouse" | "status" | "unitId">;
}) {
  const t = useTranslations("housekeeping");
  const dashboard = useTranslations("dashboard");
  const [outcome, act, pending] = useActionState<MarkOutcome, FormData>(
    markRooms,
    { status: "idle" },
  );
  useEffect(() => {
    if (outcome.status === "done") onDone?.();
  }, [outcome, onDone]);

  if (room.inHouse) {
    return (
      <span className="max-w-40 text-end text-xs text-muted-foreground">
        {dashboard("roomOccupiedNoMark")}
      </span>
    );
  }

  const next = room.status === "dirty" ? "clean" : "inspected";

  return (
    <form action={act} className="grid justify-items-end gap-1">
      <input name="locale" type="hidden" value={locale} />
      <input name="status" type="hidden" value={next} />
      <input name="unitId" type="hidden" value={room.unitId} />
      <Button disabled={pending} size="sm" type="submit" variant="outline">
        {pending
          ? t("saving")
          : next === "clean"
            ? t("markClean")
            : t("markInspected")}
      </Button>
      {outcome.status === "refused" ? (
        <div aria-live="polite">
          <FormError className="max-w-48 text-end">{t("refused")}</FormError>
        </div>
      ) : outcome.status === "invalid" ? (
        <div aria-live="polite">
          <FormError className="max-w-48 text-end">{t("invalid")}</FormError>
        </div>
      ) : null}
    </form>
  );
}
