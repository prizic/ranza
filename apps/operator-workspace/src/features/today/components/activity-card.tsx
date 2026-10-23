"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import type { SupportedLocale } from "@ranza/i18n";
import { Avatar, AvatarFallback, cn } from "@ranza/ui";
import type {
  ActivityCard as Activity,
  ActivityRow,
  Section,
} from "../../../server/today-derive";
import { isKnownAction, readAs, shortId } from "../../audit-log/actions";
import { whenLabel } from "../../audit-log/words";
import { todayHref } from "../links";
import { SectionUnavailable } from "./section-unavailable";

function initialsOf(name: string): string {
  const [first = "", second = ""] = name.trim().split(/[\s@.]+/);
  return (
    [...Array.from(first).slice(0, 1), ...Array.from(second).slice(0, 1)]
      .join("")
      .toUpperCase() || "?"
  );
}

/**
 * The newest records of the audit log the viewer may read (TD-S3-01), each
 * opening that record. It follows `audit.read`: the server sends it to nobody
 * else, so the card is absent for them, not hidden.
 */
export function ActivityCard({
  activity,
  locale,
  onRetry,
  propertyId,
  userId,
}: {
  activity: Section<Activity>;
  locale: SupportedLocale;
  onRetry: () => void;
  propertyId: string;
  /** The viewer, whom the log calls "you". */
  userId: string;
}) {
  const t = useTranslations("dashboard");
  const words = useTranslations();

  const what = (row: ActivityRow) => {
    const read = readAs(row.action, row.subjectType);
    return isKnownAction(read) ? words(`auditAction.${read}`) : read;
  };
  const who = (row: ActivityRow) =>
    row.actorId === userId ? words("you") : (row.actor ?? shortId(row.actorId));

  return (
    <section
      aria-labelledby="today-activity"
      className={cn(
        "rounded-[2rem] border border-slate-100 bg-card p-5 md:p-6",
        activity.status === "ok" && activity.stale && "opacity-70",
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold" id="today-activity">
          {t("activityTitle")}
        </h2>
        <Link
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          href={todayHref(locale, "audit-log", propertyId)}
        >
          {t("openAuditLog")}
          <ArrowRight aria-hidden="true" className="size-3 rtl:rotate-180" />
        </Link>
      </div>
      {activity.status === "unavailable" ? (
        <SectionUnavailable onRetry={onRetry} />
      ) : activity.data.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("activityEmpty")}</p>
      ) : (
        <ul className="grid gap-0.5">
          {activity.data.rows.map((row) => (
            <li key={row.recordId}>
              <Link
                className="grid grid-cols-[2rem_1fr] items-start gap-3 rounded-2xl px-2 py-2 text-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                href={todayHref(locale, "audit-log", propertyId, {
                  record: row.recordId,
                })}
                prefetch={false}
              >
                <Avatar className="size-8 text-xs">
                  <AvatarFallback>{initialsOf(who(row))}</AvatarFallback>
                </Avatar>
                <span className="min-w-0">
                  <span className="block font-medium">
                    {what(row)}
                    {row.subject ? (
                      <>
                        {" · "}
                        <bdi>{row.subject}</bdi>
                      </>
                    ) : null}
                  </span>
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    <bdi>{who(row)}</bdi>
                    {" · "}
                    <time dateTime={row.at}>
                      {whenLabel(new Date(row.at), locale, row.timeZone)}
                    </time>
                    {row.propertyName ? (
                      <>
                        {" · "}
                        <bdi>{row.propertyName}</bdi>
                      </>
                    ) : null}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
