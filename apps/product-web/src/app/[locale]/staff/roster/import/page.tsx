import { selectAuthorizedBranch } from "@ranza/auth";
import { isSupportedLocale } from "@ranza/i18n";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  StatusMessage,
  Table,
} from "@ranza/ui";
import { notFound, redirect } from "next/navigation";

import { LocalizedShell } from "../../../../../components/localized-shell";
import { createProductWebClient } from "../../../../../lib/supabase/server";
import type { ImportPreview } from "../../../../../server/student-import-gateway";

import {
  cancelStudentImport,
  confirmStudentImport,
  previewStudentImport,
} from "./actions";

interface Branch {
  branch_id: string;
  branch_name: string;
  operator_id: string;
}
interface Run {
  id: string;
  import_key: string;
  status: ImportPreview["status"];
  row_count: number;
  error_count: number;
  imported_count: number;
  created_at: string;
}

const copy = {
  en: {
    title: "Import Students",
    template: "Download UTF-8 template",
    upload: "Preview CSV",
    confirm: "Import selected rows",
    cancel: "Cancel",
    errors: "Download row errors",
    valid: "Valid",
    invalid: "Needs correction",
    history: "Recent imports",
    back: "Student roster",
  },
  tr: {
    title: "Öğrencileri içe aktar",
    template: "UTF-8 şablonunu indir",
    upload: "CSV önizleme",
    confirm: "Seçilen satırları aktar",
    cancel: "İptal",
    errors: "Satır hatalarını indir",
    valid: "Geçerli",
    invalid: "Düzeltme gerekli",
    history: "Son aktarımlar",
    back: "Öğrenci listesi",
  },
  ar: {
    title: "استيراد الطلاب",
    template: "تنزيل قالب UTF-8",
    upload: "معاينة CSV",
    confirm: "استيراد الصفوف المحددة",
    cancel: "إلغاء",
    errors: "تنزيل أخطاء الصفوف",
    valid: "صالح",
    invalid: "يحتاج إلى تصحيح",
    history: "عمليات الاستيراد الأخيرة",
    back: "قائمة الطلاب",
  },
};

export default async function StudentImportPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isSupportedLocale(locale)) notFound();
  const t = copy[locale];
  const client = await createProductWebClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect(`/${locale}/staff/sign-in`);
  const { data: access, error: accessError } = await client
    .from("staff_branch_access")
    .select("operator_id,branch_id,branch_name")
    .eq("auth_user_id", auth.user.id)
    .eq("capability", "roster.manage")
    .returns<Branch[]>();
  if (accessError) throw accessError;
  const branches = Array.from(
    new Map((access ?? []).map((row) => [row.branch_id, row])).values(),
  );
  const branchId = selectAuthorizedBranch(
    branches.map((row) => row.branch_id),
    typeof query.branch === "string" ? query.branch : null,
  );
  const branch = branches.find((row) => row.branch_id === branchId);
  if (!branch) notFound();
  const runId = typeof query.run === "string" ? query.run : null;
  const previewResult = runId
    ? await client.rpc("student_roster_import_preview", {
        target_import_id: runId,
      })
    : { data: null, error: null };
  if (previewResult.error)
    redirect(`/${locale}/staff/roster/import?branch=${branchId}&error=denied`);
  const preview = previewResult.data as ImportPreview | null;
  const { data: runs } = await client
    .from("student_import_runs")
    .select(
      "id,import_key,status,row_count,error_count,imported_count,created_at",
    )
    .eq("branch_id", branchId)
    .order("created_at", { ascending: false })
    .limit(10)
    .returns<Run[]>();
  const hidden = (importKey?: string) => (
    <>
      <input name="locale" type="hidden" value={locale} />
      <input name="branch" type="hidden" value={branch.branch_id} />
      <input name="operator" type="hidden" value={branch.operator_id} />
      {importKey ? (
        <input name="importKey" type="hidden" value={importKey} />
      ) : null}
    </>
  );
  const currentRun = preview
    ? (runs ?? []).find((run) => run.id === preview.id)
    : null;
  return (
    <LocalizedShell locale={locale}>
      <a
        className="text-link"
        href={`/${locale}/staff/roster?branch=${branchId}`}
      >
        {t.back}
      </a>
      <header className="page-intro page-intro-compact">
        <h1>
          {t.title} · {branch.branch_name}
        </h1>
      </header>
      {query.error ? (
        <StatusMessage tone="warning">
          {locale === "tr"
            ? "Dosya işlenemedi. Satırları ve yetkinizi kontrol edin."
            : locale === "ar"
              ? "تعذرت معالجة الملف. تحقق من الصفوف والصلاحيات."
              : "The file could not be processed. Check its rows and your access."}
        </StatusMessage>
      ) : null}
      {query.result ? (
        <StatusMessage
          tone={query.result === "committed" ? "success" : "warning"}
        >
          {String(query.result)}
        </StatusMessage>
      ) : null}
      <Card>
        <a
          className="button button-secondary"
          href="/api/student-import/template"
        >
          {t.template}
        </a>
        <p>
          external_reference, display_name, preferred_locale (tr/en/ar) · UTF-8
          · max 1,000 rows / 5 MB
        </p>
        <form action={previewStudentImport} className="control-form">
          {hidden()}
          <Input accept=".csv,text/csv" name="csv" required type="file" />
          <Button type="submit">{t.upload}</Button>
        </form>
      </Card>
      {preview && currentRun ? (
        <Card>
          <h2>
            {preview.status} · {preview.valid_count}/{preview.row_count}{" "}
            {t.valid}
          </h2>
          {preview.error_count > 0 ? (
            <a href={`/api/student-import/${preview.id}/errors`}>{t.errors}</a>
          ) : null}
          {preview.status === "staged" ? (
            <form action={confirmStudentImport}>
              {hidden(currentRun.import_key)}
              <Table label={t.title}>
                <thead>
                  <tr>
                    <th></th>
                    <th>#</th>
                    <th>Reference</th>
                    <th>Name</th>
                    <th>Locale</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={row.rowNumber}>
                      <td>
                        {row.errors.length === 0 ? (
                          <input
                            aria-label={`${t.confirm}: ${row.displayName}`}
                            defaultChecked
                            name="row"
                            type="checkbox"
                            value={row.rowNumber}
                          />
                        ) : null}
                      </td>
                      <td>{row.rowNumber}</td>
                      <td>
                        <bdi>{row.externalReference}</bdi>
                      </td>
                      <td>{row.displayName}</td>
                      <td>{row.preferredLocale}</td>
                      <td>
                        {row.errors.length === 0 ? (
                          <Badge tone="success">{t.valid}</Badge>
                        ) : (
                          `${t.invalid}: ${row.errors.join(", ")}`
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <Button type="submit">{t.confirm}</Button>
            </form>
          ) : null}
          {preview.status === "staged" ? (
            <form action={cancelStudentImport}>
              {hidden(currentRun.import_key)}
              <Button tone="danger" type="submit">
                {t.cancel}
              </Button>
            </form>
          ) : null}
          {preview.error_reference ? (
            <p>
              <bdi>{preview.error_reference}</bdi>
            </p>
          ) : null}
        </Card>
      ) : null}
      <Card>
        <h2>{t.history}</h2>
        {(runs ?? []).length === 0 ? (
          <EmptyState title={t.history} description={t.history} />
        ) : null}
        <ul className="import-history">
          {(runs ?? []).map((run) => (
            <li key={run.id}>
              <a href={`?branch=${branchId}&run=${run.id}`}>
                {new Intl.DateTimeFormat(locale).format(
                  new Date(run.created_at),
                )}{" "}
                · {run.status} · {run.imported_count}/{run.row_count}
              </a>
            </li>
          ))}
        </ul>
      </Card>
    </LocalizedShell>
  );
}
