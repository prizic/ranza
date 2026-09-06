import { isSupportedLocale } from "@ranza/i18n";
import {
  summarizeOperationalSignals,
  type OperationalSignal,
} from "@ranza/observability";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { LocalizedShell } from "../../../components/localized-shell";
import { createControlPlaneClient } from "../../../lib/supabase/server";
import { supportAction } from "./actions";

const copy = {
  en: {
    title: "Operations and support",
    start: "Start 30-minute context",
    operator: "Operator ID",
    reason: "Reason (no secrets)",
    revoke: "Revoke context",
    health: "Service health",
    audit: "Redacted audit",
    filter: "Filter",
    disable: "Disable capability",
    retry: "Retry safely",
    denied: "Request denied or unavailable",
    saved: "Request recorded",
    context: "Select one Operator context before support actions.",
  },
  tr: {
    title: "Operasyon ve destek",
    start: "30 dakikalık bağlam başlat",
    operator: "İşletmeci kimliği",
    reason: "Gerekçe (gizli bilgi yazmayın)",
    revoke: "Bağlamı iptal et",
    health: "Servis durumu",
    audit: "Gizlenmiş denetim kaydı",
    filter: "Filtrele",
    disable: "Özelliği devre dışı bırak",
    retry: "Güvenle yeniden dene",
    denied: "İstek reddedildi veya kullanılamıyor",
    saved: "İstek kaydedildi",
    context: "Destek işlemleri için tek bir işletmeci bağlamı seçin.",
  },
  ar: {
    title: "العمليات والدعم",
    start: "بدء سياق لمدة 30 دقيقة",
    operator: "معرف المشغل",
    reason: "السبب (دون أسرار)",
    revoke: "إلغاء السياق",
    health: "حالة الخدمات",
    audit: "سجل تدقيق منقح",
    filter: "تصفية",
    disable: "تعطيل الميزة",
    retry: "إعادة المحاولة بأمان",
    denied: "الطلب مرفوض أو غير متاح",
    saved: "تم تسجيل الطلب",
    context: "حدد سياق مشغل واحد قبل إجراءات الدعم.",
  },
};
type Context = { id: string; operator_id: string; expires_at: string };
type Job = {
  id: string;
  operator_id: string;
  job_key: string;
  status: string;
  correlation_id: string;
};
type Audit = {
  id: string;
  operator_id: string;
  action: string;
  occurred_at: string;
  actor_user_id: string;
  target_id: string;
  before_summary: unknown;
  after_summary: unknown;
};
export default async function OperationsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/operations">) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isSupportedLocale(locale)) notFound();
  const t = copy[locale];
  const client = await createControlPlaneClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect(`/${locale}/sign-in`);
  const access = await client
    .from("platform_access")
    .select("role,status")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (access.data?.status !== "active") redirect(`/${locale}/forbidden`);
  const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance.data?.currentLevel !== "aal2") redirect(`/${locale}/mfa`);
  const contexts = (
    await client
      .from("support_contexts")
      .select("id,operator_id,expires_at")
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
  ).data as Context[] | null;
  const current = contexts?.find((item) => item.id === query.context);
  const filters = Object.fromEntries(
    ["operator", "branch", "actor", "action", "target", "from", "to"].map(
      (key) => [key, typeof query[key] === "string" ? query[key] : ""],
    ),
  );
  if (current) filters.operator = current.operator_id;
  const allowed = !!current || access.data.role === "platform_admin";
  const [health, audit] = allowed
    ? await Promise.all([
        client.rpc("platform_health", {
          context_id: current?.id ?? null,
          target_operator_id: filters.operator || null,
        }),
        client.rpc("search_platform_audit", {
          context_id: current?.id ?? null,
          filters,
        }),
      ])
    : [
        { data: null, error: null },
        { data: null, error: null },
      ];
  const signals = summarizeOperationalSignals(
    (health.data?.signals ?? []) as OperationalSignal[],
  );
  const hidden = (operation: string) => (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="operation" value={operation} />
      <input type="hidden" name="context" value={current?.id ?? ""} />
      <input type="hidden" name="operator" value={current?.operator_id ?? ""} />
    </>
  );
  const reason = (
    <label>
      {t.reason}
      <input name="reason" required minLength={10} maxLength={500} />
    </label>
  );
  return (
    <LocalizedShell locale={locale}>
      <section className="control-card">
        <h2>{t.title}</h2>
        {query.result ? (
          <p role="status">{query.result === "saved" ? t.saved : t.denied}</p>
        ) : null}
        <p>{t.context}</p>
        <form action={supportAction} className="control-form">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="operation" value="start" />
          <label>
            {t.operator}
            <input name="operator" required />
          </label>
          {reason}
          <button>{t.start}</button>
        </form>
        <ul>
          {contexts?.map((item) => (
            <li key={item.id}>
              <Link href={`/${locale}/operations?context=${item.id}`}>
                {item.operator_id}
              </Link>{" "}
              · {item.expires_at}
            </li>
          ))}
        </ul>
        {current ? (
          <>
            <p>
              {t.operator}: {current.operator_id} · {current.expires_at}
            </p>
            <form action={supportAction}>
              {hidden("revoke")}
              <button>{t.revoke}</button>
            </form>
            <form action={supportAction} className="control-form">
              {hidden("disable")}
              <label>
                {t.disable}
                <select name="capability">
                  {[
                    "attendance",
                    "meals",
                    "announcements",
                    "balance",
                    "wifi",
                  ].map((key) => (
                    <option key={key}>{key}</option>
                  ))}
                </select>
              </label>
              {reason}
              <button>{t.disable}</button>
            </form>
          </>
        ) : null}
        <h3>{t.health}</h3>
        {health.error ? (
          <p>{t.denied}</p>
        ) : (
          <>
            <ul>
              {signals.map((signal) => (
                <li key={signal.component}>
                  {signal.component}: {signal.status} ·{" "}
                  {signal.observedAt ?? "—"}
                </li>
              ))}
            </ul>
            <p>
              Attendance: {health.data?.attendance_due ?? "—"} · Meals:{" "}
              {health.data?.meals_due ?? "—"}
            </p>
            {(health.data?.jobs as Job[] | undefined)?.map((job) => (
              <div key={job.id}>
                <p>
                  {job.job_key} · {job.status} · {job.correlation_id}
                </p>
                {current && current.operator_id === job.operator_id ? (
                  <form action={supportAction}>
                    {hidden("retry")}
                    <input type="hidden" name="job" value={job.id} />
                    {reason}
                    <button>{t.retry}</button>
                  </form>
                ) : null}
              </div>
            ))}
          </>
        )}
        <h3>{t.audit}</h3>
        <form className="control-form">
          <input type="hidden" name="context" value={current?.id ?? ""} />
          {Object.entries(filters).map(([key, value]) => (
            <label key={key}>
              {key}
              <input
                name={key}
                defaultValue={value}
                readOnly={key === "operator" && !!current}
              />
            </label>
          ))}
          <button>{t.filter}</button>
        </form>
        {audit.error ? (
          <p>{t.denied}</p>
        ) : (
          <ul>
            {(audit.data as Audit[] | null)?.map((row) => (
              <li key={row.id}>
                {row.occurred_at} · {row.operator_id} · {row.actor_user_id} ·{" "}
                {row.action} · {row.target_id}
                <pre>
                  {JSON.stringify({
                    before: row.before_summary,
                    after: row.after_summary,
                  })}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </section>
    </LocalizedShell>
  );
}
