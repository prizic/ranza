import { parseServerEnvironment } from "@ranza/config";
import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { cookies } from "next/headers";

function environment() {
  const parsed = parseServerEnvironment(process.env);
  const url = parsed.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = parsed.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !publishableKey) {
    throw new Error("The Product Web Supabase environment is not configured.");
  }
  return { publishableKey, url };
}

export async function createProductWebClient(options?: {
  correlationId?: string;
}) {
  const env = environment();
  const cookieStore = await cookies();
  const setAll: SetAllCookies = (values) => {
    try {
      for (const { name, options, value } of values) {
        cookieStore.set(name, value, options);
      }
    } catch {
      // Server Components cannot persist refreshed cookies; actions and callbacks can.
    }
  };

  return createServerClient(env.url, env.publishableKey, {
    cookies: { getAll: () => cookieStore.getAll(), setAll },
    ...(options?.correlationId
      ? { global: { headers: { "x-correlation-id": options.correlationId } } }
      : {}),
  });
}
