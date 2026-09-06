import {
  credentialRateKey,
  deriveStudentPassword,
} from "./student-credential-crypto";

export interface StudentSignInPort {
  attempt(credential: string, network: string): Promise<boolean>;
  lookup(accessId: string): Promise<{
    student_id: string;
    auth_user_id: string;
    auth_identifier: string;
  } | null>;
  authenticate(email: string, password: string): Promise<string | null>;
  accept(studentId: string): Promise<boolean>;
  failure(accessId: string): Promise<void>;
  signOut(): Promise<void>;
  audit(event: {
    correlationId: string;
    action: "student.sign_in";
    result: "success" | "denied";
  }): Promise<void>;
}

export async function signInStudent(
  port: StudentSignInPort,
  input: { accessId: string; pin: string; network: string },
  pepper: string,
  correlationId: string,
) {
  let success = false;
  let authenticated = false;
  const accessId = input.accessId.trim().toLowerCase();
  try {
    if (
      !(await port.attempt(
        credentialRateKey("credential", accessId.slice(0, 128), pepper),
        credentialRateKey("network", input.network, pepper),
      ))
    )
      return false;
    const candidate =
      accessId.length <= 128 ? await port.lookup(accessId) : null;
    const validPin = /^[0-9]{6,12}$/.test(input.pin);
    // Unknown identities still make the same Auth request; secrets stay on the server.
    const password = deriveStudentPassword(
      candidate?.student_id ?? "unknown",
      validPin ? input.pin : "000000",
      pepper,
    );
    const userId = await port.authenticate(
      candidate?.auth_identifier ?? "unknown@students.ranza.invalid",
      password,
    );
    authenticated = userId !== null;
    if (candidate && validPin && userId === candidate.auth_user_id)
      success = await port.accept(candidate.student_id);
    if (!success) await port.failure(accessId);
    return success;
  } catch {
    return false;
  } finally {
    if (!success && authenticated) {
      try {
        await port.signOut();
      } catch {
        /* RLS remains authoritative. */
      }
    }
    try {
      await port.audit({
        correlationId,
        action: "student.sign_in",
        result: success ? "success" : "denied",
      });
    } catch {
      /* Never emit upstream error payloads. */
    }
  }
}
