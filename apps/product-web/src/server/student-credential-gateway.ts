import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createProductWebClient } from "../lib/supabase/server";
import {
  activateStudent,
  type ActivationClaim,
  type ActivationPort,
} from "./student-activation-flow";
import { signInStudent, type StudentSignInPort } from "./student-signin-flow";

export function studentCredentialEnvironment() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const pepper = process.env.STUDENT_CREDENTIAL_PEPPER_V1;
  if (!url || !key || !pepper || pepper.length < 32)
    throw new Error("Student credential gateway is not configured");
  return { url, key, pepper };
}

export function createStudentCredentialAdmin() {
  const { url, key } = studentCredentialEnvironment();
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function exchangeStudentActivation(input: {
  accessId: string;
  code: string;
  pin: string;
  network: string;
}) {
  try {
    const { pepper } = studentCredentialEnvironment();
    const admin = createStudentCredentialAdmin();
    const session = await createProductWebClient();
    async function rpc<T>(
      name: string,
      args: Record<string, unknown>,
    ): Promise<T> {
      const result = await admin.rpc(name, args);
      if (result.error) throw new Error("Activation unavailable");
      return result.data as T;
    }
    const claimArgs = (claim: ActivationClaim) => ({
      target_student_id: claim.student_id,
      claim: claim.claim,
    });
    const port: ActivationPort = {
      attempt: (credentialKey, networkKey) =>
        rpc("student_credential_attempt", {
          credential_key: credentialKey,
          network_key: networkKey,
        }),
      lookup: (accessId) =>
        rpc("student_activation_lookup", { student_access_id: accessId }),
      failure: (accessId) =>
        rpc("student_activation_failure", { student_access_id: accessId }),
      claim: (studentId, hash) =>
        rpc("claim_student_activation", {
          target_student_id: studentId,
          expected_hash: hash,
        }),
      ensureIdentity: async (claim) => {
        const existing = await admin.auth.admin.getUserById(claim.auth_user_id);
        if (existing.data.user) {
          if (existing.data.user.email !== claim.auth_identifier)
            throw new Error("Activation unavailable");
          return;
        }
        const created = await admin.auth.admin.createUser({
          id: claim.auth_user_id,
          email: claim.auth_identifier,
          email_confirm: true,
          password: randomBytes(48).toString("base64url"),
          app_metadata: { actor_class: "student" },
        });
        if (created.error || created.data.user?.id !== claim.auth_user_id)
          throw new Error("Activation unavailable");
      },
      bind: (claim) => rpc("finish_student_activation", claimArgs(claim)),
      confirm: (claim) => rpc("confirm_student_pin", claimArgs(claim)),
      setPassword: async (claim, password) => {
        const result = await admin.auth.admin.updateUserById(
          claim.auth_user_id,
          { password },
        );
        if (result.error) throw new Error("Activation unavailable");
      },
      signIn: async (claim, password) => {
        const result = await session.auth.signInWithPassword({
          email: claim.auth_identifier,
          password,
        });
        if (result.error || result.data.user?.id !== claim.auth_user_id)
          throw new Error("Activation unavailable");
      },
      abandon: (claim) => rpc("abandon_student_activation", claimArgs(claim)),
    };
    return await activateStudent(port, input, pepper);
  } catch {
    return false;
  }
}

export async function exchangeStudentSignIn(input: {
  accessId: string;
  pin: string;
  network: string;
}) {
  const correlationId = randomUUID();
  try {
    const { pepper } = studentCredentialEnvironment();
    const admin = createStudentCredentialAdmin();
    const session = await createProductWebClient();
    const port: StudentSignInPort = {
      attempt: async (credentialKey, networkKey) => {
        const result = await admin.rpc("student_credential_attempt", {
          credential_key: credentialKey,
          network_key: networkKey,
        });
        if (result.error) throw new Error("Sign-in unavailable");
        return result.data === true;
      },
      lookup: async (accessId) => {
        const result = await admin.rpc("student_signin_lookup", {
          student_access_id: accessId,
        });
        if (result.error) throw new Error("Sign-in unavailable");
        return result.data;
      },
      authenticate: async (email, password) => {
        const result = await session.auth.signInWithPassword({
          email,
          password,
        });
        return result.error ? null : (result.data.user?.id ?? null);
      },
      accept: async (studentId) => {
        const result = await session.rpc("accept_student_session", {
          target_student_id: studentId,
        });
        return !result.error && result.data === true;
      },
      failure: async (accessId) => {
        await admin.rpc("student_activation_failure", {
          student_access_id: accessId,
        });
      },
      signOut: async () => {
        await session.auth.signOut({ scope: "local" });
      },
      audit: async (event) => {
        console.info(JSON.stringify({ app: "product-web", ...event }));
      },
    };
    return {
      success: await signInStudent(port, input, pepper, correlationId),
      correlationId,
    };
  } catch {
    console.info(
      JSON.stringify({
        app: "product-web",
        correlationId,
        action: "student.sign_in",
        result: "denied",
      }),
    );
    return { success: false, correlationId };
  }
}
