"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatNumber, type SupportedLocale } from "@ranza/i18n";
import { cn } from "@ranza/ui";
import type { EmptyBedsCard as EmptyBeds } from "../../../server/today-derive";
import { Panel } from "../layouts/parts";
import { FREE_FILTER_KEY } from "../views";
import { todayHref } from "../links";
import { ADMITS_FILTERS, blockParam, type AdmitsFilter } from "../views";

/**
 * How many beds can still be given tonight to a woman, a man, or anybody
 * (RB-S5-20): a dormitory manager's first question of the day. Each figure
 * opens Rooms narrowed to the free places it counts, which say so and give the
 * same number back.
 *
 * Where the rooms name their buildings the answer is given building by
 * building, under the house's own, so the question "which block has room for a
 * woman" is read down a column rather than found on three screens.
 */
export function EmptyBedsCard({
  data,
  locale,
  propertyId,
}: {
  data: EmptyBeds;
  locale: SupportedLocale;
  propertyId: string;
}) {
  const t = useTranslations("dashboard");
  const admits = useTranslations("roomAdmits");
  return (
    <Panel labelledBy="empty-beds-title">
      <h2
        className="text-xl font-semibold tracking-tight"
        id="empty-beds-title"
      >
        {t("emptyBedsTitle", { unit: data.byBed ? "bed" : "room" })}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("emptyBedsHint")}</p>
      {data.blocks.length > 0 ? (
        <ByBlock data={data} locale={locale} propertyId={propertyId} />
      ) : (
        <ul className="mt-5 grid grid-cols-3 gap-2">
          {ADMITS_FILTERS.map((filter) => (
            <li key={filter}>
              <Link
                aria-label={t(FREE_FILTER_KEY[filter], { count: data[filter] })}
                className="flex h-full flex-col gap-1 rounded-2xl border border-border p-3 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                href={todayHref(locale, "rooms", propertyId, {
                  show: "free",
                  admits: filter,
                })}
                prefetch={false}
              >
                <span className="text-3xl font-light tracking-tight tabular-nums">
                  {formatNumber(data[filter], locale)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {admits(filter)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** The house's figures, then each building's, one column for each whom a room admits. */
function ByBlock({
  data,
  locale,
  propertyId,
}: {
  data: EmptyBeds;
  locale: SupportedLocale;
  propertyId: string;
}) {
  const t = useTranslations("dashboard");
  const rooms = useTranslations("roomsPage");
  const admits = useTranslations("roomAdmits");

  return (
    <table className="mt-5 w-full table-fixed border-separate border-spacing-y-1">
      <thead>
        <tr>
          <td className="w-[28%]" />
          {ADMITS_FILTERS.map((filter) => (
            <th
              className="pb-1 text-start text-xs font-normal text-muted-foreground"
              key={filter}
              scope="col"
            >
              {admits(filter)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <Row
          figure={(filter) => ({
            count: data[filter],
            label: t(FREE_FILTER_KEY[filter], { count: data[filter] }),
            href: todayHref(locale, "rooms", propertyId, {
              show: "free",
              admits: filter,
            }),
          })}
          large
          locale={locale}
          name={t("emptyBedsAllBlocks")}
        />
        {data.blocks.map((block) => {
          const name = block.block ?? rooms("otherRooms");
          return (
            <Row
              figure={(filter) => ({
                count: block[filter],
                label: t("filterFreeInBlock", {
                  count: block[filter],
                  admits: filter,
                  block: name,
                }),
                href: todayHref(locale, "rooms", propertyId, {
                  show: "free",
                  admits: filter,
                  block: blockParam(block.block),
                }),
              })}
              key={block.block ?? "none"}
              locale={locale}
              name={name}
            />
          );
        })}
      </tbody>
    </table>
  );
}

function Row({
  figure,
  large = false,
  locale,
  name,
}: {
  figure: (filter: AdmitsFilter) => {
    count: number;
    label: string;
    href: string;
  };
  large?: boolean;
  locale: SupportedLocale;
  name: string;
}) {
  return (
    <tr>
      <th
        className={cn(
          "pe-2 text-start align-middle text-sm",
          large ? "font-semibold" : "font-medium text-muted-foreground",
        )}
        scope="row"
      >
        <bdi>{name}</bdi>
      </th>
      {ADMITS_FILTERS.map((filter) => {
        const { count, label, href } = figure(filter);
        return (
          <td className="p-0" key={filter}>
            <Link
              aria-label={label}
              className={cn(
                "block rounded-xl px-2 py-1.5 font-light tracking-tight tabular-nums transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                large ? "text-4xl" : "text-2xl",
                count === 0 && "text-muted-foreground/60",
              )}
              href={href}
              prefetch={false}
            >
              {formatNumber(count, locale)}
            </Link>
          </td>
        );
      })}
    </tr>
  );
}
