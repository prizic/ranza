"use server";

import { createStudentImportKey, parseStudentCsv } from "@ranza/domain";
import { isSupportedLocale } from "@ranza/i18n";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createProductWebClient } from "../../../../../lib/supabase/server";
import { studentImportGateway } from "../../../../../server/student-import-gateway";

function context(form: FormData) {
  const rawLocale = form.get("locale");
  const locale = isSupportedLocale(rawLocale) ? rawLocale : "tr";
  const branch = String(form.get("branch") ?? "");
  const operator = String(form.get("operator") ?? "");
  return {
    branch,
    locale,
    operator,
    path: `/${locale}/staff/roster/import?branch=${encodeURIComponent(branch)}`,
  };
}

async function actor(locale: string) {
  const client = await createProductWebClient();
  const { data } = await client.auth.getUser();
  if (!data.user) redirect(`/${locale}/staff/sign-in`);
  return data.user.id;
}

export async function previewStudentImport(form: FormData) {
  const { branch, locale, operator, path } = context(form);
  const actorId = await actor(locale);
  const upload = form.get("csv");
  if (!(upload instanceof File) || upload.size === 0 || upload.size > 5_000_000)
    redirect(`${path}&error=file`);
  let csv: string;
  try {
    csv = new TextDecoder("utf-8", { fatal: true }).decode(
      await upload.arrayBuffer(),
    );
  } catch {
    redirect(`${path}&error=utf8`);
  }
  let parsed;
  try {
    parsed = parseStudentCsv(csv);
  } catch {
    redirect(`${path}&error=parse`);
  }
  const importKey = await createStudentImportKey(operator, branch, csv);
  let preview;
  try {
    preview = await studentImportGateway.stage({
      actorId,
      branchId: branch,
      importKey,
      operatorId: operator,
      rows: parsed.rows.map((row) => ({
        displayName: row.values?.displayName ?? "",
        externalReference: row.values?.externalReference ?? "",
        preferredLocale: row.values?.preferredLocale ?? "",
        rowNumber: row.rowNumber,
      })),
    });
  } catch {
    redirect(`${path}&error=denied`);
  }
  redirect(`${path}&run=${preview.id}`);
}

export async function confirmStudentImport(form: FormData) {
  const { locale, operator, path } = context(form);
  const actorId = await actor(locale);
  const importKey = String(form.get("importKey") ?? "");
  const selectedRows = form.getAll("row").map(Number).filter(Number.isInteger);
  let result;
  try {
    result = await studentImportGateway.confirm({
      actorId,
      importKey,
      operatorId: operator,
      selectedRows,
    });
  } catch {
    redirect(`${path}&error=commit`);
  }
  revalidatePath(`/${locale}/staff/roster`);
  redirect(`${path}&run=${result.id}&result=${result.status}`);
}

export async function cancelStudentImport(form: FormData) {
  const { locale, operator, path } = context(form);
  const actorId = await actor(locale);
  let result;
  try {
    result = await studentImportGateway.cancel({
      actorId,
      importKey: String(form.get("importKey") ?? ""),
      operatorId: operator,
    });
  } catch {
    redirect(`${path}&error=denied`);
  }
  redirect(`${path}&run=${result.id}&result=cancelled`);
}
