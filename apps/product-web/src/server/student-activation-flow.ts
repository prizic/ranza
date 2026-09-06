import {
  credentialRateKey,
  deriveStudentPassword,
  verifyActivationCode,
} from "./student-credential-crypto";

export interface ActivationClaim {
  student_id: string;
  auth_user_id: string;
  auth_identifier: string;
  claim: string;
}
export interface ActivationPort {
  attempt(credentialKey: string, networkKey: string): Promise<boolean>;
  lookup(
    accessId: string,
  ): Promise<{ student_id: string; activation_hash: string } | null>;
  failure(accessId: string): Promise<void>;
  claim(studentId: string, hash: string): Promise<ActivationClaim | null>;
  ensureIdentity(claim: ActivationClaim): Promise<void>;
  bind(claim: ActivationClaim): Promise<boolean>;
  setPassword(claim: ActivationClaim, password: string): Promise<void>;
  signIn(claim: ActivationClaim, password: string): Promise<void>;
  abandon(claim: ActivationClaim): Promise<void>;
}

export async function activateStudent(
  port: ActivationPort,
  input: { accessId: string; code: string; pin: string; network: string },
  pepper: string,
): Promise<boolean> {
  let claim: ActivationClaim | null = null;
  try {
    const accessId = input.accessId.trim().toLowerCase();
    if (
      !(await port.attempt(
        credentialRateKey("credential", accessId.slice(0, 128), pepper),
        credentialRateKey("network", input.network, pepper),
      ))
    )
      return false;
    const candidate =
      accessId.length <= 128 ? await port.lookup(accessId) : null;
    const validCode = await verifyActivationCode(
      input.code,
      candidate?.activation_hash ?? "",
    );
    if (!candidate || !validCode || !/^[0-9]{6,12}$/.test(input.pin)) {
      await port.failure(accessId);
      return false;
    }
    claim = await port.claim(candidate.student_id, candidate.activation_hash);
    if (!claim) return false;
    // Reserving identity does not install the chosen PIN. Only a successful final
    // binding may set it, so a rejected/stale claim cannot alter another session.
    await port.ensureIdentity(claim);
    if (!(await port.bind(claim))) throw new Error("Activation unavailable");
    const password = deriveStudentPassword(claim.student_id, input.pin, pepper);
    await port.setPassword(claim, password);
    await port.signIn(claim, password);
    return true;
  } catch {
    if (claim) {
      try {
        await port.abandon(claim);
      } catch {
        /* fail closed */
      }
    }
    return false;
  }
}
