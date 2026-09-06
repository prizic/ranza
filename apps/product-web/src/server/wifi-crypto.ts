import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";
const version = "aes-256-gcm-v1";

export interface WifiDetails {
  instructions: string;
  networkName: string;
  password: string;
}

function requiredString(
  value: unknown,
  label: string,
  maximum: number,
  allowEmpty = false,
) {
  if (typeof value !== "string") throw new TypeError(`${label} is required`);
  const parsed = value.trim();
  if ((!allowEmpty && parsed.length === 0) || parsed.length > maximum) {
    throw new RangeError(`${label} is invalid`);
  }
  return parsed;
}

export function parseWifiDetails(input: unknown): WifiDetails {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Wi-Fi details are required");
  }
  const value = input as Record<string, unknown>;
  return {
    instructions: requiredString(
      value.instructions,
      "instructions",
      1000,
      true,
    ),
    networkName: requiredString(value.networkName, "network name", 128),
    password: requiredString(value.password, "password", 256),
  };
}

function encryptionKey(encoded: string) {
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("Protected Wi-Fi is unavailable");
  return key;
}

function additionalData(branchId: string) {
  return Buffer.from(JSON.stringify([version, branchId]), "utf8");
}

export function encryptWifiPayload(
  input: WifiDetails,
  branchId: string,
  encodedKey: string,
) {
  const details = parseWifiDetails(input);
  const nonce = randomBytes(12);
  const cipher = createCipheriv(algorithm, encryptionKey(encodedKey), nonce);
  cipher.setAAD(additionalData(branchId));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(details), "utf8"),
    cipher.final(),
  ]);
  return [
    version,
    nonce.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptWifiPayload(
  envelope: string,
  branchId: string,
  encodedKey: string,
): WifiDetails {
  try {
    const [payloadVersion, nonce, tag, ciphertext, extra] = envelope.split(".");
    if (payloadVersion !== version || !nonce || !tag || !ciphertext || extra) {
      throw new Error("malformed");
    }
    const decipher = createDecipheriv(
      algorithm,
      encryptionKey(encodedKey),
      Buffer.from(nonce, "base64url"),
    );
    decipher.setAAD(additionalData(branchId));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    return parseWifiDetails(JSON.parse(plaintext));
  } catch {
    throw new Error("Protected Wi-Fi is unavailable");
  }
}

export function wifiEncryptionKey() {
  const key = process.env.WIFI_ENCRYPTION_KEY_V1;
  if (!key) throw new Error("Protected Wi-Fi is unavailable");
  encryptionKey(key);
  return key;
}
