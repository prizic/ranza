// Node-only primitives; runtime configuration is read exclusively by the server gateway.
import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

function slowHash(code: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      code,
      salt,
      32,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
}

export async function issueActivationCode() {
  const raw = randomBytes(16).toString("hex").toUpperCase();
  const code = (raw.match(/.{4}/g) ?? []).join("-");
  const salt = randomBytes(16).toString("hex");
  const hash = `scrypt-v1$${salt}$${(await slowHash(raw, salt)).toString("hex")}`;
  return { code, hash };
}

export async function verifyActivationCode(code: string, hash: string) {
  const normalized = code.replaceAll("-", "").trim().toUpperCase();
  const [version, salt, expected] = hash.split("$");
  const valid =
    version === "scrypt-v1" &&
    /^[a-f0-9]{32}$/.test(salt ?? "") &&
    /^[a-f0-9]{64}$/.test(expected ?? "");
  // Unknown, malformed and missing records still pay the same slow-hash cost.
  const result = await slowHash(
    normalized.slice(0, 128),
    valid ? (salt ?? "") : "0".repeat(32),
  );
  return (
    valid &&
    /^[A-F0-9]{32}$/.test(normalized) &&
    timingSafeEqual(result, Buffer.from(expected ?? "", "hex"))
  );
}

function requirePepper(pepper: string) {
  if (pepper.length < 32)
    throw new Error("Student credential gateway is not configured");
}

export function deriveStudentPassword(
  studentId: string,
  pin: string,
  pepper: string,
) {
  requirePepper(pepper);
  if (!/^[0-9]{6,12}$/.test(pin)) throw new Error("Invalid credentials");
  return `pin-v1.${createHmac("sha256", pepper)
    .update(JSON.stringify(["pin-v1", studentId, pin]))
    .digest("base64url")}`;
}

export function credentialRateKey(
  kind: "network" | "credential",
  signal: string,
  pepper: string,
) {
  requirePepper(pepper);
  return createHmac("sha256", pepper)
    .update(JSON.stringify(["rate-v1", kind, signal]))
    .digest("hex");
}

export function networkSignal(
  headers: Headers,
  trustedHeader?: string,
  production = process.env.NODE_ENV === "production",
) {
  if (!trustedHeader) {
    if (production) throw new Error("A trusted client IP header is required");
    return "development";
  }
  const signal = headers.get(trustedHeader)?.trim().toLowerCase() ?? "";
  if (isIP(signal) === 0)
    throw new Error("A trusted client IP address is required");
  return signal;
}
