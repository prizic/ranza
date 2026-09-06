import { isSupportedLocale } from "@ranza/i18n";
import { notFound, redirect } from "next/navigation";
import { LocalizedShell } from "../../../components/localized-shell";
import { createControlPlaneClient } from "../../../lib/supabase/server";
import { MfaForm } from "./form";

export const dynamic = "force-dynamic";

export default async function MfaPage({ params }: PageProps<"/[locale]/mfa">) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const client = await createControlPlaneClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect(`/${locale}/sign-in`);
  const access = await client
    .from("platform_access")
    .select("status")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (access.data?.status !== "active") redirect(`/${locale}/forbidden`);
  const factors = await client.auth.mfa.listFactors();
  return (
    <LocalizedShell locale={locale}>
      <section className="control-card">
        <h2>
          {locale === "tr"
            ? "İki aşamalı doğrulama"
            : locale === "ar"
              ? "المصادقة الثنائية"
              : "Two-factor authentication"}
        </h2>
        <MfaForm
          locale={locale}
          factorId={
            factors.data?.totp.find((factor) => factor.status === "verified")
              ?.id
          }
        />
      </section>
    </LocalizedShell>
  );
}
