export interface FeatureDefinition {
  version: number;
  scopes: readonly ("operator" | "branch")[];
  modes: readonly string[];
  defaultMode: string;
  valueRanges: Readonly<Record<string, { min: number; max: number }>>;
  defaultValues: Readonly<Record<string, number>>;
}

const standard: FeatureDefinition = {
  version: 1,
  scopes: ["operator", "branch"],
  modes: ["standard"],
  defaultMode: "standard",
  valueRanges: {},
  defaultValues: {},
};

/** Shipped catalog version; the database owns authorization at request time. */
export const featureCatalog = {
  attendance: {
    ...standard,
    valueRanges: { cutoffMinute: { min: 0, max: 1439 } },
    defaultValues: { cutoffMinute: 1320 },
  },
  meals: {
    ...standard,
    valueRanges: { cutoffMinute: { min: 0, max: 1439 } },
    defaultValues: { cutoffMinute: 1200 },
  },
  announcements: standard,
  balance: { ...standard, scopes: ["operator"] },
  wifi: {
    ...standard,
    modes: ["protected", "public_qr"],
    defaultMode: "protected",
  },
} satisfies Record<string, FeatureDefinition>;

export interface Entitlement {
  status: "granted" | "revoked";
  startsAt: string;
  endsAt: string | null;
  allowedModes: readonly string[];
  constraints: Readonly<Record<string, { min: number; max: number }>>;
}

export interface FeatureConfiguration {
  mode: string;
  values: Readonly<Record<string, unknown>>;
}

export function validateFeatureConfiguration(
  feature: FeatureDefinition,
  entitlement: Entitlement,
  scope: "operator" | "branch",
  configuration: FeatureConfiguration,
): FeatureConfiguration {
  if (!feature.scopes.includes(scope))
    throw new RangeError("Unsupported scope");
  if (
    !feature.modes.includes(configuration.mode) ||
    !entitlement.allowedModes.includes(configuration.mode)
  ) {
    throw new RangeError("Unsupported or unentitled mode");
  }
  const values = { ...feature.defaultValues, ...configuration.values };
  for (const [key, value] of Object.entries(values)) {
    const range = feature.valueRanges[key];
    const restriction = entitlement.constraints[key];
    if (
      !range ||
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < Math.max(range.min, restriction?.min ?? range.min) ||
      value > Math.min(range.max, restriction?.max ?? range.max)
    ) {
      throw new RangeError(`Unsupported configuration value: ${key}`);
    }
  }
  return { mode: configuration.mode, values };
}

export function resolveCapability(
  feature: FeatureDefinition,
  entitlement: Entitlement | null,
  now: Date,
  operatorConfiguration?: FeatureConfiguration,
  branchConfiguration?: FeatureConfiguration,
) {
  const locked = (reason: string) => ({
    available: false,
    reason,
    mode: null,
    values: {},
    catalogVersion: feature.version,
  });
  if (!entitlement) return locked("not_entitled");
  if (entitlement.status === "revoked") return locked("revoked");
  const start = Date.parse(entitlement.startsAt);
  const end =
    entitlement.endsAt === null ? Infinity : Date.parse(entitlement.endsAt);
  if (
    !Number.isFinite(start) ||
    Number.isNaN(end) ||
    !Number.isFinite(now.getTime())
  )
    return locked("invalid_entitlement");
  if (now.getTime() < start) return locked("scheduled");
  if (now.getTime() >= end) return locked("expired");
  try {
    const selected = branchConfiguration ??
      operatorConfiguration ?? {
        mode: feature.defaultMode,
        values: feature.defaultValues,
      };
    const configuration = validateFeatureConfiguration(
      feature,
      entitlement,
      branchConfiguration ? "branch" : "operator",
      selected,
    );
    return {
      available: true,
      reason: null,
      ...configuration,
      catalogVersion: feature.version,
    };
  } catch {
    return locked("configuration_unavailable");
  }
}
