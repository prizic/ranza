"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatNumber } from "@ranza/i18n";
import { cn } from "@ranza/ui";
import {
  cutoffTime,
  dayNumber,
  duration,
  money,
  percent,
  weekdayShort,
} from "../format";
import { todayHref } from "../links";
import { unitLabel } from "../../front-office/unit-label";
import {
  countsByState,
  houseFlow,
  isToCome,
  owedByDepartures,
  toMinutes,
  type HouseFlow,
} from "./model";
import {
  Eyebrow,
  Panel,
  StateBadge,
  usePropertyMinutes,
  type LayoutProps,
} from "./parts";
import { UnclosedDaysCard } from "./side-cards";

const WATERFALL_HEIGHT = 150;
const NIGHTS_SHOWN = 7;

interface Step {
  key:
    | "startOfDay"
    | "left"
    | "arrived"
    | "stillLeaving"
    | "stillArriving"
    | "tonight";
  /** The size of the step, shown as a figure. */
  value: number;
  /** Where the bar sits on the scale, and how tall it is. */
  base: number;
  size: number;
  sign: "" | "−" | "+";
  pending: boolean;
}

/** The house across the day as a waterfall: each step starts where the last ended. */
function stepsFor(flow: HouseFlow): Step[] {
  const afterLeft = flow.startOfDay - flow.left;
  const inHouse = afterLeft + flow.arrived;
  const afterLeaving = inHouse - flow.stillLeaving;
  return [
    {
      key: "startOfDay",
      value: flow.startOfDay,
      base: 0,
      size: flow.startOfDay,
      sign: "",
      pending: false,
    },
    {
      key: "left",
      value: flow.left,
      base: afterLeft,
      size: flow.left,
      sign: "−",
      pending: false,
    },
    {
      key: "arrived",
      value: flow.arrived,
      base: afterLeft,
      size: flow.arrived,
      sign: "+",
      pending: false,
    },
    {
      key: "stillLeaving",
      value: flow.stillLeaving,
      base: afterLeaving,
      size: flow.stillLeaving,
      sign: "−",
      pending: true,
    },
    {
      key: "stillArriving",
      value: flow.stillArriving,
      base: afterLeaving,
      size: flow.stillArriving,
      sign: "+",
      pending: true,
    },
    {
      key: "tonight",
      value: flow.tonight,
      base: 0,
      size: flow.tonight,
      sign: "",
      pending: false,
    },
  ];
}

const BAR: Record<Step["key"], string> = {
  startOfDay: "bg-line-strong",
  left: "bg-danger-soft ring-1 ring-danger ring-inset",
  arrived: "bg-success-soft ring-1 ring-success ring-inset",
  stillLeaving:
    "ring-[1.5px] ring-info ring-inset [background-image:repeating-linear-gradient(135deg,transparent_0_5px,color-mix(in_srgb,var(--info)_25%,transparent)_5px_7px)]",
  stillArriving:
    "ring-[1.5px] ring-info ring-inset [background-image:repeating-linear-gradient(135deg,transparent_0_5px,color-mix(in_srgb,var(--info)_25%,transparent)_5px_7px)]",
  tonight: "bg-primary",
};

/**
 * Today after dark: what the house did, what is still open, what the morning
 * will ask. For the night shift and the hand-over, when the question is no
 * longer "who is next" but "what am I leaving behind".
 */
export function NightLayout({
  desk,
  locale,
  nowMs,
  scope,
  summary,
}: LayoutProps) {
  const t = useTranslations("todayLayouts");
  const nowMinutes = usePropertyMinutes(nowMs, summary.day.timezone);
  const occupancy =
    summary.occupancy?.status === "ok" ? summary.occupancy.data : null;
  const flow = occupancy ? houseFlow(desk, occupancy) : null;
  const counts = countsByState(desk.rooms);
  const toCome = desk.arrivals.filter(isToCome);
  const unclosed =
    desk.unclosed?.status === "ok" && desk.unclosed.data.waiting > 0
      ? desk.unclosed.data
      : null;
  const nights =
    summary.booked?.status === "ok"
      ? summary.booked.data.nights.slice(0, NIGHTS_SHOWN)
      : null;
  const owed = summary.money?.status === "ok" ? summary.money.data : null;
  const id = scope.propertyId;
  const n = (value: number) => formatNumber(value, locale);

  // The working day ends at the cutoff on the next calendar day, or today's
  // when the clock has passed midnight and the day is still yesterday's.
  const cutoff = toMinutes(summary.day.cutoff);
  const untilClose =
    summary.day.calendarDate === summary.day.businessDate
      ? 24 * 60 - nowMinutes + cutoff
      : cutoff - nowMinutes;

  const overdueGuests = desk.departures.filter((d) => d.overdue);
  const handover: {
    key: string;
    tone: "late" | "risk" | "info";
    title: string;
    body: string;
    href: string;
    open: string;
  }[] = [];
  const longestOverdue = overdueGuests.reduce<
    (typeof overdueGuests)[number] | null
  >(
    (longest, d) =>
      longest === null || d.overdueDays > longest.overdueDays ? d : longest,
    null,
  );
  if (longestOverdue) {
    const owedOverdue = owedByDepartures(overdueGuests);
    handover.push({
      key: "overdue",
      tone: "late",
      title: t("night.hand.overdue", { count: overdueGuests.length }),
      body: [
        t("night.hand.overdueBody", {
          guest: longestOverdue.guestName,
          room: unitLabel(
            longestOverdue.unit.roomName,
            longestOverdue.unit.unitName,
          ),
          days: longestOverdue.overdueDays,
        }),
        owedOverdue !== null && owedOverdue > 0
          ? t("night.hand.overdueOwed", {
              amount: money(
                [{ amountMinor: owedOverdue, currency: summary.day.currency }],
                summary.day.currency,
                locale,
              ),
            })
          : null,
      ]
        .filter((part) => part !== null)
        .join(" "),
      href: todayHref(locale, "departures", id),
      open: t("open.departures"),
    });
  }
  if (toCome.length > 0) {
    handover.push({
      key: "arrivals",
      tone: "late",
      title: t("night.hand.arrivals", { count: toCome.length }),
      body: toCome
        .slice(0, 3)
        .map(
          (a) =>
            `${a.guestName ?? a.reference} · ${unitLabel(a.unit.roomName, a.unit.unitName)}`,
        )
        .join(" · "),
      href: todayHref(locale, "arrivals", id),
      open: t("open.arrivals"),
    });
  }
  if (unclosed) {
    handover.push({
      key: "unclosed",
      tone: "risk",
      title: t("night.hand.unclosed", { count: unclosed.waiting }),
      body: t("night.hand.unclosedBody"),
      href: todayHref(locale, "close-day", id),
      open: t("unclosed.open"),
    });
  }
  if (owed && owed.openOwing > 0) {
    handover.push({
      key: "balances",
      tone: "risk",
      title: t("night.hand.balances", { count: owed.openOwing }),
      body: money(owed.openOwed, summary.day.currency, locale),
      href: todayHref(locale, "finance", id),
      open: t("open.finance"),
    });
  }
  if (counts.out_of_service > 0) {
    handover.push({
      key: "outOfService",
      tone: "info",
      title: t("night.hand.outOfService", { count: counts.out_of_service }),
      body: t("night.hand.outOfServiceBody", {
        count: desk.rooms.length - counts.out_of_service,
      }),
      href: todayHref(locale, "housekeeping", id),
      open: t("open.housekeeping"),
    });
  }

  const scale = flow
    ? Math.max(1, ...stepsFor(flow).map((step) => step.base + step.size))
    : 1;
  const vacant = desk.rooms.length - counts.in_house - counts.out_of_service;

  return (
    <div
      className="flex flex-col gap-6 rounded-[2rem] bg-background p-5 text-foreground md:p-8"
      data-surface="night"
    >
      <section className="grid items-end gap-10 border-b border-border pb-10 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <Eyebrow>{t("night.eyebrow")}</Eyebrow>
          <p className="mt-3 max-w-[18ch] text-5xl leading-none font-light tracking-tight md:text-6xl">
            <span className="font-medium text-primary">
              {t("night.inHouse", { count: counts.in_house })}
            </span>{" "}
            {toCome.length > 0 ? (
              <span className="text-warning">
                {t("night.expected", { count: toCome.length })}
              </span>
            ) : (
              t("night.allIn")
            )}
          </p>
          {flow ? (
            <p className="mt-5 max-w-prose text-muted-foreground">
              {t("night.tonightLine", {
                tonight: n(flow.tonight),
                available: n(flow.available),
                percent: percent(flow.tonight, flow.available, locale) ?? "",
              })}
              {flow.overdueStaying > 0
                ? ` ${t("night.overdueNote", { count: flow.overdueStaying })}`
                : null}
            </p>
          ) : null}
        </div>
        {flow ? (
          <ol
            aria-label={t("night.waterfall")}
            className="grid grid-cols-6 items-end gap-3"
            style={{ height: WATERFALL_HEIGHT + 96 }}
          >
            {stepsFor(flow).map((step) => (
              <li
                className="flex h-full flex-col justify-end gap-2"
                key={step.key}
              >
                <span className="text-3xl leading-none font-light tabular-nums">
                  {step.sign}
                  {n(step.value)}
                </span>
                <span
                  aria-hidden="true"
                  className={cn("rounded-lg", BAR[step.key])}
                  style={{ height: (step.size / scale) * WATERFALL_HEIGHT }}
                />
                <span
                  aria-hidden="true"
                  style={{ height: (step.base / scale) * WATERFALL_HEIGHT }}
                />
                <span className="min-h-9 text-xs leading-tight text-muted-foreground">
                  {t(`night.step.${step.key}`)}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {unclosed ? (
          <div className="flex flex-col gap-4">
            <UnclosedDaysCard
              locale={locale}
              oldest={unclosed.oldest}
              propertyId={id}
              waiting={unclosed.waiting}
            />
            <p className="flex items-baseline justify-between border-t border-border px-2 pt-3 text-sm text-muted-foreground">
              {t("night.endsAt", {
                time: cutoffTime(summary.day.cutoff, locale),
              })}
              <span className="text-3xl font-light text-foreground tabular-nums">
                {duration(untilClose, locale)}
              </span>
            </p>
          </div>
        ) : (
          <Panel className="border-border">
            <h2 className="text-xl font-semibold tracking-tight">
              {t("night.allClosed")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("night.endsAt", {
                time: cutoffTime(summary.day.cutoff, locale),
              })}{" "}
              {duration(untilClose, locale)}
            </p>
          </Panel>
        )}

        {nights ? (
          <Panel className="border-border" labelledBy="outlook-title">
            <Eyebrow>{t("night.outlookEyebrow")}</Eyebrow>
            <h2
              className="mt-3 text-xl font-semibold tracking-tight"
              id="outlook-title"
            >
              {t("night.outlook")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("night.outlookHint")}
            </p>
            <ol className="mt-5 flex h-48 items-end gap-1.5">
              {nights.map((night, index) => (
                <li
                  className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"
                  key={night.day}
                >
                  <span className="text-lg font-light tabular-nums">
                    {n(night.booked)}
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "w-full rounded-md",
                      index === 0 ? "bg-primary" : "bg-line-strong",
                    )}
                    style={{
                      height: `${Math.min(100, (night.booked / Math.max(1, night.inUse)) * 100)}%`,
                    }}
                  />
                  <span className="flex w-full min-w-0 flex-col items-center text-[10px] leading-tight text-muted-foreground">
                    <span className="w-full truncate text-center">
                      {weekdayShort(night.day, locale)}
                    </span>
                    <span className="font-mono tabular-nums">
                      {dayNumber(night.day, locale)}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </Panel>
        ) : null}

        <Panel className="border-border" labelledBy="morning-title">
          <Eyebrow>{t("night.morningEyebrow")}</Eyebrow>
          <h2
            className="mt-3 text-xl font-semibold tracking-tight"
            id="morning-title"
          >
            {t("night.morning")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("night.morningHint", { count: vacant })}
          </p>
          <p className="mt-5 flex items-baseline gap-2">
            <span className="text-7xl leading-none font-extralight tabular-nums">
              {n(counts.ready)}
            </span>
            <span className="text-3xl font-light text-muted-foreground">
              /{n(vacant)}
            </span>
          </p>
          <ul className="mt-5 grid gap-2.5">
            {(
              [
                "ready",
                "awaiting_inspection",
                "dirty",
                "out_of_service",
              ] as const
            ).map((state) => (
              <li
                className="flex items-center justify-between text-sm"
                key={state}
              >
                <StateBadge state={state} />
                <span className="font-semibold tabular-nums">
                  {n(counts[state])}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel className="border-border" labelledBy="hand-title">
        <div className="flex items-baseline justify-between">
          <h2 className="text-2xl font-semibold tracking-tight" id="hand-title">
            {t("night.hand.title")}
          </h2>
        </div>
        {handover.length === 0 ? (
          <p className="mt-4 text-muted-foreground">{t("night.hand.none")}</p>
        ) : (
          <ol className="mt-4">
            {handover.map((item, index) => (
              <li
                className="grid grid-cols-[3rem_1fr] items-center gap-x-5 gap-y-3 border-t border-border py-5 sm:grid-cols-[3rem_1fr_auto]"
                key={item.key}
              >
                <span
                  className={cn(
                    "text-4xl font-light tabular-nums",
                    item.tone === "late" && "text-danger",
                    item.tone === "risk" && "text-warning",
                    item.tone === "info" && "text-muted-foreground",
                  )}
                >
                  {n(index + 1)}
                </span>
                <div>
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.body}</p>
                </div>
                <Link
                  className="col-span-2 inline-flex min-h-9 items-center justify-self-start rounded-full border border-line-strong px-4 text-sm font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:col-span-1 sm:justify-self-end"
                  href={item.href}
                >
                  {item.open}
                </Link>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}
