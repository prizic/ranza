import { describe, expect, it } from "vitest";
import { supportedLocales } from "../../packages/i18n/src";
import { messages } from "../../apps/operator-workspace/src/messages";

/**
 * Maintenance reads in Turkish, English and Arabic (MT-S1-27).
 *
 * The typed catalogue already refuses a key one locale lacks. This catches what
 * a type cannot: an empty value, and a Turkish or Arabic value that is the
 * English left in place — a screen translated in two of its three languages.
 */

type Tree = { [key: string]: string | Tree };

/** Every leaf, by its dotted path. */
function leaves(tree: Tree, prefix = ""): Map<string, string> {
  const found = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (typeof value === "string") found.set(path, value);
    else for (const [p, v] of leaves(value, path)) found.set(p, v);
  }
  return found;
}

/** What maintenance puts in front of a person: its screens, and its audit words. */
function maintenanceWords(locale: (typeof supportedLocales)[number]) {
  const catalogue = messages[locale] as unknown as {
    maintenance: Tree;
    navigation: { maintenance: string };
    auditAction: Tree;
  };
  const words = leaves(catalogue.maintenance, "maintenance");
  words.set("navigation.maintenance", catalogue.navigation.maintenance);
  for (const [path, value] of leaves(catalogue.auditAction, "auditAction")) {
    if (/maintenance|taken_out_of_order|returned_to_service/.test(path))
      words.set(path, value);
  }
  return words;
}

/** A code and a business name: the same in every language, on purpose. */
const NOT_TRANSLATED = new Set([
  "maintenance.reference",
  "maintenance.vendorPlaceholder",
]);

const ARABIC = /[؀-ۿ]/;
const HAS_LETTERS = /\p{L}/u;
const withoutPlaceholders = (text: string) => text.replace(/\{[^}]*\}/g, "");

describe("maintenance in every locale", () => {
  const english = maintenanceWords("en");

  it("has the same words in each locale, and none of them empty", () => {
    expect(english.size).toBeGreaterThan(150);
    for (const locale of supportedLocales) {
      const words = maintenanceWords(locale);
      expect([...words.keys()].sort(), locale).toEqual(
        [...english.keys()].sort(),
      );
      for (const [path, value] of words)
        expect(value.trim(), `${locale} ${path}`).not.toBe("");
    }
  });

  it("writes Arabic in Arabic, not in the English it was copied from", () => {
    const untranslated = [...maintenanceWords("ar")]
      .filter(
        ([path, value]) =>
          !NOT_TRANSLATED.has(path) &&
          HAS_LETTERS.test(withoutPlaceholders(english.get(path) ?? "")) &&
          !ARABIC.test(value),
      )
      .map(([path]) => path);
    expect(untranslated).toEqual([]);
  });

  it("writes Turkish that is not the English, except for a word both languages share", () => {
    const turkish = maintenanceWords("tr");
    const copied = [...turkish]
      .filter(
        ([path, value]) =>
          !NOT_TRANSLATED.has(path) &&
          value === english.get(path) &&
          withoutPlaceholders(value).trim().split(/\s+/).length > 1,
      )
      .map(([path]) => path);
    expect(copied).toEqual([]);
  });
});
