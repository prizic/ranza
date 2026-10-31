"use client";

import { EmptyBedsCard } from "../components/empty-beds-card";
import { OpenWorkCard } from "../components/open-work-card";
import type { LayoutProps } from "./parts";

/**
 * What a dormitory's manager reads first, under whichever desk layout was
 * chosen: how many beds are empty, and what is still open (RB-DEF-05). The
 * timeline and the overview place the same two cards in their own side column,
 * so no layout hides a figure the others show. Nothing at a Property without
 * either.
 */
export function DormitoryCards({
  locale,
  onChanged,
  scope,
  summary,
}: Pick<LayoutProps, "locale" | "onChanged" | "scope" | "summary">) {
  const emptyBeds =
    summary.emptyBeds?.status === "ok" ? summary.emptyBeds.data : null;
  if (!emptyBeds && !summary.openWork) return null;

  return (
    <div className="grid items-start gap-6 md:grid-cols-2">
      {emptyBeds ? (
        <EmptyBedsCard
          data={emptyBeds}
          locale={locale}
          propertyId={scope.propertyId}
        />
      ) : null}
      {summary.openWork ? (
        <OpenWorkCard
          locale={locale}
          onRetry={onChanged}
          propertyId={scope.propertyId}
          work={summary.openWork}
        />
      ) : null}
    </div>
  );
}
