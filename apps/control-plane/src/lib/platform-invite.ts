const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_BYTES = 72;

export type InviteCompletionFailure =
  | "password-too-short"
  | "password-too-long"
  | "password-mismatch"
  | "unauthenticated"
  | "unauthorized"
  | "update-failed";

export type InviteCompletionResult =
  | { ok: true }
  | { ok: false; reason: InviteCompletionFailure };

interface InviteAuthPort {
  getUser(): Promise<{
    data: { user: { id: string } | null };
    error: unknown;
  }>;
  hasActivePlatformAccess(userId: string): Promise<boolean>;
  updateUser(input: { password: string }): Promise<{
    error: unknown;
  }>;
}

export async function completePlatformInvite(
  auth: InviteAuthPort,
  password: string,
  confirmation: string,
): Promise<InviteCompletionResult> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: "password-too-short" };
  }
  if (new TextEncoder().encode(password).byteLength > MAX_PASSWORD_BYTES) {
    return { ok: false, reason: "password-too-long" };
  }
  if (password !== confirmation) {
    return { ok: false, reason: "password-mismatch" };
  }

  const { data, error: userError } = await auth.getUser();
  if (userError || !data.user) {
    return { ok: false, reason: "unauthenticated" };
  }
  if (!(await auth.hasActivePlatformAccess(data.user.id))) {
    return { ok: false, reason: "unauthorized" };
  }

  const { error } = await auth.updateUser({ password });
  return error ? { ok: false, reason: "update-failed" } : { ok: true };
}
