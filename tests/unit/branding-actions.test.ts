/**
 * What the Branding screen's actions answer, and what they record (RANZ-47).
 *
 * The module proves the commands and the catalogue proves the words. This
 * proves the step between them: that a failure is turned into a status and
 * never into the module's text, that the one failure nobody expected is
 * recorded rather than shown as one more refusal, and that the Organization a
 * save lands in is the one the viewer's permission names and not one the form
 * claims.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const saveBrand = vi.fn();
const resetBrand = vi.fn();
const revalidatePath = vi.fn();

// The application resolves its own copy of next, so the mock names that copy.
vi.mock("../../apps/operator-workspace/node_modules/next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));
vi.mock("../../apps/operator-workspace/src/server/viewer", () => ({
  currentViewer: async () => ({ userId: VIEWER }),
  permittedProperties: async () => [
    { propertyId: PROPERTY, organizationId: ORGANIZATION },
  ],
}));
vi.mock("../../apps/operator-workspace/src/server/composition", () => ({
  getComposition: () => ({ branding: { saveBrand, resetBrand } }),
}));

const VIEWER = "df100001-0000-4000-8000-000000000001";
const ORGANIZATION = "df100002-0000-4000-8000-000000000001";
const PROPERTY = "df100003-0000-4000-8000-000000000001";
const OTHER_PROPERTY = "df100003-0000-4000-8000-000000000002";

const actions =
  await import("../../apps/operator-workspace/src/server/branding");
const { BrandingInputError, BrandingRefusedError } =
  await import("../../packages/ranza/branding/src");

function form(fields: Record<string, string | Blob>): FormData {
  const data = new FormData();
  data.set("locale", "en");
  data.set("propertyId", PROPERTY);
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  saveBrand.mockReset().mockResolvedValue({});
  resetBrand.mockReset().mockResolvedValue(undefined);
  revalidatePath.mockReset();
  logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  logged.mockRestore();
});

describe("saving the brand", () => {
  it("BR-S1-32: an unexpected failure is reported and the screen is told only that it failed", async () => {
    const secret = new Error(
      "connect ECONNREFUSED 10.0.0.7:5432 password=hunter2",
    );
    saveBrand.mockRejectedValue(secret);

    const outcome = await actions.saveBranding(
      { status: "idle" },
      form({ color: "#0f5132" }),
    );

    expect(outcome).toEqual({ status: "error" });
    expect(JSON.stringify(outcome)).not.toContain("hunter2");
    expect(logged).toHaveBeenCalledWith(
      "branding.save_failed",
      { propertyId: PROPERTY, userId: VIEWER },
      secret,
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("BR-S1-32: and a reset that fails the same way is reported too", async () => {
    resetBrand.mockRejectedValue(new Error("deadlock detected"));
    expect(await actions.resetBranding({ status: "idle" }, form({}))).toEqual({
      status: "error",
    });
    expect(logged).toHaveBeenCalledTimes(1);
  });

  it("BR-S1-02: a refused colour is an answer naming the rule, and is not reported", async () => {
    saveBrand.mockRejectedValue(
      new BrandingInputError({ field: "color", reason: "invalid" }),
    );
    expect(
      await actions.saveBranding({ status: "idle" }, form({ color: "red" })),
    ).toEqual({
      status: "invalid",
      rejection: { field: "color", reason: "invalid" },
    });
    expect(logged).not.toHaveBeenCalled();
  });

  it("BR-S1-42: a logo of 600 KB or 2 MB reaches the module whole, and its refusal reaches the screen", async () => {
    saveBrand.mockRejectedValue(
      new BrandingInputError({ field: "logo", reason: "too_large" }),
    );
    for (const size of [600 * 1024, 2 * 1024 * 1024]) {
      const file = new File([new Uint8Array(size)], "logo.png");
      expect(
        await actions.saveBranding({ status: "idle" }, form({ logo: file })),
      ).toEqual({
        status: "invalid",
        rejection: { field: "logo", reason: "too_large" },
      });
      const call = saveBrand.mock.calls.at(-1)![1] as { logo: Uint8Array };
      expect(call.logo.byteLength).toBe(size);
    }
    expect(logged).not.toHaveBeenCalled();
  });

  it("BR-S1-13: a refusal is an answer and is not reported", async () => {
    saveBrand.mockRejectedValue(new BrandingRefusedError());
    expect(
      await actions.saveBranding(
        { status: "idle" },
        form({ color: "#0f5132" }),
      ),
    ).toEqual({ status: "refused" });
    expect(logged).not.toHaveBeenCalled();
  });

  it("BR-S1-13: the Organization is the one the viewer's permission names, not one the form claims", async () => {
    expect(
      await actions.saveBranding(
        { status: "idle" },
        form({ propertyId: OTHER_PROPERTY, color: "#0f5132" }),
      ),
    ).toEqual({ status: "refused" });
    expect(saveBrand).not.toHaveBeenCalled();

    await actions.saveBranding({ status: "idle" }, form({ color: "#0f5132" }));
    expect(saveBrand).toHaveBeenCalledWith(VIEWER, {
      organizationId: ORGANIZATION,
      primaryColor: "#0f5132",
    });
  });

  it("BR-S1-05: what the form leaves out stays, an empty colour clears it, and a chosen file is the logo", async () => {
    await actions.saveBranding(
      { status: "idle" },
      form({ logoAction: "remove" }),
    );
    expect(saveBrand).toHaveBeenLastCalledWith(VIEWER, {
      organizationId: ORGANIZATION,
      logo: null,
    });

    await actions.saveBranding({ status: "idle" }, form({ color: " " }));
    expect(saveBrand).toHaveBeenLastCalledWith(VIEWER, {
      organizationId: ORGANIZATION,
      primaryColor: null,
    });

    await actions.saveBranding(
      { status: "idle" },
      form({ logo: new File([new Uint8Array([1, 2, 3])], "logo.png") }),
    );
    const call = saveBrand.mock.calls.at(-1)![1] as { logo: Uint8Array };
    expect([...call.logo]).toEqual([1, 2, 3]);
  });
});
