// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";

const createControlPlaneClient = vi.hoisted(() => vi.fn());

vi.mock("../../apps/control-plane/src/lib/supabase/server", () => ({
  createControlPlaneClient,
}));

import { requestPasswordRecoveryAction } from "../../apps/control-plane/src/app/[locale]/forgot-password/actions";

afterEach(() => {
  createControlPlaneClient.mockReset();
  vi.unstubAllEnvs();
});

it("requests a recovery link through the fixed Control Plane callback", async () => {
  vi.stubEnv("CONTROL_PLANE_ORIGIN", "https://admin.ranza.prizic.com");
  const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });
  createControlPlaneClient.mockResolvedValue({
    auth: { resetPasswordForEmail },
  });
  const formData = new FormData();
  formData.set("locale", "en");
  formData.set("email", "admin@example.com");

  await expect(requestPasswordRecoveryAction(formData)).rejects.toMatchObject({
    digest: expect.stringContaining("/en/forgot-password?sent=1"),
  });

  expect(resetPasswordForEmail).toHaveBeenCalledWith("admin@example.com", {
    redirectTo: "https://admin.ranza.prizic.com/en/auth/confirm",
  });
});

it("uses the same generic completion state when Supabase returns an error", async () => {
  vi.stubEnv("CONTROL_PLANE_ORIGIN", "https://admin.ranza.prizic.com");
  const resetPasswordForEmail = vi
    .fn()
    .mockResolvedValue({ error: new Error("unknown email") });
  createControlPlaneClient.mockResolvedValue({
    auth: { resetPasswordForEmail },
  });
  const formData = new FormData();
  formData.set("locale", "tr");
  formData.set("email", "unknown@example.com");

  await expect(requestPasswordRecoveryAction(formData)).rejects.toMatchObject({
    digest: expect.stringContaining("/tr/forgot-password?sent=1"),
  });
});

it("fails closed when the production Control Plane origin is missing", async () => {
  vi.stubEnv("CONTROL_PLANE_ORIGIN", "");
  vi.stubEnv("NODE_ENV", "production");
  const resetPasswordForEmail = vi.fn();
  createControlPlaneClient.mockResolvedValue({
    auth: { resetPasswordForEmail },
  });
  const formData = new FormData();
  formData.set("locale", "en");
  formData.set("email", "admin@example.com");

  await expect(requestPasswordRecoveryAction(formData)).rejects.toThrow(
    "Control Plane origin is required in production",
  );
  expect(resetPasswordForEmail).not.toHaveBeenCalled();
});
