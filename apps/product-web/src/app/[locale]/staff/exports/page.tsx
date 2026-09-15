import { isSupportedLocale } from "@ranza/i18n";
import { Badge, Button, Card, EmptyState, StatusMessage } from "@ranza/ui";
import { notFound, redirect } from "next/navigation";
import { LocalizedShell } from "../../../../components/localized-shell";
import { createProductWebClient } from "../../../../lib/supabase/server";
import { requestExportAction } from "./actions";
const copy = {
  en: {
    title: "Operator data exports",
    request: "Request export",
    download: "Download",
    queued: "Export queued. Refresh to check progress.",
    denied: "Export unavailable",
    expiry: "Expires",
    info: "Owner-only archive. Download links expire after one minute. Keep downloaded personal data secure.",
  },
  tr: {
    title: "İşletmeci veri dışa aktarımları",
    request: "Dışa aktarım iste",
    download: "İndir",
    queued: "Dışa aktarım sıraya alındı. Durum için sayfayı yenileyin.",
    denied: "Dışa aktarım kullanılamıyor",
    expiry: "Son kullanma",
    info: "Yalnızca işletmeci sahibine açık arşiv. İndirme bağlantısı bir dakika geçerlidir. İndirilen kişisel verileri güvenle saklayın.",
  },
  ar: {
    title: "تصدير بيانات المشغل",
    request: "طلب تصدير",
    download: "تنزيل",
    queued: "تمت إضافة التصدير إلى الطابور. حدث الصفحة للتحقق.",
    denied: "التصدير غير متاح",
    expiry: "ينتهي",
    info: "الأرشيف للمالك فقط. ينتهي رابط التنزيل بعد دقيقة. احفظ البيانات الشخصية بأمان.",
  },
};
type ExportRow = {
  id: string;
  status: string;
  requested_at: string;
  expires_at: string;
};
export default async function ExportsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/staff/exports">) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isSupportedLocale(locale)) notFound();
  const client = await createProductWebClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect(`/${locale}/staff/sign-in`);
  const { data: memberships } = await client
    .from("operator_memberships")
    .select("operator_id")
    .eq("auth_user_id", auth.user.id)
    .eq("role", "owner")
    .eq("access_scope", "operator_wide")
    .eq("status", "active");
  const operatorId =
    typeof query.operator === "string"
      ? query.operator
      : memberships?.[0]?.operator_id;
  if (
    !operatorId ||
    !memberships?.some((row) => row.operator_id === operatorId)
  )
    redirect(`/${locale}/staff/sign-in?error=not-authorized`);
  const { data: exports, error } = await client
    .from("operator_data_exports")
    .select("id,status,requested_at,expires_at")
    .eq("operator_id", operatorId)
    .eq("requested_by", auth.user.id)
    .order("requested_at", { ascending: false })
    .limit(50);
  const t = copy[locale];
  return (
    <LocalizedShell locale={locale}>
      <header className="page-intro page-intro-compact">
        <h1>{t.title}</h1>
        <p>{t.info}</p>
      </header>
      <Card>
        {query.result || error ? (
          <StatusMessage
            tone={query.result === "queued" && !error ? "success" : "warning"}
          >
            {query.result === "queued" && !error ? t.queued : t.denied}
          </StatusMessage>
        ) : null}
        <form action={requestExportAction}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="operator" value={operatorId} />
          <Button>{t.request}</Button>
        </form>
        {(exports as ExportRow[] | null)?.length ? null : (
          <EmptyState title={t.title} description={t.info} />
        )}
        <ul className="export-list">
          {(exports as ExportRow[] | null)?.map((item) => (
            <li key={item.id}>
              {item.requested_at} ·{" "}
              <Badge tone={item.status === "ready" ? "success" : "info"}>
                {item.status}
              </Badge>{" "}
              · {t.expiry}: {item.expires_at}
              {item.status === "ready" &&
              Date.parse(item.expires_at) > Date.now() ? (
                <>
                  {" "}
                  ·{" "}
                  <a
                    href={`/api/operator-exports/${item.id}/download?operator=${operatorId}`}
                  >
                    {t.download}
                  </a>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
    </LocalizedShell>
  );
}
