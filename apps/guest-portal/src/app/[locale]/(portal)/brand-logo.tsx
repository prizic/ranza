/**
 * An Organization's logo in the Portal's bar (ADR 0046).
 *
 * The URL names the Stay it was reached through and the logo's hash. The Stay,
 * because a Resident is not told which Organization they are with (ADR 0009);
 * the hash, because it is what makes a changed logo a new URL and so show on
 * the next load, while an unchanged one is cached for good.
 */
export function BrandLogo({
  alt,
  height,
  stayId,
  version,
  width,
}: {
  alt: string;
  height: number;
  stayId: string;
  version: string;
  width: number;
}) {
  // A plain element: the bytes are served by this application's own route with
  // their own caching, and next/image would copy them through a second.
  return (
    <img
      alt={alt}
      className="h-8 w-auto max-w-40 shrink-0 object-contain"
      height={height}
      src={`/api/brand/${stayId}/logo?v=${version}`}
      width={width}
    />
  );
}
