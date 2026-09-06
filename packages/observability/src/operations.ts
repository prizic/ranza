const components = [
  "storefront",
  "product_web",
  "control_plane",
  "database",
  "scheduler",
  "auth_gateway",
  "exports",
] as const;
export interface OperationalSignal {
  component: string;
  status: string;
  observed_at: string;
}
export function summarizeOperationalSignals(
  signals: OperationalSignal[],
  now = Date.now(),
) {
  return components.map((component) => {
    const signal = signals.find((item) => item.component === component);
    const observed = signal ? Date.parse(signal.observed_at) : NaN;
    const status =
      !Number.isFinite(observed) || observed > now + 60_000
        ? "unknown"
        : now - observed > 600_000
          ? "stale"
          : signal?.status === "ok" || signal?.status === "failed"
            ? signal.status
            : "unknown";
    return {
      component,
      status,
      observedAt: Number.isFinite(observed)
        ? new Date(observed).toISOString()
        : null,
    };
  });
}
