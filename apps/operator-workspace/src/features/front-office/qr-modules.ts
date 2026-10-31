import qrcode from "qrcode-generator";

/** Modules of white around the symbol; the standard asks for four. */
const QUIET_ZONE = 4;

export interface QrDrawing {
  /** Side of the square, quiet zone included, in modules. */
  size: number;
  /** One path for every dark module, in module units. */
  path: string;
}

/**
 * A QR code as an SVG path, drawn here so that a link which opens a student's
 * stay and balance never goes to a third party's image service to be encoded.
 *
 * Error correction is `M`: a scan off a desk monitor or a phone held up to
 * another phone loses a little to glare, and `L` loses too much. The version
 * is the smallest that fits, so a longer link makes a denser code and not a
 * failure.
 */
export function qrDrawing(value: string): QrDrawing {
  const code = qrcode(0, "M");
  code.addData(value);
  code.make();
  const count = code.getModuleCount();
  let path = "";
  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      if (code.isDark(row, column)) {
        path += `M${column + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`;
      }
    }
  }
  return { size: count + QUIET_ZONE * 2, path };
}
