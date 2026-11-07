/**
 * The route a Guest's link is accepted through (GP-S3-01, GP-S3-09, GP-S3-13).
 *
 * It is the one place the browser reaches the database function that writes
 * `stays.user_id`, so each way of reaching it that is not the Portal's own
 * form is refused here, before the function runs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const acceptInvitation = vi.fn();
const currentViewer = vi.fn();

vi.mock("../../apps/guest-portal/src/server/portal-invitation", () => ({
  acceptInvitation,
}));
vi.mock("../../apps/guest-portal/src/server/viewer", () => ({ currentViewer }));

const { POST } =
  await import("../../apps/guest-portal/src/app/api/portal-invitation/accept/route");

const ORIGIN = "http://portal.test";
const TOKEN = "a-token-the-desk-handed-over";
const VIEWER = { userId: "d9300001-0000-4000-8000-000000000001" };

/** What a request's own URL names behind the proxy: the container, not the site. */
const CONTAINER = "http://0.0.0.0:3001";

function request(
  body: unknown,
  headers: Record<string, string> = {},
  raw?: string,
  served = ORIGIN,
): Request {
  return new Request(`${served}/api/portal-invitation/accept`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: raw ?? JSON.stringify(body),
  });
}

let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  acceptInvitation.mockReset();
  currentViewer.mockReset().mockResolvedValue(VIEWER);
  logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  logged.mockRestore();
  vi.unstubAllEnvs();
});

describe("accepting a Guest's link", () => {
  it("GP-S3-01: passes the database's answer on, uncached", async () => {
    acceptInvitation.mockResolvedValue({
      outcome: "accepted",
      linkedStays: 2,
    });

    const response = await POST(request({ token: TOKEN }, { origin: ORIGIN }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      outcome: "accepted",
      linkedStays: 2,
    });
    expect(acceptInvitation).toHaveBeenCalledWith(TOKEN);
  });

  it("GP-S3-03: a link that does not work is an answer, not an error", async () => {
    acceptInvitation.mockResolvedValue({ outcome: "used", linkedStays: 0 });

    const response = await POST(request({ token: TOKEN }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ outcome: "used", linkedStays: 0 });
    expect(logged).not.toHaveBeenCalled();
  });

  it("GP-S3-09: refuses a request with no session before the function runs", async () => {
    currentViewer.mockResolvedValue(null);

    const response = await POST(request({ token: TOKEN }));

    expect(response.status).toBe(401);
    expect(acceptInvitation).not.toHaveBeenCalled();
  });

  it("GP-S3-09: refuses when the session ends between the check and the function", async () => {
    acceptInvitation.mockResolvedValue(null);

    const response = await POST(request({ token: TOKEN }));

    expect(response.status).toBe(401);
  });

  it("GP-S3-09: refuses a page on another site making the browser accept a stranger's link", async () => {
    const response = await POST(
      request({ token: TOKEN }, { origin: "https://elsewhere.test" }),
    );

    expect(response.status).toBe(403);
    expect(acceptInvitation).not.toHaveBeenCalled();
  });

  it("GP-S3-09: behind the proxy, accepts the Portal's own page though the request names the container", async () => {
    vi.stubEnv("BETTER_AUTH_URL", ORIGIN);
    acceptInvitation.mockResolvedValue({ outcome: "accepted", linkedStays: 1 });

    const response = await POST(
      request({ token: TOKEN }, { origin: ORIGIN }, undefined, CONTAINER),
    );

    expect(response.status).toBe(200);
    expect(acceptInvitation).toHaveBeenCalledWith(TOKEN);
  });

  it("GP-S3-09: behind the proxy, still refuses another site, and says so in the log", async () => {
    vi.stubEnv("BETTER_AUTH_URL", ORIGIN);
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});

    const response = await POST(
      request(
        { token: TOKEN },
        { origin: "https://elsewhere.test" },
        undefined,
        CONTAINER,
      ),
    );

    expect(response.status).toBe(403);
    expect(acceptInvitation).not.toHaveBeenCalled();
    expect(warned).toHaveBeenCalledWith("portal_invitation.accept_refused", {
      origin: "https://elsewhere.test",
    });
    warned.mockRestore();
  });

  it("GP-S3-09: refuses a body that is not JSON, which a cross-site form can send and a script cannot without a preflight", async () => {
    const response = await POST(
      request(null, { "content-type": "text/plain" }, `{"token":"${TOKEN}"}`),
    );

    expect(response.status).toBe(415);
    expect(acceptInvitation).not.toHaveBeenCalled();
  });

  it.each([
    ["no token", {}],
    ["a token that is not a string", { token: 12 }],
    ["a token longer than any the desk makes", { token: "x".repeat(201) }],
  ])("GP-S3-06: refuses %s without asking the database", async (_, body) => {
    const response = await POST(request(body));

    expect(response.status).toBe(400);
    expect(acceptInvitation).not.toHaveBeenCalled();
  });

  it("GP-S3-06: refuses a body that is not parseable", async () => {
    const response = await POST(request(null, {}, "{not json"));

    expect(response.status).toBe(400);
    expect(acceptInvitation).not.toHaveBeenCalled();
  });

  it("GP-S3-13: a fault is a 500, logged with the viewer and never with the token", async () => {
    const outage = new Error("connection refused");
    acceptInvitation.mockRejectedValue(outage);

    const response = await POST(request({ token: TOKEN }));

    expect(response.status).toBe(500);
    expect(logged).toHaveBeenCalledWith(
      "portal_invitation.accept_failed",
      { userId: VIEWER.userId },
      outage,
    );
    expect(JSON.stringify(logged.mock.calls)).not.toContain(TOKEN);
  });
});
