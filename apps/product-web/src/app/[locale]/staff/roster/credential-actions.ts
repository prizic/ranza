"use server";

import { createProductWebClient } from "../../../../lib/supabase/server";
import { issueActivationCode } from "../../../../server/student-credential-crypto";

export interface IssuedCredentialState {
  code?: string;
  accessId?: string;
  error?: boolean;
}

export async function issueStudentCredential(
  _previous: IssuedCredentialState,
  form: FormData,
): Promise<IssuedCredentialState> {
  if (form.get("operation") === "dismiss") return {};
  try {
    const client = await createProductWebClient();
    const auth = await client.auth.getUser();
    if (!auth.data.user) return { error: true };
    const issued = await issueActivationCode();
    const result = await client.rpc(
      form.get("operation") === "recover"
        ? "recover_student_credential"
        : "issue_student_activation",
      {
        target_student_id: String(form.get("student") ?? ""),
        code_hash: issued.hash,
      },
    );
    if (result.error || !result.data?.access_id) return { error: true };
    return { code: issued.code, accessId: result.data.access_id };
  } catch {
    return { error: true };
  }
}
