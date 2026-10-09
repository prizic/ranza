/**
 * What an export records as the name of whoever asked: the name they signed up
 * with, or — when they gave none, or gave an address — the address with its
 * domain dropped. The local part is the memorable half and the domain is the
 * part that identifies a person outside this product.
 *
 * The database cuts any address it is handed in the same way when the row is
 * inserted, so this is the courtesy and that is the guarantee. The two agree
 * on `local@***` because the check constraint states it.
 */
export function requesterLabel(
  signedUpAs: string | null,
  email: string,
): string {
  const name = clean(signedUpAs ?? "");
  if (name !== "" && !name.includes("@")) return name.slice(0, 200);
  const source = name.includes("@") ? name : clean(email);
  const local = clean(source.split("@")[0] ?? "").slice(0, 150);
  return `${local === "" ? "unknown" : local}@***`;
}

function clean(text: string): string {
  // Control characters are stripped, as the database strips them.
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u001f\u007f]/g, "").trim();
}
