import type { Foreground } from "./color";
import type { LogoContentType } from "./image";

/** What is known of a logo without its bytes. */
export interface BrandLogo {
  contentType: LogoContentType;
  sizeBytes: number;
  width: number;
  height: number;
  /** Hex SHA-256 of the bytes: versions the URL the logo is served at. */
  hash: string;
}

/**
 * An Organization's brand as the Portal draws it. A colour and a logo are
 * each optional; neither set is the default theme, which is also what an
 * Organization that never opened the screen has.
 */
export interface OrganizationBrand {
  /** Lower-case `#rrggbb`, or null for the default. */
  primaryColor: string | null;
  /** White or black, derived from the colour; null with it. */
  primaryForeground: Foreground | null;
  /**
   * What text and links on the white canvas are drawn in: the colour itself
   * where it reads there, otherwise a darker shade of its hue that does.
   */
  primaryText: string | null;
  logo: BrandLogo | null;
}

/**
 * The brand a Resident sees on one of their own Stays. Named by the Stay and
 * not by the Organization, which a Resident must not learn the shape of (ADR
 * 0009).
 */
export type StayBrand = OrganizationBrand & { stayId: string };

/** The Branding screen's read. */
export interface BrandSettings {
  /** Whether the viewer may change it; the database decides, the screen asks. */
  canManage: boolean;
  /**
   * Why not, for the screen to say the right thing: `unavailable` is a
   * Subscription, an Entitlement or a capability that is not there (blueprint
   * 3.5), and `reach` is holding the permission without reaching the whole
   * Organization. Null where they may.
   */
  reason: "unavailable" | "reach" | null;
  brand: OrganizationBrand;
}

export interface SaveBrandInput {
  organizationId: string;
  /** Absent leaves the colour as it is; null returns it to the default. */
  primaryColor?: string | null;
  /** Absent leaves the logo as it is; null removes it. */
  logo?: Uint8Array | null;
}

export interface StoredLogo {
  contentType: LogoContentType;
  hash: string;
  bytes: Uint8Array;
}
