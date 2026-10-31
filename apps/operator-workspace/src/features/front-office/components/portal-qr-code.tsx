import { useMemo } from "react";
import { qrDrawing } from "../qr-modules";

/**
 * The link as a QR code, for a student to scan from the desk's screen.
 *
 * Black on white whatever the theme: a scanner reads contrast, and a code
 * inverted for dark mode is one many phones refuse.
 */
export function PortalQrCode({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const drawing = useMemo(() => qrDrawing(value), [value]);
  return (
    <svg
      aria-label={label}
      className="size-44 shrink-0 rounded-lg border bg-white text-black"
      data-testid="portal-invitation-qr"
      role="img"
      shapeRendering="crispEdges"
      viewBox={`0 0 ${drawing.size} ${drawing.size}`}
    >
      <path d={drawing.path} fill="currentColor" />
    </svg>
  );
}
