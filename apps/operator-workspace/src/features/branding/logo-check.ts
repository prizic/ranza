/**
 * What can be said about a logo the moment it is chosen, before any save.
 *
 * The limits are the branding module's, handed in by the page that reads them
 * from it, so the screen quotes the numbers the server will enforce and cannot
 * drift from them. This is a courtesy to the person choosing; the module still
 * judges the bytes on save, and a file this check passes can be refused there
 * (a header the browser reads and the module does not accept).
 */

export interface LogoLimits {
  maxBytes: number;
  minHeight: number;
  maxDimension: number;
}

export type LogoProblem =
  | "empty"
  | "too_large"
  | "svg"
  | "unsupported_type"
  | "corrupt"
  | "too_small"
  | "dimensions_too_large";

export interface ImageSize {
  width: number;
  height: number;
}

const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/** What the file itself says, which needs no decoding: the rules the module checks before it reads an image. */
export function fileProblem(
  file: { type: string; size: number },
  limits: LogoLimits,
): LogoProblem | null {
  if (file.size === 0) return "empty";
  if (file.size > limits.maxBytes) return "too_large";
  if (file.type === "image/svg+xml") return "svg";
  if (!ACCEPTED_TYPES.has(file.type)) return "unsupported_type";
  return null;
}

/** What the decoded image says: null `size` is an image the browser could not read. */
export function imageProblem(
  size: ImageSize | null,
  limits: LogoLimits,
): LogoProblem | null {
  if (size === null) return "corrupt";
  if (size.height < limits.minHeight) return "too_small";
  if (size.width > limits.maxDimension || size.height > limits.maxDimension) {
    return "dimensions_too_large";
  }
  return null;
}

/**
 * The pixel size of an image file, or null when the browser cannot decode it.
 * Any other failure is not the file's and is left to the caller.
 */
export async function readImageSize(file: Blob): Promise<ImageSize | null> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "EncodingError") {
      return null;
    }
    throw error;
  } finally {
    URL.revokeObjectURL(url);
  }
}
