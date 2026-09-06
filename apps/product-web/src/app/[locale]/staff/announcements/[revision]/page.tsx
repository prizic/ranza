import type { AnnouncementFollowupRow } from "@ranza/domain";
import { isSupportedLocale } from "@ranza/i18n";
import { notFound, redirect } from "next/navigation";
import { LocalizedShell } from "../../../../../components/localized-shell";
import { createProductWebClient } from "../../../../../lib/supabase/server";
import { announcementCopy } from "../../../../../lib/announcement-copy";

interface Followup {
  revision_number: number;
  published_at: string;
  archived_at: string | null;
  source_locale: string;
  source_content: string;
  recipients: AnnouncementFollowupRow[];
}
export default async function AnnouncementHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; revision: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const [{ locale, revision }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  if (!isSupportedLocale(locale)) notFound();
  const status = ["all", "acknowledged", "unacknowledged", "inactive"].includes(
    query.status ?? "",
  )
    ? (query.status ?? "all")
    : "all";
  const client = await createProductWebClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect(`/${locale}/staff/sign-in`);
  const { data, error } = await client.rpc("announcement_followup", {
    target_revision_id: revision,
    target_status: status,
    record_export: false,
  });
  if (error || !data) notFound();
  const detail = data as Followup;
  const t = announcementCopy[locale];
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  return (
    <LocalizedShell locale={locale}>
      <h1>
        {t.history} · {detail.revision_number}
      </h1>
      <p
        lang={detail.source_locale}
        dir={detail.source_locale === "ar" ? "rtl" : "ltr"}
        style={{ whiteSpace: "pre-wrap" }}
      >
        {detail.source_content}
      </p>
      <p>
        {t.published}:{" "}
        <time dateTime={detail.published_at}>{date(detail.published_at)}</time>
      </p>
      {detail.archived_at && (
        <p>
          {t.archived}:{" "}
          <time dateTime={detail.archived_at}>{date(detail.archived_at)}</time>
        </p>
      )}
      <form method="get">
        <label>
          {t.filter}
          <select name="status" defaultValue={status}>
            {(
              ["all", "acknowledged", "unacknowledged", "inactive"] as const
            ).map((key) => (
              <option key={key} value={key}>
                {t[key]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">{t.filter}</button>
      </form>
      <a href={`/api/announcements/${revision}/export?status=${status}`}>
        {t.export}
      </a>
      <ul>
        {detail.recipients.map((recipient) => (
          <li key={recipient.student_id} className="control-card">
            <strong>{recipient.display_name}</strong>
            <p>{t[recipient.status]}</p>
            <p>
              {t.resolved}:{" "}
              <time dateTime={recipient.resolved_at}>
                {date(recipient.resolved_at)}
              </time>
            </p>
            {recipient.acknowledged_at && (
              <p>
                {t.acknowledged}:{" "}
                <time dateTime={recipient.acknowledged_at}>
                  {date(recipient.acknowledged_at)}
                </time>
              </p>
            )}
          </li>
        ))}
      </ul>
    </LocalizedShell>
  );
}
