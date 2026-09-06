// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const createControlPlaneClient = vi.hoisted(() => vi.fn());

vi.mock(
  "../../apps/control-plane/src/lib/supabase/server",
  () => ({ createControlPlaneClient }),
);

import {
  GET,
  POST,
} from "../../apps/control-plane/src/app/[locale]/auth/confirm/route";

afterEach(() => {
  createControlPlaneClient.mockReset();
});

function context(locale = "en") {
  return { params: Promise.resolve({ locale }) };
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
        "https://admin.ranza.prizic.com/en/auth/confirm?token_hash=one-time-token&type=invite",
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
      "ranza_platform_invite_token=one-time-token",
    );
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")?.toLowerCase()).toContain(
      "samesite=strict",
    );
  });

  it("consumes the stored token only after an explicit POST", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ error: null });
    createControlPlaneClient.mockResolvedValue({ auth: { verifyOtp } });

    const response = await POST(
      new Request("https://admin.ranza.prizic.com/en/auth/confirm", {
        method: "POST",
        headers: {
          cookie: "ranza_platform_invite_token=one-time-token",
        },
      }),
      context(),
    );

    expect(verifyOtp).toHaveBeenCalledWith({
      token_hash: "one-time-token",
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

    const response = await POST(
      new Request("https://admin.ranza.prizic.com/ar/auth/confirm", {
        method: "POST",
        headers: { cookie: "ranza_platform_invite_token=expired" },
      }),
      context("ar"),
    );

    expect(response.headers.get("location")).toBe(
      "https://admin.ranza.prizic.com/ar/sign-in?error=invalid-invite",
    );
  });

  it("returns malformed invite cookies safely to sign-in", async () => {
    const response = await POST(
      new Request("https://admin.ranza.prizic.com/en/auth/confirm", {
        method: "POST",
        headers: { cookie: "ranza_platform_invite_token=%" },
      }),
      context(),
    );

    expect(response.headers.get("location")).toBe(
      "https://admin.ranza.prizic.com/en/sign-in?error=invalid-invite",
    );
    expect(createControlPlaneClient).not.toHaveBeenCalled();
  });

  it("does not honor an attacker-controlled redirect target", async () => {
    const response = await GET(
      new Request(
        "https://admin.ranza.prizic.com/en/auth/confirm?token_hash=valid&type=invite&next=https://evil.example",
      ),
      context(),
    );

    expect(response.headers.get("location")).toBe(
      "https://admin.ranza.prizic.com/en/auth/accept",
    );
  });
});
