import { isSupportedLocale } from "@ranza/i18n";
import { BidiText, Card, EmptyState, StatusMessage } from "@ranza/ui";
import { notFound, redirect } from "next/navigation";

import { LocalizedShell } from "../../../components/localized-shell";
import { createProductWebClient } from "../../../lib/supabase/server";

const copy = {
  tr: {
    disclaimer:
      "Ranza yalnızca yurdun para kayıtlarını gösterir; para tahsil etmez, aktarmaz ve bu ekran ödeme makbuzu değildir.",
    due: "Son ödeme",
    empty: "Henüz bakiye kaydı yok.",
    remaining: "Kalan bakiye",
    title: "Öğrenci bakiyesi",
  },
  en: {
    disclaimer:
      "Ranza only records the dormitory's money information. It does not collect or transfer money, and this is not a payment receipt.",
    due: "Due",
    empty: "There are no Balance records yet.",
    remaining: "Remaining Balance",
    title: "Student Balance",
  },
  ar: {
    disclaimer:
      "تعرض Ranza سجلات السكن فقط؛ ولا تجمع الأموال أو تحولها، وهذه الشاشة ليست إيصال دفع.",
    due: "الاستحقاق",
    empty: "لا توجد سجلات رصيد بعد.",
    remaining: "الرصيد المتبقي",
    title: "رصيد الطالب",
  },
} as const;

export default async function BalancePage({
  params,
}: PageProps<"/[locale]/balance">) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const client = await createProductWebClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect(`/${locale}/activate`);
  const { data: student, error: studentError } = await client
    .from("students")
    .select("id")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle<{ id: string }>();
  if (studentError || !student) redirect(`/${locale}/activate`);
  const [
    { data: summaries, error: summaryError },
    { data: entries, error: entryError },
  ] = await Promise.all([
    client
      .from("student_balance_summary")
      .select("account_id,currency,remaining_balance,last_entry_at")
      .eq("student_id", student.id)
      .order("currency"),
    client
      .from("student_balance_entries")
      .select(
        "id,entry_type,amount,currency,effective_date,due_date,description,created_at,reversal_of",
      )
      .eq("student_id", student.id)
      .order("effective_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);
  if (summaryError || entryError) throw summaryError ?? entryError;
  const labels = copy[locale];
  return (
    <LocalizedShell locale={locale}>
      <header className="page-intro page-intro-compact">
        <h1>{labels.title}</h1>
      </header>
      <Card className="ledger-card">
        <StatusMessage tone="warning">{labels.disclaimer}</StatusMessage>
        {(summaries ?? []).map((summary) => (
          <p key={summary.account_id}>
            <strong>
              {labels.remaining}:{" "}
              <BidiText>
                {summary.remaining_balance} {summary.currency}
              </BidiText>
            </strong>
          </p>
        ))}
        {(entries ?? []).length === 0 ? (
          <EmptyState title={labels.title} description={labels.empty} />
        ) : (
          <ul>
            {(entries ?? []).map((entry) => (
              <li key={entry.id}>
                <strong>
                  {entry.entry_type.replace("_", " ")} ·{" "}
                  <BidiText>
                    {entry.amount} {entry.currency}
                  </BidiText>
                </strong>
                <p>{entry.description}</p>
                <small>
                  {entry.effective_date}
                  {entry.due_date ? ` · ${labels.due} ${entry.due_date}` : ""}
                </small>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </LocalizedShell>
  );
}
