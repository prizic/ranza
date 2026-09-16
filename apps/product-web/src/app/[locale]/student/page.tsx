import { isSupportedLocale } from "@ranza/i18n";
import { BidiText } from "@ranza/ui";
import { notFound, redirect } from "next/navigation";

import { LocalizedShell } from "../../../components/localized-shell";
import { studentCredentialCopy } from "../../../lib/student-credential-copy";
import { createProductWebClient } from "../../../lib/supabase/server";

interface StudentHomeContext {
  access_id: string;
  branch_id: string;
  branch_name: string;
  branch_timezone: string;
  display_name: string;
  operator_id: string;
  preferred_locale: string;
  student_id: string;
}

export default async function StudentHomePage({
  params,
}: PageProps<"/[locale]/student">) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();

  const client = await createProductWebClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect(`/${locale}/student/sign-in`);

  const { data, error } = await client.rpc("student_home_context");
  if (error) throw error;
  const context = (data as StudentHomeContext[] | null)?.[0];
  if (!context) redirect(`/${locale}/student/sign-in?error=not-authorized`);
  const copy = studentCredentialCopy[locale];
  return (
    <LocalizedShell locale={locale}>
      <section className="attendance-context" aria-labelledby="student-home">
        <div>
          <span>{copy.homeGreeting}</span>
          <h2 id="student-home">{context.display_name}</h2>
          <BidiText>{context.access_id}</BidiText>
        </div>
        <div>
          <span>{copy.homeBranch}</span>
          <h2>{context.branch_name}</h2>
          <p>
            {copy.homeTimezone}: <BidiText>{context.branch_timezone}</BidiText>
          </p>
        </div>
      </section>
      <section className="install-panel" aria-labelledby="student-actions">
        <div>
          <h2 id="student-actions">{copy.homeTitle}</h2>
          <p>{copy.signInHint}</p>
        </div>
        <a className="button" href={`/${locale}/student/attendance`}>
          {copy.homeAttendance}
        </a>
      </section>
      <form action={`/${locale}/student/sign-out`} method="post">
        <button type="submit" name="operation" value="signout">
          {copy.signOut}
        </button>
      </form>
    </LocalizedShell>
  );
}
