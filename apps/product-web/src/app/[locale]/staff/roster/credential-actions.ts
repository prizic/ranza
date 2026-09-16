"use server";

import { createProductWebClient } from "../../../../lib/supabase/server";
import { issueStudentCredentialForActor } from "../../../../server/student-credential-gateway";

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
    const operation = form.get("operation") === "recover" ? "recover" : "issue";
    const result = await issueStudentCredentialForActor({
      actorId: auth.data.user.id,
      operation,
      studentId: String(form.get("student") ?? ""),
    });
    if (!result.credential) return { error: true };
    return {
      accessId: result.credential.accessId,
      code: result.credential.code,
    };
  } catch {
    return { error: true };
  }
}
