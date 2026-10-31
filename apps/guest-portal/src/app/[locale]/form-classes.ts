/*
 * EduBoard's login fields, in Ranza's colours: a visible label over a tall,
 * softly rounded field, and a full-width emerald call to action. 16px text on
 * a phone, so iOS does not zoom into the field. Shared by every page that asks
 * for a credential, so a guest who meets two of them is on the same product.
 */
export const LABEL = "text-sm font-semibold text-foreground";
export const FIELD =
  "h-13 rounded-md bg-card px-4 text-base shadow-none md:text-[15px]";
export const SUBMIT = "h-13 w-full rounded-md text-[15px] font-medium";
export const ERROR =
  "rounded-lg border border-danger/15 bg-danger-soft p-3 text-sm font-medium text-danger";
