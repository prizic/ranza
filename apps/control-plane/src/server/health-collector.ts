import { createHash, timingSafeEqual } from "node:crypto";

type SignalStatus = "ok" | "failed" | "unknown";
interface CollectorPorts {
  fetch: typeof fetch;
  record: (component: string, status: SignalStatus) => Promise<void>;
}
export function verifyCollectorRequest(headers: Headers, secret: string) {
  const authorization = headers.get("authorization");
  if (secret.length < 32 || !authorization?.startsWith("Bearer ")) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(secret), digest(authorization.slice(7)));
}

// Only deployment configuration controls destinations; request input never does.
function probeUrl(origin: string | undefined, path: string) {
  if (!origin) return null;
  try {
    const url = new URL(origin);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      return null;
    if (
      url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      )
    )
      return null;
    return new URL(path, url);
  } catch {
    return null;
  }
}

export async function collectHealth(
  env: Record<string, string | undefined>,
  ports: CollectorPorts,
) {
  const targets = [
    {
      component: "storefront",
      application: "storefront",
      url: probeUrl(env.STOREFRONT_ORIGIN, "/health"),
    },
    {
      component: "product_web",
      application: "product-web",
      url: probeUrl(env.PRODUCT_WEB_ORIGIN, "/health"),
    },
    {
      component: "control_plane",
      application: "control-plane",
      url: probeUrl(env.CONTROL_PLANE_ORIGIN, "/health"),
    },
    {
      component: "auth_gateway",
      application: null,
      url: env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        ? probeUrl(env.NEXT_PUBLIC_SUPABASE_URL, "/auth/v1/health")
        : null,
    },
  ];
  const observations = await Promise.all(
    targets.map(async (target) => {
      let status: SignalStatus = "unknown";
      if (target.url) {
        try {
          const response = await ports.fetch(target.url, {
            cache: "no-store",
            redirect: "error",
            signal: AbortSignal.timeout(5000),
            headers:
              target.component === "auth_gateway"
                ? { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" }
                : {},
          });
          status = response.ok ? "ok" : "failed";
          if (response.ok && target.application) {
            const body = await response.json();
            if (
              body?.application !== target.application ||
              body?.status !== "ok"
            )
              status = "failed";
          } else {
            await response.body?.cancel();
          }
        } catch {
          status = "failed";
        }
      }
      return { component: target.component, status };
    }),
  );
  let persisted = true;
  await Promise.all(
    [...observations, { component: "database", status: "ok" as const }].map(
      async (signal) => {
        try {
          await ports.record(signal.component, signal.status);
        } catch {
          persisted = false;
        }
      },
    ),
  );
  // Collector liveness is not evidence that business schedulers or exports ran.
  return {
    persisted,
    degraded: !persisted || observations.some((item) => item.status !== "ok"),
  };
}
