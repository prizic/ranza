import { isSupportedLocale } from "@ranza/i18n";
import { Badge, Button, Card, EmptyState, StatusMessage } from "@ranza/ui";
import { notFound, redirect } from "next/navigation";
import { LocalizedShell } from "../../../../components/localized-shell";
import { createProductWebClient } from "../../../../lib/supabase/server";
import { announcementCopy } from "../../../../lib/announcement-copy";
import { manageAnnouncementAction } from "./actions";

export default async function StaffAnnouncementsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ operator?: string; result?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isSupportedLocale(locale)) notFound();
  const client = await createProductWebClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect(`/${locale}/staff/sign-in`);
  const { data: access, error: accessError } = await client
    .from("staff_branch_access")
    .select("operator_id,branch_id,branch_name,capability")
    .eq("auth_user_id", auth.user.id)
    .eq("capability", "workflow.manage");
  const operators = [
    ...new Set((access ?? []).map((row) => String(row.operator_id))),
  ];
  const operator =
    query.operator && operators.includes(query.operator)
      ? query.operator
      : operators[0];
  if (accessError || !operator)
    redirect(`/${locale}/staff/sign-in?error=not-authorized`);
  const branches = Array.from(
    new Map(
      (access ?? [])
        .filter((row) => row.operator_id === operator)
        .map((row) => [row.branch_id, row]),
    ).values(),
  );
  const { data: announcements, error } = await client
    .from("announcements")
    .select("id,status,source_content,current_revision")
    .eq("operator_id", operator)
    .order("created_at", { ascending: false });
  const { data: counts, error: countError } = await client
    .from("announcement_followup_counts")
    .select("revision_id,acknowledged,unacknowledged,inactive")
    .eq("operator_id", operator);
  const { data: revisions, error: revisionError } = await client
    .from("announcement_revisions")
    .select("id,announcement_id,revision_number")
    .eq("operator_id", operator);
  const t = announcementCopy[locale];
  return (
    <LocalizedShell locale={locale}>
      <header className="page-intro page-intro-compact">
        <h1>{t.manage}</h1>
      </header>
      {(error || countError || revisionError || query.result === "failed") && (
        <StatusMessage tone="warning">{t.error}</StatusMessage>
      )}
      {query.result === "saved" && (
        <StatusMessage tone="success">{t.saved}</StatusMessage>
      )}
      <nav className="branch-switcher" aria-label={t.operator}>
        {operators.map((id) => (
          <a key={id} href={`/${locale}/staff/announcements?operator=${id}`}>
            {(access ?? []).find((b) => b.operator_id === id)?.branch_name ??
              t.operator}
          </a>
        ))}
      </nav>
      <Card>
        <form action={manageAnnouncementAction} className="control-form">
          <p>{t.reviseHint}</p>
          <label>
            {t.revisionOf}
            <select name="announcement" defaultValue="">
              <option value="">{t.chooseRevision}</option>
              {(announcements ?? [])
                .filter((item) => item.status === "published")
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.source_content.slice(0, 80)}
                  </option>
                ))}
            </select>
          </label>
          <input name="locale" type="hidden" value={locale} />
          <input name="operator" type="hidden" value={operator} />
          <label>
            {t.scope}
            <select name="scope" defaultValue="branches">
              <option value="branches">{t.branches}</option>
              <option value="operator">{t.operator}</option>
            </select>
          </label>
          <fieldset>
            <legend>{t.branches}</legend>
            {branches.map((branch) => (
              <label key={branch.branch_id}>
                <input name="branch" type="checkbox" value={branch.branch_id} />
                {branch.branch_name}
              </label>
            ))}
          </fieldset>
          <label>
            {t.source}
            <select name="source" defaultValue={locale}>
              {(["tr", "en", "ar"] as const).map((key) => (
                <option key={key} value={key}>
                  {t[key]}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.content}
            <textarea name="content" required maxLength={10000} rows={5} />
          </label>
          <fieldset>
            <legend>{t.translations}</legend>
            {(["tr", "en", "ar"] as const).map((key) => (
              <label key={key}>
                {t[key]}
                <textarea
                  name={key}
                  maxLength={10000}
                  rows={3}
                  dir={key === "ar" ? "rtl" : "ltr"}
                />
              </label>
            ))}
          </fieldset>
          <Button name="operation" value="draft" type="submit">
            {t.draft}
          </Button>
          <Button
            tone="secondary"
            name="operation"
            value="revise"
            type="submit"
          >
            {t.revise}
          </Button>
        </form>
      </Card>
      {(announcements ?? []).length === 0 ? (
        <EmptyState title={t.manage} description={t.history} />
      ) : null}
      {(announcements ?? []).map((item) => {
        const revision = revisions?.find(
          (row) =>
            row.announcement_id === item.id &&
            row.revision_number === item.current_revision,
        );
        const totals = (counts ?? []).find(
          (row) => row.revision_id === revision?.id,
        );
        return (
          <Card key={item.id} className="announcement-card">
            <Badge
              tone={
                item.status === "published"
                  ? "success"
                  : item.status === "draft"
                    ? "info"
                    : "neutral"
              }
            >
              {item.status === "draft"
                ? t.draftStatus
                : item.status === "published"
                  ? t.published
                  : t.archived}
            </Badge>
            <p style={{ whiteSpace: "pre-wrap" }}>{item.source_content}</p>
            {revision && !countError && (
              <dl>
                {(["acknowledged", "unacknowledged", "inactive"] as const).map(
                  (status) => (
                    <div key={status}>
                      <dt>{t[status]}</dt>
                      <dd>{totals?.[status] ?? 0}</dd>
                    </div>
                  ),
                )}
              </dl>
            )}
            {item.status !== "archived" && (
              <form action={manageAnnouncementAction}>
                <input name="locale" type="hidden" value={locale} />
                <input name="operator" type="hidden" value={operator} />
                <input name="announcement" type="hidden" value={item.id} />
                {item.status === "draft" && (
                  <Button name="operation" value="publish" type="submit">
                    {t.publish}
                  </Button>
                )}
                <Button
                  tone="danger"
                  name="operation"
                  value="archive"
                  type="submit"
                >
                  {t.archive}
                </Button>
              </form>
            )}
          </Card>
        );
      })}
      <Card>
        <h2>{t.history}</h2>
        <ul>
          {(revisions ?? []).map((revision) => (
            <li key={revision.id}>
              <a href={`/${locale}/staff/announcements/${revision.id}`}>
                {t.history} · {revision.revision_number}
              </a>
            </li>
          ))}
        </ul>
      </Card>
    </LocalizedShell>
  );
}
