import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  decryptWifiPayload,
  encryptWifiPayload,
  parseWifiDetails,
} from "../../apps/product-web/src/server/wifi-crypto";

const key = randomBytes(32).toString("base64");
const details = {
  instructions: "Use the student network in the common areas.",
  networkName: "Ranza Students",
  password: "correct horse battery staple",
};

describe("protected Wi-Fi cryptography", () => {
  it("round trips a versioned payload bound to its Branch", () => {
    const encrypted = encryptWifiPayload(details, "branch-1", key);
    expect(encrypted).toMatch(/^aes-256-gcm-v1\./);
    expect(encrypted).not.toContain(details.networkName);
    expect(encrypted).not.toContain(details.password);
    expect(decryptWifiPayload(encrypted, "branch-1", key)).toEqual(details);
  });

  it("uses a fresh nonce for every rotation", () => {
    expect(encryptWifiPayload(details, "branch-1", key)).not.toBe(
      encryptWifiPayload(details, "branch-1", key),
    );
  });

  it("rejects tampering, the wrong Branch, and the wrong key", () => {
    const encrypted = encryptWifiPayload(details, "branch-1", key);
    expect(() => decryptWifiPayload(`${encrypted}x`, "branch-1", key)).toThrow(
      "unavailable",
    );
    expect(() => decryptWifiPayload(encrypted, "branch-2", key)).toThrow(
      "unavailable",
    );
    expect(() =>
      decryptWifiPayload(
        encrypted,
        "branch-1",
        randomBytes(32).toString("base64"),
      ),
    ).toThrow("unavailable");
  });

  it("validates all secret fields before encryption", () => {
    expect(parseWifiDetails(details)).toEqual(details);
    expect(() => parseWifiDetails({ ...details, password: "" })).toThrow(
      "password",
    );
    expect(() =>
      parseWifiDetails({ ...details, networkName: "x".repeat(129) }),
    ).toThrow("network name");
  });
});
