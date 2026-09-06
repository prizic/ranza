import { describe, expect, it, vi } from "vitest";

import { completePlatformInvite } from "../../apps/control-plane/src/lib/platform-invite";

function authPort(user: { id: string } | null = { id: "user-1" }) {
  return {
    getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    hasActivePlatformAccess: vi.fn().mockResolvedValue(true),
    updateUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
  };
}

describe("completePlatformInvite", () => {
  it("rejects passwords shorter than 12 characters without touching auth", async () => {
    const auth = authPort();

    await expect(
      completePlatformInvite(auth, "short", "short"),
    ).resolves.toEqual({ ok: false, reason: "password-too-short" });
    expect(auth.getUser).not.toHaveBeenCalled();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("counts Unicode code points for the 12-character minimum", async () => {
    const auth = authPort();
    await expect(
      completePlatformInvite(auth, "🙂".repeat(6), "🙂".repeat(6)),
    ).resolves.toEqual({ ok: false, reason: "password-too-short" });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("rejects mismatched confirmation without updating the user", async () => {
    const auth = authPort();

    await expect(
      completePlatformInvite(
        auth,
        "a sufficiently long password",
        "a different long password",
      ),
    ).resolves.toEqual({ ok: false, reason: "password-mismatch" });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("requires an authenticated invite session", async () => {
    const auth = authPort(null);

    await expect(
      completePlatformInvite(
        auth,
        "a sufficiently long password",
        "a sufficiently long password",
      ),
    ).resolves.toEqual({ ok: false, reason: "unauthenticated" });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("requires active platform access at the mutation boundary", async () => {
    const auth = authPort();
    auth.hasActivePlatformAccess.mockResolvedValue(false);

    await expect(
      completePlatformInvite(
        auth,
        "a sufficiently long password",
        "a sufficiently long password",
      ),
    ).resolves.toEqual({ ok: false, reason: "unauthorized" });
    expect(auth.hasActivePlatformAccess).toHaveBeenCalledWith("user-1");
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("updates the authenticated user's password", async () => {
    const auth = authPort();

    await expect(
      completePlatformInvite(
        auth,
        "a sufficiently long password",
        "a sufficiently long password",
      ),
    ).resolves.toEqual({ ok: true });
    expect(auth.updateUser).toHaveBeenCalledWith({
      password: "a sufficiently long password",
    });
  });

  it("does not leak provider errors", async () => {
    const auth = authPort();
    auth.updateUser.mockResolvedValue({
      data: { user: null },
      error: new Error("provider detail"),
    });

    await expect(
      completePlatformInvite(
        auth,
        "a sufficiently long password",
        "a sufficiently long password",
      ),
    ).resolves.toEqual({ ok: false, reason: "update-failed" });
  });

  it("enforces Supabase's 72 UTF-8 byte password boundary", async () => {
    const auth = authPort();

    await expect(
      completePlatformInvite(auth, "a".repeat(72), "a".repeat(72)),
    ).resolves.toEqual({ ok: true });
    await expect(
      completePlatformInvite(auth, "a".repeat(73), "a".repeat(73)),
    ).resolves.toEqual({ ok: false, reason: "password-too-long" });
    await expect(
      completePlatformInvite(auth, "🙂".repeat(19), "🙂".repeat(19)),
    ).resolves.toEqual({ ok: false, reason: "password-too-long" });
  });
});
