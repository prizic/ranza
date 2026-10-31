import { act, cleanup, render, screen } from "@testing-library/react";
import {
  NextIntlClientProvider,
  createTranslator,
  useTranslations,
} from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  supportedLocales,
  type SupportedLocale,
} from "../../packages/i18n/src";
import { messages } from "../../apps/operator-workspace/src/messages";
import { dormitoryWords } from "../../apps/operator-workspace/src/words/dormitory";
import { catalogueFor } from "../../apps/operator-workspace/src/words/catalogue";
import { withOverlay } from "../../apps/operator-workspace/src/words/overlay";

let search = new URLSearchParams();
// The component resolves Next from the application's own node_modules.
vi.mock("../../apps/operator-workspace/node_modules/next/navigation", () => ({
  useSearchParams: () => search,
}));

const { PropertyWords } =
  await import("../../apps/operator-workspace/src/app/[locale]/(workspace)/property-words");

/**
 * A dormitory's words (ADR 0057). The overlay is typed against the catalogue,
 * so a key that does not exist is a compile error; what the types cannot say
 * is that every language changed the same strings, that each kept its
 * arguments, and that nothing is left calling a student a Resident.
 */

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ""): Map<string, string> {
  const found = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") found.set(path, value);
    else
      for (const [inner, text] of leaves(value, path)) found.set(inner, text);
  }
  return found;
}

const overlay = (locale: SupportedLocale) =>
  leaves(dormitoryWords[locale] as Tree);
const canonical = (locale: SupportedLocale) =>
  leaves(messages[locale] as unknown as Tree);

/** The ICU arguments a string names, `{count, plural ...}` and `{price}` alike. */
const argumentsOf = (text: string) =>
  [...text.matchAll(/\{\s*([A-Za-z_]\w*)\s*[,}]/g)]
    .map((match) => match[1])
    .filter(
      (name) => !["one", "two", "few", "many", "other", "zero"].includes(name!),
    )
    .sort();

/**
 * Where the hotel word may stay: the sign-in slogan, which no Property has
 * been chosen for, so no dormitory's words could apply.
 */
const SPOKEN_BEFORE_A_PROPERTY = new Set(["authSubSlogan"]);

describe("a dormitory's words", () => {
  it("are the same strings in every language, so none keeps the hotel word", () => {
    const keys = [...overlay("tr").keys()].sort();
    for (const locale of supportedLocales) {
      expect([...overlay(locale).keys()].sort()).toEqual(keys);
    }
  });

  it("replace strings that exist, keeping each one's arguments", () => {
    for (const locale of supportedLocales) {
      const base = canonical(locale);
      for (const [key, text] of overlay(locale)) {
        expect(base.has(key), `${locale} ${key}`).toBe(true);
        expect(argumentsOf(text), `${locale} ${key}`).toEqual(
          argumentsOf(base.get(key)!),
        );
      }
    }
  });

  it("format in every language, at the counts where plurals differ", () => {
    for (const locale of supportedLocales) {
      const t = createTranslator({
        locale,
        messages: catalogueFor(locale, "dormitory") as never,
        onError: (error) => {
          throw error;
        },
      });
      for (const count of [0, 1, 2, 3, 11, 100]) {
        expect(
          t("changeDepartureLongerResident" as never, { count } as never),
        ).toBeTruthy();
      }
    }
  });

  it("leave no Resident in a dormitory's Turkish or English", () => {
    const left = (locale: SupportedLocale, word: RegExp) =>
      [...leaves(catalogueFor(locale, "dormitory") as unknown as Tree)]
        .filter(
          ([key, text]) =>
            word.test(text) && !SPOKEN_BEFORE_A_PROPERTY.has(key),
        )
        .map(([key]) => key);
    expect(left("tr", /sakin/i)).toEqual([]);
    expect(left("en", /\bresidents?\b/i)).toEqual([]);
  });

  it("keep their identity: a hotel's catalogue is the canonical one, a dormitory's is built once", () => {
    for (const locale of supportedLocales) {
      expect(catalogueFor(locale, "hotel")).toBe(messages[locale]);
      expect(catalogueFor(locale, null)).toBe(messages[locale]);
      expect(catalogueFor(locale, "dormitory")).toBe(
        catalogueFor(locale, "dormitory"),
      );
      // What the overlay does not reach is the canonical object itself.
      expect(catalogueFor(locale, "dormitory").maintenance).toBe(
        messages[locale].maintenance,
      );
    }
  });

  it("call_housekeeping_cleaning_at_a_dormitory: the rail, the page bar and the links say Cleaning, and a hotel still says Housekeeping (HK-S4-22)", () => {
    const cleaning = { tr: "Temizlik", en: "Cleaning", ar: "التنظيف" } as const;
    // Turkish inflects it where it is linked ("Temizliğe bakın").
    const stem = { tr: "Temizli", en: "Cleaning", ar: "التنظيف" } as const;
    for (const locale of supportedLocales) {
      const yurt = catalogueFor(locale, "dormitory");
      const hotel = catalogueFor(locale, "hotel");
      expect(yurt.navigation.housekeeping).toBe(cleaning[locale]);
      expect(yurt.configuration.housekeepingTitle).toBe(cleaning[locale]);
      expect(yurt.roomsPage.housekeepingLink).toContain(stem[locale]);
      expect(yurt.openInHousekeeping).toContain(stem[locale]);
      expect(yurt.housekeeping.stayoverSettingsHint).toContain(
        cleaning[locale],
      );
      expect(hotel.navigation.housekeeping).not.toBe(cleaning[locale]);
      expect(hotel.navigation.housekeeping).toBe(
        messages[locale].navigation.housekeeping,
      );
    }
  });

  it("never change the canonical catalogue they are laid over", () => {
    const base = { a: { b: "hotel", c: "kept" }, d: "kept" };
    const merged = withOverlay(base, { a: { b: "dormitory" } });
    expect(merged).toEqual({ a: { b: "dormitory", c: "kept" }, d: "kept" });
    expect(base.a.b).toBe("hotel");
  });
});

describe("PropertyWords", () => {
  afterEach(cleanup);

  const HOTEL = "11111111-1111-4111-8111-111111111111";
  const YURT = "22222222-2222-4222-8222-222222222222";

  function Title() {
    const t = useTranslations("navigation");
    return <h1>{t("reservations")}</h1>;
  }

  const tree = (locale: SupportedLocale) => (
    <NextIntlClientProvider
      locale={locale}
      messages={messages[locale]}
      timeZone="Europe/Istanbul"
    >
      <PropertyWords dormitoryIds={[YURT]}>
        <Title />
      </PropertyWords>
    </NextIntlClientProvider>
  );

  it("follows the URL from a hotel to a dormitory and back without a reload", async () => {
    search = new URLSearchParams({ property: HOTEL });
    const { rerender } = render(tree("tr"));
    expect(screen.getByRole("heading")).toHaveTextContent("Rezervasyonlar");

    search = new URLSearchParams({ property: YURT });
    await act(async () => rerender(tree("tr")));
    expect(screen.getByRole("heading")).toHaveTextContent("Kayıtlar");

    search = new URLSearchParams({ property: HOTEL });
    await act(async () => rerender(tree("tr")));
    expect(screen.getByRole("heading")).toHaveTextContent("Rezervasyonlar");
  });

  it("says Registrations in English and التسجيلات in Arabic at a dormitory", () => {
    search = new URLSearchParams({ property: YURT });
    const { unmount } = render(tree("en"));
    expect(screen.getByRole("heading")).toHaveTextContent("Registrations");
    unmount();
    render(tree("ar"));
    expect(screen.getByRole("heading")).toHaveTextContent("التسجيلات");
  });

  it("reads the canonical words where the URL names no Property, or one it does not list", () => {
    search = new URLSearchParams();
    const { unmount } = render(tree("en"));
    expect(screen.getByRole("heading")).toHaveTextContent("Reservations");
    unmount();
    search = new URLSearchParams({ property: "not-a-property" });
    render(tree("en"));
    expect(screen.getByRole("heading")).toHaveTextContent("Reservations");
  });
});
