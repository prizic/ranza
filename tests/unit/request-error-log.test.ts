/**
 * The server's record of a failed request (RANZ-76) names where the request was
 * going and never its query, which can carry a credential: an invitation link
 * is `?token=` (PEOPLE-01).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestError } from "../../apps/operator-workspace/src/instrumentation";

type ErrorContext = Parameters<typeof onRequestError>[2];

describe("the record of a failed request", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("names the path and leaves out the query", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await onRequestError(
      Object.assign(new Error("render failed"), { digest: "4242" }),
      {
        path: "/tr/accept-invitation?token=an-invitation-credential",
        method: "GET",
        headers: {},
      },
      {
        routerKind: "App Router",
        routePath: "/[locale]/accept-invitation",
        routeType: "render",
        revalidateReason: undefined,
      } as ErrorContext,
    );

    const [line, record] = log.mock.calls[0] ?? [];
    expect(line).toBe("request.failed");
    expect(record).toMatchObject({
      digest: "4242",
      path: "/tr/accept-invitation",
    });
    expect(JSON.stringify(record)).not.toContain("an-invitation-credential");
  });
});
