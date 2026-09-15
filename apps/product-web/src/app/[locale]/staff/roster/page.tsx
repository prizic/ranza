import { isSupportedLocale } from "@ranza/i18n";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  StatusMessage,
} from "@ranza/ui";
import { notFound, redirect } from "next/navigation";
import { LocalizedShell } from "../../../../components/localized-shell";
import { StudentCredentialIssue } from "../../../../components/student-credential-issue";
import { createProductWebClient } from "../../../../lib/supabase/server";
import { manageRoster } from "./actions";

interface Branch {
  branch_id: string;
  branch_name: string;
  operator_id: string;
}
interface Student {
  id: string;
  display_name: string;
  access_id: string;
  preferred_locale: string;
  external_reference: string | null;
  status: string;
}
interface RosterRow {
  id: string;
  student: Student;
}

const copy = {
  en: {
    title: "Student roster",
    add: "Add Student",
    name: "Full name",
    reference: "External reference",
    language: "Language",
    save: "Save details",
    archive: "Archive",
    reactivate: "Reactivate",
    transfer: "Transfer",
    to: "Destination Branch",
    empty: "No Students in this Branch yet.",
    done: "Roster saved.",
    error:
      "The change was not saved. Check the details and your Branch access.",
    active: "Active",
    inactive: "Inactive",
    back: "Staff dashboard",
    id: "Access ID",
  },
  tr: {
    title: "Öğrenci listesi",
    add: "Öğrenci ekle",
    name: "Ad soyad",
    reference: "Harici referans",
    language: "Dil",
    save: "Bilgileri kaydet",
    archive: "Arşivle",
    reactivate: "Yeniden etkinleştir",
    transfer: "Naklet",
    to: "Hedef şube",
    empty: "Bu şubede henüz öğrenci yok.",
    done: "Liste kaydedildi.",
    error:
      "Değişiklik kaydedilmedi. Bilgileri ve şube erişiminizi kontrol edin.",
    active: "Aktif",
    inactive: "Pasif",
    back: "Personel paneli",
    id: "Erişim kimliği",
  },
  ar: {
    title: "قائمة الطلاب",
    add: "إضافة طالب",
    name: "الاسم الكامل",
    reference: "المرجع الخارجي",
    language: "اللغة",
    save: "حفظ التفاصيل",
    archive: "أرشفة",
    reactivate: "إعادة التفعيل",
    transfer: "نقل",
    to: "الفرع الجديد",
    empty: "لا يوجد طلاب في هذا الفرع بعد.",
    done: "تم حفظ القائمة.",
    error: "لم يتم حفظ التغيير. تحقق من التفاصيل وصلاحيات الفرع.",
    active: "نشط",
    inactive: "غير نشط",
    back: "لوحة الموظفين",
    id: "معرف الدخول",
  },
};

export default async function RosterPage({
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
  const access = await client
    .from("staff_branch_access")
    .select("branch_id,branch_name,operator_id")
    .eq("auth_user_id", auth.user.id)
    .eq("capability", "roster.manage")
    .returns<Branch[]>();
  if (access.error) throw access.error;
  const branches = access.data ?? [];
  const selected =
    typeof query.branch === "string"
      ? branches.find((b) => b.branch_id === query.branch)
      : branches[0];
  if (!selected) notFound();
  const roster = await client
    .from("student_branch_history")
    .select(
      "id,student:students!inner(id,display_name,access_id,preferred_locale,external_reference,status)",
    )
    .eq("branch_id", selected.branch_id)
    .is("ended_at", null)
    .order("started_at")
    .returns<RosterRow[]>();
  if (roster.error) throw roster.error;
  const fields = (student?: Student) => (
    <>
      <label>
        {t.name}
        <Input
          name="displayName"
          defaultValue={student?.display_name}
          required
          minLength={2}
          maxLength={120}
        />
      </label>
      <label>
        {t.reference}
        <Input
          name="externalReference"
          defaultValue={student?.external_reference ?? ""}
          maxLength={120}
        />
      </label>
      <label>
        {t.language}
        <select
          name="preferredLocale"
          defaultValue={student?.preferred_locale ?? locale}
        >
          <option value="tr">Türkçe</option>
          <option value="en">English</option>
          <option value="ar">العربية</option>
        </select>
      </label>
    </>
  );
  const hidden = (operation: string, student?: Student) => (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="branch" value={selected.branch_id} />
      <input type="hidden" name="operator" value={selected.operator_id} />
      <input type="hidden" name="operation" value={operation} />
      {student && <input type="hidden" name="student" value={student.id} />}
    </>
  );
  return (
    <LocalizedShell locale={locale}>
      <a
        className="text-link"
        href={`/${locale}/staff?branch=${selected.branch_id}`}
      >
        {t.back}
      </a>
      <header className="page-intro page-intro-compact">
        <h1>
          {t.title} · {selected.branch_name}
        </h1>
      </header>
      <p>
        <a
          className="button button-secondary"
          href={`/${locale}/staff/roster/import?branch=${selected.branch_id}`}
        >
          {locale === "tr"
            ? "CSV ile içe aktar"
            : locale === "ar"
              ? "استيراد CSV"
              : "Import CSV"}
        </a>
      </p>
      <nav aria-label={t.to} className="branch-switcher">
        {branches.map((b) => (
          <a
            key={b.branch_id}
            aria-current={
              b.branch_id === selected.branch_id ? "page" : undefined
            }
            href={`/${locale}/staff/roster?branch=${b.branch_id}`}
          >
            {b.branch_name}{" "}
          </a>
        ))}
      </nav>
      {query.saved === "1" && (
        <StatusMessage tone="success">{t.done}</StatusMessage>
      )}
      {query.error && <StatusMessage tone="warning">{t.error}</StatusMessage>}
      <Card>
        <h2>{t.add}</h2>
        <form action={manageRoster} className="control-form">
          {hidden("create")}
          {fields()}
          <Button type="submit">{t.add}</Button>
        </form>
      </Card>
      {!roster.data?.length && (
        <EmptyState title={t.title} description={t.empty} />
      )}
      {(roster.data ?? []).map(({ student }) => (
        <Card className="roster-card" key={student.id}>
          <h2>{student.display_name}</h2>
          <p>
            <Badge tone={student.status === "active" ? "success" : "neutral"}>
              {student.status === "active" ? t.active : t.inactive}
            </Badge>{" "}
            · {t.id}: <bdi dir="ltr">{student.access_id}</bdi>
          </p>
          {student.status === "active" && (
            <StudentCredentialIssue studentId={student.id} locale={locale} />
          )}
          <form action={manageRoster} className="control-form">
            {hidden("edit", student)}
            {fields(student)}
            <Button type="submit">{t.save}</Button>
          </form>
          <form action={manageRoster}>
            {hidden(
              student.status === "active" ? "archive" : "reactivate",
              student,
            )}
            <Button
              tone={student.status === "active" ? "danger" : "secondary"}
              type="submit"
            >
              {student.status === "active" ? t.archive : t.reactivate}
            </Button>
          </form>
          {student.status === "active" &&
            branches.some(
              (b) =>
                b.operator_id === selected.operator_id &&
                b.branch_id !== selected.branch_id,
            ) && (
              <form action={manageRoster} className="control-form">
                {hidden("transfer", student)}
                <label>
                  {t.to}
                  <select name="destination" required>
                    {branches
                      .filter(
                        (b) =>
                          b.operator_id === selected.operator_id &&
                          b.branch_id !== selected.branch_id,
                      )
                      .map((b) => (
                        <option value={b.branch_id} key={b.branch_id}>
                          {b.branch_name}
                        </option>
                      ))}
                  </select>
                </label>
                <Button tone="secondary" type="submit">
                  {t.transfer}
                </Button>
              </form>
            )}
        </Card>
      ))}
    </LocalizedShell>
  );
}
