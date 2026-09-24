/**
 * Every page and layout under `[locale]` sets the request's locale itself.
 *
 * next-intl's server functions — `getTranslations()` with no argument, and
 * everything rendered beneath it — read the locale `setRequestLocale` recorded
 * for the request. A client navigation renders the new page and not the
 * layouts above it, so a locale set only in the root layout is set for a full
 * load and for nothing else, and `src/i18n/request.ts` then falls back to
 * Turkish. On /en and /ar that reads as a half-translated page, not an error:
 * the client-rendered parts around it still speak the right language.
 *
 * Layouts are held to it as well as pages. Next may render a layout and the
 * page beneath it independently, and next-intl's own guidance is to set the
 * locale in both.
 *
 * And it has to come first: a next-intl server read reads the locale when it
 * is called, so setting it afterwards is the same as not setting it at all.
 * Comments are removed before the scan, so a comment naming the call does not
 * stand in for it.
 *
 * A text scan, so a file that sets it in a shape this does not read fails here
 * rather than passing unseen; that is the right way round to be wrong.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const APPLICATIONS = ["operator-workspace", "guest-portal"];

const SETS_LOCALE = /\bsetRequestLocale\(locale\)/;

// Any next-intl server read that is not handed `{ locale }` depends on the
// request's locale.
const READS_REQUEST_LOCALE =
  /\bget(?:Translations|Formatter|Locale|Messages|Now|TimeZone)\((?!\s*\{\s*locale\b)/;

const COMMENTS = /\/\*[\s\S]*?\*\/|\/\/.*$/gm;

// Next resolves these apart from the page's body, so the page's
// `setRequestLocale` does not cover them: each has to hand its reads the
// locale it was given, or /en gets a Turkish <title> on a client navigation.
const GENERATE =
  /export\s+(?:async\s+)?function\s+generate(?:Metadata|Viewport)\b|export\s+const\s+generate(?:Metadata|Viewport)\b/g;

// From each `generate*` export to the next top-level export, or the end.
function generateBodies(source: string): string[] {
  return [...source.matchAll(GENERATE)].map((match) => {
    const start = match.index ?? 0;
    const next = source.indexOf("\nexport ", start + match[0].length);
    return source.slice(start, next === -1 ? undefined : next);
  });
}

const files = APPLICATIONS.flatMap((application) => {
  const root = path.resolve(
    __dirname,
    `../../apps/${application}/src/app/[locale]`,
  );
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((file) => ["page.tsx", "layout.tsx"].includes(path.basename(file)))
    .map((file) => path.join(root, file));
});

describe("pages and layouts under [locale]", () => {
  it("are found at all", () => {
    // A scan that matched nothing would pass the next test for free.
    expect(files.length).toBeGreaterThanOrEqual(22);
  });

  it("each set the request's locale before reading a string", () => {
    const setsFirst = (text: string) => {
      const source = text.replace(COMMENTS, "");
      const set = source.search(SETS_LOCALE);
      const read = source.search(READS_REQUEST_LOCALE);
      return set !== -1 && (read === -1 || set < read);
    };
    const unset = files
      .filter((file) => !setsFirst(readFileSync(file, "utf8")))
      .map((file) =>
        path.relative(path.resolve(__dirname, "../../apps"), file),
      );
    expect(unset).toEqual([]);
  });

  it("hand generateMetadata's and generateViewport's reads their locale", () => {
    const unguarded = files
      .filter((file) =>
        generateBodies(readFileSync(file, "utf8").replace(COMMENTS, "")).some(
          (body) => READS_REQUEST_LOCALE.test(body),
        ),
      )
      .map((file) =>
        path.relative(path.resolve(__dirname, "../../apps"), file),
      );
    expect(unguarded).toEqual([]);
  });
});
