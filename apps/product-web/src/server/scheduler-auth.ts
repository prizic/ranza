import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

export function verifySchedulerRequest(headers: Headers, secret: string) {
  if (secret.length < 32) return false;
  const authorization = headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  return timingSafeEqual(digest(authorization.slice(7)), digest(secret));
}
