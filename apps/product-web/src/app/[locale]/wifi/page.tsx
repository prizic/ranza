import { isSupportedLocale } from "@ranza/i18n";
import { BidiText, Card, EmptyState } from "@ranza/ui";
import { notFound, redirect } from "next/navigation";

import { LocalizedShell } from "../../../components/localized-shell";
import { wifiCopy } from "../../../lib/wifi-copy";
import { createProductWebClient } from "../../../lib/supabase/server";
import { readProtectedWifi } from "../../../server/protected-wifi";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function WifiPage({
  params,
}: PageProps<"/[locale]/wifi">) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const copy = wifiCopy[locale];
  const client = await createProductWebClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect(`/${locale}/student/sign-in`);
  const { data: student } = await client
    .from("students")
    .select("id")
    .eq("auth_user_id", auth.user.id)
    .eq("status", "active")
    .maybeSingle<{ id: string }>();
  if (!student) redirect(`/${locale}/student/sign-in?error=not-authorized`);
  const { data: assignment } = await client
    .from("student_branch_history")
    .select("branch_id")
    .eq("student_id", student.id)
    .is("ended_at", null)
    .maybeSingle<{ branch_id: string }>();
  if (!assignment) redirect(`/${locale}/student/sign-in?error=not-authorized`);
  const details = await readProtectedWifi(client, assignment.branch_id);

  return (
    <LocalizedShell locale={locale}>
      {!details ? (
        <EmptyState title={copy.title} description={copy.unavailable} />
      ) : (
        <Card className="wifi-details">
          <h1 className="section-title">{copy.title}</h1>
          <p>{copy.protectedMode}</p>
          <dl>
            <dt>{copy.branch}</dt>
            <dd>{details.branchName}</dd>
            <dt>{copy.networkName}</dt>
            <dd>
              <BidiText>{details.networkName}</BidiText>
            </dd>
            <dt>{copy.password}</dt>
            <dd>
              <BidiText>{details.password}</BidiText>
            </dd>
            <dt>{copy.instructions}</dt>
            <dd>{details.instructions || "—"}</dd>
            <dt>{copy.updated}</dt>
            <dd>
              <BidiText>
                {new Intl.DateTimeFormat(locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(details.updatedAt))}
              </BidiText>
            </dd>
          </dl>
        </Card>
      )}
    </LocalizedShell>
  );
}
