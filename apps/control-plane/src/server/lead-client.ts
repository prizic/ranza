import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function leadReviewClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const store = await cookies();
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (values) => {
        try {
          values.forEach(({ name, value, options }) =>
            store.set(name, value, options),
          );
        } catch {
          /* Server Components cannot write cookies; auth middleware refreshes them. */
        }
      },
    },
  });
  // getUser validates the token with Auth; row policies also require a live
  // session, MFA and current platform membership for every lead read/update.
  const { data, error } = await client.auth.getUser();
  return !error && data.user ? client : null;
}
