// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const createControlPlaneClient = vi.hoisted(() => vi.fn());

vi.mock("../../apps/control-plane/src/lib/supabase/server", () => ({
  createControlPlaneClient,
}));

import {
  GET,
  POST,
} from "../../apps/control-plane/src/app/[locale]/auth/confirm/route";

afterEach(() => {
  createControlPlaneClient.mockReset();
});

// Real GoTrue tokens are SHA-224 hex; a 64-char fixture hid a length bug.
const tokenHash = "a".repeat(56);

function context(locale = "en") {
  return { params: Promise.resolve({ locale }) };
}

function postRequest(
  locale = "en",
  options: { origin?: string | null; token?: string; type?: string } = {},
) {
  const origin =
    options.origin === undefined
      ? "https://admin.ranza.prizic.com"
      : options.origin;
  const headers = new Headers({
    cookie: [
      `__Host-ranza_platform_setup_token=${options.token ?? tokenHash}`,
      `__Host-ranza_platform_setup_type=${options.type ?? "invite"}`,
    ].join("; "),
  });
  if (origin) headers.set("origin", origin);
  return new Request(`https://admin.ranza.prizic.com/${locale}/auth/confirm`, {
    method: "POST",
    headers,
  });
}

describe("the platform invite confirmation route", () => {
  it("rejects malformed links without calling Supabase", async () => {
    const response = await GET(
      new Request("https://admin.ranza.prizic.com/en/auth/confirm?type=invite"),
      context(),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://admin.ranza.prizic.com/en/sign-in?error=invalid-invite",
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(createControlPlaneClient).not.toHaveBeenCalled();
  });

  it("stores a valid token without consuming it during GET", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ error: null });
    createControlPlaneClient.mockResolvedValue({ auth: { verifyOtp } });

    const response = await GET(
      new Request(
        `https://admin.ranza.prizic.com/en/auth/confirm?token_hash=${tokenHash}&type=invite`,
      ),
      context(),
    );

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(createControlPlaneClient).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://admin.ranza.prizic.com/en/auth/accept",
    );
    expect(response.headers.get("set-cookie")).toContain(
      `__Host-ranza_platform_setup_token=${tokenHash}`,
    );
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")?.toLowerCase()).toContain(
      "samesite=strict",
    );
  });

  it("consumes the stored token only after an explicit POST", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ error: null });
    createControlPlaneClient.mockResolvedValue({ auth: { verifyOtp } });

    const response = await POST(postRequest(), context());

    expect(verifyOtp).toHaveBeenCalledWith({
      token_hash: tokenHash,
      type: "invite",
    });
    expect(response.headers.get("location")).toBe(
      "https://admin.ranza.prizic.com/en/set-password",
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("returns failed or reused POST tokens to a safe sign-in page", async () => {
    const verifyOtp = vi
      .fn()
      .mockResolvedValue({ error: new Error("expired token detail") });
    createControlPlaneClient.mockResolvedValue({ auth: { verifyOtp } });

    const response = await POST(postRequest("ar"), context("ar"));

    expect(response.headers.get("location")).toBe(
      "https://admin.ranza.prizic.com/ar/sign-in?error=invalid-invite",
    );
  });

  it("returns malformed invite cookies safely to sign-in", async () => {
    const response = await POST(postRequest("en", { token: "%" }), context());

    expect(response.headers.get("location")).toBe(
      "https://admin.ranza.prizic.com/en/sign-in?error=invalid-invite",
    );
    expect(createControlPlaneClient).not.toHaveBeenCalled();
  });

  it("does not honor an attacker-controlled redirect target", async () => {
    const response = await GET(
      new Request(
        `https://admin.ranza.prizic.com/en/auth/confirm?token_hash=${tokenHash}&type=invite&next=https://evil.example`,
      ),
      context(),
    );

    expect(response.headers.get("location")).toBe(
      "https://admin.ranza.prizic.com/en/auth/accept",
    );
  });

  it("rejects cross-origin and origin-less confirmation posts", async () => {
    const foreign = await POST(
      postRequest("en", { origin: "https://storefront.prizic.com" }),
      context(),
    );
    const missing = await POST(postRequest("en", { origin: null }), context());

    expect(foreign.headers.get("location")).toContain(
      "/en/sign-in?error=invalid-invite",
    );
    expect(missing.headers.get("location")).toContain(
      "/en/sign-in?error=invalid-invite",
    );
    expect(createControlPlaneClient).not.toHaveBeenCalled();
  });

  it("supports scanner-safe password recovery confirmation", async () => {
    const getResponse = await GET(
      new Request(
        `https://admin.ranza.prizic.com/en/auth/confirm?token_hash=${tokenHash}&type=recovery`,
      ),
      context(),
    );
    expect(getResponse.headers.get("location")).toBe(
      "https://admin.ranza.prizic.com/en/auth/accept?type=recovery",
    );
    expect(getResponse.headers.get("set-cookie")).toContain(
      "__Host-ranza_platform_setup_type=recovery",
    );

    const verifyOtp = vi.fn().mockResolvedValue({ error: null });
    createControlPlaneClient.mockResolvedValue({ auth: { verifyOtp } });
    const postResponse = await POST(
      postRequest("en", { type: "recovery" }),
      context(),
    );
    expect(verifyOtp).toHaveBeenCalledWith({
      token_hash: tokenHash,
      type: "recovery",
    });
    expect(postResponse.headers.get("location")).toContain("/en/set-password");
  });

  it("rejects unbounded or malformed token hashes before setting them", async () => {
    const response = await GET(
      new Request(
        `https://admin.ranza.prizic.com/en/auth/confirm?token_hash=${"a".repeat(4096)}&type=invite`,
      ),
      context(),
    );
    expect(response.headers.get("location")).toContain(
      "/en/sign-in?error=invalid-invite",
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(response.headers.get("set-cookie")).not.toContain("a".repeat(100));
  });
});
