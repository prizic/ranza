import { parseServerEnvironment } from "@ranza/config";
import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { cookies } from "next/headers";

function environment() {
  const parsed = parseServerEnvironment(process.env);
  const url = parsed.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = parsed.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !publishableKey) {
    throw new Error(
      "The Control Plane Supabase environment is not configured.",
    );
  }
  return { publishableKey, url };
}

export function hasControlPlaneDatabase(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.startsWith("replace-with"),
  );
}

export async function createControlPlaneClient(correlationId?: string) {
  const env = environment();
  const cookieStore = await cookies();
  const setAll: SetAllCookies = (values) => {
    try {
      for (const { name, options, value } of values) {
        cookieStore.set(name, value, options);
      }
    } catch {
      // Server Components cannot write cookies; proxy/session actions refresh them.
    }
  };
  const cookieMethods = {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll,
    },
  };

  return correlationId
    ? createServerClient(env.url, env.publishableKey, {
        ...cookieMethods,
        global: { headers: { "x-correlation-id": correlationId } },
      })
    : createServerClient(env.url, env.publishableKey, cookieMethods);
}
