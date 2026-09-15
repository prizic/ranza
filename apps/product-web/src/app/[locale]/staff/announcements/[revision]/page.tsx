import type { AnnouncementFollowupRow } from "@ranza/domain";
import { isSupportedLocale } from "@ranza/i18n";
import { Badge, Button, Card, EmptyState } from "@ranza/ui";
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
      <header className="page-intro page-intro-compact">
        <h1>
          {t.history} · {detail.revision_number}
        </h1>
      </header>
      <Card className="announcement-card">
        <p
          lang={detail.source_locale}
          dir={detail.source_locale === "ar" ? "rtl" : "ltr"}
          style={{ whiteSpace: "pre-wrap" }}
        >
          {detail.source_content}
        </p>
        <p>
          {t.published}:{" "}
          <time dateTime={detail.published_at}>
            {date(detail.published_at)}
          </time>
        </p>
        {detail.archived_at && (
          <p>
            {t.archived}:{" "}
            <time dateTime={detail.archived_at}>
              {date(detail.archived_at)}
            </time>
          </p>
        )}
      </Card>
      <form method="get" className="filter-bar">
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
        <Button type="submit">{t.filter}</Button>
      </form>
      <a
        className="button button-secondary"
        href={`/api/announcements/${revision}/export?status=${status}`}
      >
        {t.export}
      </a>
      {detail.recipients.length === 0 ? (
        <EmptyState
          title={t.history}
          description={t[status as keyof typeof t] as string}
        />
      ) : null}
      <ul className="recipient-list">
        {detail.recipients.map((recipient) => (
          <li
            key={recipient.student_id}
            className="card card-compact card-default"
          >
            <strong>{recipient.display_name}</strong>
            <Badge>{t[recipient.status]}</Badge>
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
