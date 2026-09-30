/**
 * Signing in or out ends the last person's remembered Property (OA-S3-05,
 * ADR 0019). Better Auth is mocked: what it answers is its own; what only this
 * route adds is the cookie that clears ranza_property, and nothing else.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const handler = vi.fn();

vi.mock("../../apps/operator-workspace/src/server/composition", () => ({
  getComposition: () => ({ auth: { handler } }),
}));

const { POST } =
  await import("../../apps/operator-workspace/src/app/api/auth/[...all]/route");

const FORGET = "ranza_property=; Path=/; SameSite=Lax; Max-Age=0";
const post = (path: string) =>
  new Request(`http://workspace.test/api/auth${path}`, { method: "POST" });

beforeEach(() => {
  handler.mockReset();
  const answer = new Response("{}", { status: 200 });
  answer.headers.append("Set-Cookie", "better-auth.session_token=x; Path=/");
  handler.mockResolvedValue(answer);
});

describe("the auth route", () => {
  it.each(["/sign-out", "/sign-in/email"])(
    "clears the remembered Property on %s, keeping Better Auth's own cookie",
    async (path) => {
      const response = await POST(post(path));
      expect(response.status).toBe(200);
      const cookies = response.headers.getSetCookie();
      expect(cookies).toContain("better-auth.session_token=x; Path=/");
      expect(cookies).toContain(FORGET);
    },
  );

  it("leaves it alone on every other auth request", async () => {
    const response = await POST(post("/get-session"));
    expect(response.headers.getSetCookie()).not.toContain(FORGET);
  });
});
