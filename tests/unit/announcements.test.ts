// @vitest-environment node
import { expect, it } from "vitest";
import { selectAnnouncementContent } from "../../packages/domain/src/announcements";

const revision = {
  sourceLocale: "tr" as const,
  sourceContent: "Kaynak",
  translations: { en: "English" },
};
it("uses preferred translation, then Operator default, then source with explicit fallback", () => {
  expect(selectAnnouncementContent(revision, "en", "tr")).toEqual({
    locale: "en",
    content: "English",
    fallback: false,
  });
  expect(selectAnnouncementContent(revision, "ar", "en")).toEqual({
    locale: "en",
    content: "English",
    fallback: true,
  });
  expect(selectAnnouncementContent(revision, "ar", "ar")).toEqual({
    locale: "tr",
    content: "Kaynak",
    fallback: true,
  });
  expect(selectAnnouncementContent(revision, "tr", "en")).toEqual({
    locale: "tr",
    content: "Kaynak",
    fallback: false,
  });
});
