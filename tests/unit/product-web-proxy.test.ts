// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";

import * as productProxy from "../../apps/product-web/src/proxy";

function request(url: string) {
  const cookieValues = new Map<string, string>();
  return {
    cookies: {
      getAll: () =>
        Array.from(cookieValues, ([name, value]) => ({ name, value })),
      set: (name: string, value: string) => cookieValues.set(name, value),
    },
    headers: new Headers(),
    nextUrl: new URL(url),
    url,
  } as any;
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

it("refreshes Supabase auth and propagates rotated cookies and cache headers", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "publishable");
  const createServerClient = vi.fn(
    (_url: string, _key: string, options: any) => ({
      auth: {
        getClaims: async () => {
          options.cookies.setAll(
            [
              {
                name: "sb-session",
                value: "rotated",
                options: { httpOnly: true, path: "/" },
              },
            ],
            { "Cache-Control": "private, no-store", Pragma: "no-cache" },
          );
        },
      },
    }),
  );

  const refresh = (
    productProxy as typeof productProxy & {
      refreshProductWebSession?: (
        request: any,
        createClient: typeof createServerClient,
      ) => Promise<any>;
    }
  ).refreshProductWebSession;
  expect(refresh).toBeTypeOf("function");
  if (!refresh) return;
  const response = await refresh(
    request("https://app.ranza.prizic.com/tr/student"),
    createServerClient,
  );

  expect(createServerClient).toHaveBeenCalledOnce();
  expect(response.cookies.get("sb-session")?.value).toBe("rotated");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("pragma")).toBe("no-cache");
});

it("keeps the root Turkish redirect without requiring auth configuration", async () => {
  const response = await productProxy.proxy(request("http://localhost:3101/"));

  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("http://localhost:3101/tr");
});
