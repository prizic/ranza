"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { CalendarCheck, DoorOpen, Info } from "lucide-react";
import type {
  HousekeepingBoard as Board,
  HousekeepingRoom,
  HousekeepingStatus,
} from "@ranza/housekeeping";
import type { SupportedLocale } from "@ranza/i18n";
import {
  Button,
  DataTable,
  EmptyState,
  FormError,
  PageHeader,
  Stat,
} from "@ranza/ui";
import { useTableLabels } from "../../../lib/table-labels";
import { markRooms, type MarkOutcome } from "../../../server/housekeeping";
import { MARK_LABEL, MARKS, useHousekeepingColumns } from "./columns";
import { STATUS_LOOK } from "./status";

/**
 * The Housekeeping board (RANZ-28): every room at a Property, whether it needs
 * cleaning, and marking one room or many.
 *
 * Presentational apart from the mark: the board arrives through the server
 * funnel, and the mark goes back through a server action whose write the
 * policies bound. One action state for the whole board, so every mark control
 * is disabled while one is in flight and a double press cannot send two
 * (HK-S2-06).
 *
 * A selection is cleared when a mark lands. A refusal is followed by the board
 * the page revalidates to, which is read-only when the refusal was the viewer's
 * permission going, and then shows no selection control at all (HK-S2-13,
 * decided by the product owner, 2026-09-24).
 */
export function HousekeepingBoard({
  board,
  locale,
  markLimit,
  propertyName,
  timeZone,
}: {
  board: Board;
  locale: SupportedLocale;
  /** The most rooms one mark may name; the module refuses more. */
  markLimit: number;
  propertyName: string;
  timeZone: string;
}) {
  const t = useTranslations("housekeeping");
  const labels = useTableLabels();
  const [outcome, dispatch, pending] = useActionState<MarkOutcome, FormData>(
    markRooms,
    { status: "idle" },
  );
  const clearSelection = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (outcome.status === "done") {
      clearSelection.current?.();
      clearSelection.current = null;
    }
  }, [outcome]);

  function mark(unitIds: string[], status: HousekeepingStatus) {
    const form = new FormData();
    form.set("locale", locale);
    form.set("status", status);
    for (const unitId of unitIds) form.append("unitId", unitId);
    startTransition(() => dispatch(form));
  }

  const columns = useHousekeepingColumns({
    locale,
    timeZone,
    mayMark: board.mayMark,
    pending,
    onMark: mark,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader>
        {/* h2: the page bar (AppPageBar) already sets this route's one h1. */}
        <h2 className="text-step-2 font-semibold tracking-tight">
          {t("subtitle", { property: propertyName })}
        </h2>
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Stat
          icon={DoorOpen}
          label={t("statRooms")}
          value={board.counts.rooms}
        />
        <Stat
          icon={STATUS_LOOK.dirty.icon}
          label={t("statDirty")}
          value={board.counts.dirty}
        />
        <Stat
          icon={STATUS_LOOK.clean.icon}
          label={t("statClean")}
          value={board.counts.clean}
        />
        <Stat
          icon={STATUS_LOOK.inspected.icon}
          label={t("statInspected")}
          value={board.counts.inspected}
        />
        <Stat
          icon={CalendarCheck}
          label={t("statReady")}
          value={board.counts.ready}
        />
      </div>

      {/* Only over rooms: on an empty board the notice would claim a
          restriction about nothing, beside a Property that has no rooms yet. */}
      {board.mayMark || board.rooms.length === 0 ? null : (
        <p className="flex items-start gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-step--1 text-muted-foreground">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t("readOnly")}
        </p>
      )}

      <div aria-live="polite" className="min-h-5">
        {outcome.status === "done" && outcome.marked !== undefined ? (
          <p className="text-step--1 text-success">
            {t("marked", { count: outcome.marked })}
          </p>
        ) : outcome.status === "refused" ? (
          <FormError>{t("refused")}</FormError>
        ) : outcome.status === "invalid" ? (
          <FormError>{t("invalid")}</FormError>
        ) : null}
      </div>

      <DataTable<HousekeepingRoom, unknown>
        {...(board.mayMark
          ? {
              bulkActions: (selected, clear) => {
                // Selection spans pages, so it can outgrow one mark before
                // anything is sent; saying so here beats a refusal after it.
                const tooMany = selected.length > markLimit;
                return (
                  <>
                    {MARKS.map((status) => {
                      const Icon = STATUS_LOOK[status].icon;
                      return (
                        <Button
                          disabled={pending || tooMany}
                          key={status}
                          onClick={() => {
                            clearSelection.current = clear;
                            mark(
                              selected.map((room) => room.unitId),
                              status,
                            );
                          }}
                          size="sm"
                          variant="outline"
                        >
                          <Icon aria-hidden="true" className="size-4" />
                          {pending ? t("saving") : t(MARK_LABEL[status])}
                        </Button>
                      );
                    })}
                    {tooMany ? (
                      <span className="text-step--1 text-destructive">
                        {t("invalid")}
                      </span>
                    ) : null}
                  </>
                );
              },
            }
          : {})}
        caption={t("subtitle", { property: propertyName })}
        columns={columns}
        data={board.rooms}
        empty={
          <EmptyState
            description={t("noRoomsDescription")}
            title={t("noRoomsTitle")}
          />
        }
        getRowId={(room) => room.unitId}
        facets={[
          {
            columnId: "status",
            title: t("status"),
            options: MARKS.map((status) => ({
              label: t(status),
              value: status,
              icon: STATUS_LOOK[status].icon,
            })),
          },
        ]}
        labels={labels}
        searchColumns={["name", "building"]}
      />
    </div>
  );
}
