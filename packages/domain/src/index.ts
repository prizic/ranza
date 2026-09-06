export const applicationNames = [
  "storefront",
  "product-web",
  "control-plane",
] as const;

export type ApplicationName = (typeof applicationNames)[number];
