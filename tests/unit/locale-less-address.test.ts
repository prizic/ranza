/**
 * An address with no language in it opens in the language last used instead of
 * the framework's 404 (SHELL-03): a bookmark from before the language prefix,
 * or a path typed by hand. The API and the framework's own files are not
 * addresses a person types and are never redirected.
 */
import { NextRequest } from "../../apps/operator-workspace/node_modules/next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "../../apps/operator-workspace/src/proxy";

function ask(path: string, headers: Record<string, string> = {}) {
  return proxy(new NextRequest(`http://localhost:3000${path}`, { headers }));
}

describe("an address with no language", () => {
  it("SHELL-03: opens in the remembered language and keeps the path and the query", () => {
    const response = ask("/reservations?property=p-1", {
      cookie: "ranza_locale=ar",
    });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/ar/reservations?property=p-1",
    );
  });

  it("SHELL-03: falls back to the browser's language, then Turkish", () => {
    expect(
      ask("/today", { "accept-language": "en-GB,en;q=0.9" }).headers.get(
        "location",
      ),
    ).toBe("http://localhost:3000/en/today");
    expect(ask("/today").headers.get("location")).toBe(
      "http://localhost:3000/tr/today",
    );
  });

  it("SHELL-03: leaves an address that has a language alone", () => {
    const response = ask("/en/reservations");
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("SHELL-03: the proxy is not asked about the API, the framework's files or the icon", () => {
    const [matcher] = config.matcher;
    const matches = (path: string) => new RegExp(`^${matcher!}$`).test(path);
    expect(matches("/today")).toBe(true);
    expect(matches("/en/today")).toBe(true);
    expect(matches("/api/auth/sign-in/email")).toBe(false);
    expect(matches("/_next/static/chunk.js")).toBe(false);
    expect(matches("/icon.svg")).toBe(false);
  });
});
