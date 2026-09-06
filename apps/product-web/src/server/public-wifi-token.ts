import { createHash, createHmac, randomBytes } from "node:crypto";

export function hashWifiToken(token: string) {
  return /^[a-f0-9]{64}$/.test(token)
    ? createHash("sha256").update(token).digest("hex")
    : null;
}
export function generateWifiToken() {
  const token = randomBytes(32).toString("hex");
  return { token, hash: createHash("sha256").update(token).digest("hex") };
}
export function publicWifiLink(
  origin: string,
  locale: "tr" | "en" | "ar",
  token: string,
) {
  if (!hashWifiToken(token)) throw new Error("Wi-Fi link unavailable");
  const url = new URL(`/${locale}/public-wifi`, origin);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Wi-Fi link unavailable");
  url.hash = token;
  return url.toString();
}
export function wifiNetworkHash(network: string, key: string) {
  return createHmac("sha256", Buffer.from(key, "base64"))
    .update(JSON.stringify(["wifi-public-rate-v1", network.slice(0, 256)]))
    .digest("hex");
}
