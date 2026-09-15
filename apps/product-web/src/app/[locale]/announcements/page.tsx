import {
  selectAnnouncementContent,
  type AnnouncementContent,
} from "@ranza/domain";
import { isSupportedLocale } from "@ranza/i18n";
import { Badge, Button, Card, EmptyState, StatusMessage } from "@ranza/ui";
import { notFound, redirect } from "next/navigation";
import { LocalizedShell } from "../../../components/localized-shell";
import { createProductWebClient } from "../../../lib/supabase/server";
import { announcementCopy } from "../../../lib/announcement-copy";
import { acknowledgeAnnouncementAction } from "./actions";

interface FeedItem {
  id: string;
  source_locale: "tr" | "en" | "ar";
  source_content: string;
  operator_locale: "tr" | "en" | "ar";
  translations: AnnouncementContent["translations"];
  acknowledged_at: string | null;
  published_at: string;
}
export default async function AnnouncementsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isSupportedLocale(locale)) notFound();
  const client = await createProductWebClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect(`/${locale}/student/sign-in`);
  const { data, error } = await client.rpc("student_announcement_feed");
  const items = (data ?? []) as FeedItem[];
  const t = announcementCopy[locale];
  return (
    <LocalizedShell locale={locale}>
      <header className="page-intro page-intro-compact">
        <h1>{t.title}</h1>
      </header>
      {(error || query.result === "failed") && (
        <StatusMessage tone="warning">{t.error}</StatusMessage>
      )}
      {query.result === "saved" && (
        <StatusMessage tone="success">{t.saved}</StatusMessage>
      )}
      {!error && items.length === 0 && (
        <EmptyState title={t.title} description={t.empty} />
      )}
      {items.map((item) => {
        const display = selectAnnouncementContent(
          {
            sourceLocale: item.source_locale,
            sourceContent: item.source_content,
            translations: item.translations,
          },
          locale,
          item.operator_locale,
        );
        return (
          <Card className="announcement-card" key={item.id}>
            {display.fallback && (
              <Badge tone="info">
                {t.fallback}: {t[display.locale]}
              </Badge>
            )}
            <p
              lang={display.locale}
              dir={display.locale === "ar" ? "rtl" : "ltr"}
              style={{ whiteSpace: "pre-wrap" }}
            >
              {display.content}
            </p>
            <time dateTime={item.published_at}>
              {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
                new Date(item.published_at),
              )}
            </time>
            {item.acknowledged_at ? (
              <Badge tone="success">{t.acknowledged}</Badge>
            ) : (
              <form action={acknowledgeAnnouncementAction}>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="revision" value={item.id} />
                <Button type="submit">{t.acknowledge}</Button>
              </form>
            )}
          </Card>
        );
      })}
    </LocalizedShell>
  );
}
