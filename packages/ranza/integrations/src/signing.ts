import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Signing a delivery (ADR 0045).
 *
 * The signature is HMAC-SHA256, keyed by the endpoint's secret, over
 * `<timestamp>.<body>`: the timestamp is inside the signed text so that a
 * captured request cannot be replayed with a fresh timestamp header. A receiver
 * recomputes it from `X-Ranza-Timestamp` and the raw body it received, compares
 * in constant time, and rejects a timestamp it considers too old.
 */

export const SIGNATURE_HEADER = "X-Ranza-Signature";
export const TIMESTAMP_HEADER = "X-Ranza-Timestamp";

export function signDelivery(
  secret: string,
  timestamp: string,
  body: string,
): string {
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return `sha256=${digest}`;
}

/** What a receiver does, here so the tests and the documentation share one implementation. */
export function verifyDelivery(
  secret: string,
  timestamp: string,
  body: string,
  signature: string,
): boolean {
  const expected = Buffer.from(signDelivery(secret, timestamp, body));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** A new endpoint's secret: 32 random bytes, prefixed so a leaked one is recognisable. */
export function generateSecret(): string {
  return `whsec_${randomBytes(32).toString("base64url")}`;
}
