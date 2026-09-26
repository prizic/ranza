import { describe, expect, it } from "vitest";
import {
  groupOf,
  kindOf,
  orphanedTranslations,
  pendingTranslations,
  readNotes,
  renderRegister,
  rowHash,
  staleness,
  translationState,
} from "../../scripts/decisions-register.mjs";

const row = (id: string, status: string, then = "the answer") => ({
  id,
  situation: "a situation",
  given: "a given",
  when: "a when",
  then,
  enforced_by: "module",
  test_name: "a_test",
  status,
});

type Row = ReturnType<typeof row>;
type Entry = Record<string, string>;

const feature = (rows: Row[], entries: Record<string, Entry> = {}) => ({
  slug: "x",
  hasTable: true,
  rows,
  notes: [] as { tag: string; text: string; source: string }[],
  ar: { title: "", entries },
});

const arabicFor = (source: Row, then: string): Entry => ({
  source_hash: rowHash(source),
  situation: "حالة",
  given: "بفرض",
  when: "عندما",
  then,
});

const render = (features: ReturnType<typeof feature>[], adrs = []) =>
  renderRegister({ features, adrs, adrTranslations: {}, generatedAt: "now" });

describe("decision register", () => {
  it("renders what a table says as text, never as markup", () => {
    const html = render([
      feature([row("X-S1-01", "approved", '<script>alert("x")</script>')]),
    ]);
    expect(html).not.toContain('<script>alert("x")');
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)");
  });

  it("escapes an Arabic translation as it escapes the English", () => {
    const source = row("X-S1-01", "approved");
    const html = render([
      feature([source], { "X-S1-01": arabicFor(source, "<img src=x>") }),
    ]);
    expect(html).not.toContain("<img src=x>");
    expect(html).toContain("&lt;img src=x&gt;");
  });

  it("links an ADR a row names only when that ADR exists", () => {
    const html = renderRegister({
      features: [
        feature([row("X-S1-01", "approved", "per ADR 0031 and ADR 9999")]),
      ],
      adrs: [
        {
          file: "0031-a.md",
          number: "0031",
          title: "A",
          date: "",
          amended: false,
        },
      ],
      adrTranslations: {},
      generatedAt: "now",
    });
    expect(html).toContain('<a href="adr/0031-a.md">ADR 0031</a>');
    expect(html).not.toContain(">ADR 9999</a>");
  });

  it("shows Arabic only while it still translates the current English", () => {
    const source = row("X-S1-01", "approved", "the old answer");
    const translated = arabicFor(source, "الجواب القديم");
    expect(translationState(source, translated)).toBe("current");
    expect(render([feature([source], { "X-S1-01": translated })])).toContain(
      "الجواب القديم",
    );

    const changed = { ...source, then: "a new answer" };
    expect(translationState(changed, translated)).toBe("stale");
    const html = render([feature([changed], { "X-S1-01": translated })]);
    expect(html).not.toContain("الجواب القديم");
    expect(html).toContain("تغيّر هذا القرار بعد ترجمته");
    expect(translationState(changed, undefined)).toBe("missing");
  });

  it("owes a translation for every missing or out-of-date row, and nothing else", () => {
    const current = row("X-S1-01", "approved");
    const stale = row("X-S1-02", "approved", "changed");
    const missing = row("X-S1-03", "open");
    const pending = pendingTranslations(
      [
        feature([current, stale, missing], {
          "X-S1-01": arabicFor(current, "ج"),
          "X-S1-02": { ...arabicFor(stale, "ج"), source_hash: "before" },
        }),
      ],
      [],
      {},
    );
    expect(Object.keys(pending.x.entries)).toEqual(["X-S1-02", "X-S1-03"]);
    expect(pending.x.entries["X-S1-03"].then).toBe("the answer");
    expect(pending.x.title).toBe("X");
  });

  it("counts, searches and filters a diagram question like a row", () => {
    const decided = row("X-S1-01", "approved");
    const withNotes = {
      ...feature([decided]),
      notes: [
        { tag: "OPEN", text: "where it sits in the Rail", source: "u.mmd" },
        { tag: "OPEN", text: "which clock? X-S1-01", source: "u.mmd" },
      ],
    };
    const html = render([withNotes]);
    expect(html).toMatch(
      /class="note open" data-kind="pending" data-search="where it sits in the rail u\.mmd /,
    );
    expect(html).toMatch(/class="note open stale" data-kind="decided"/);
    expect(html).toMatch(/data-filter="pending"[^>]*>.*?<span>1<\/span>/);
    expect(html).toMatch(/data-filter="decided"[^>]*>.*?<span>2<\/span>/);
  });

  it("reads a multi-line OPEN note and drops the DEFERRED list after it", () => {
    const notes = readNotes(
      [
        "  %% OPEN: a Manager rejects a flagged Folio - what then? s2, CO-S2-08",
        "  %% DEFERRED, each owned by another feature:",
        "  %%   when room nights are charged   CO-S1-30",
        "  A --> B",
      ].join("\n"),
      "use-case.mmd",
    );
    expect(notes).toEqual([
      {
        tag: "OPEN",
        text: "a Manager rejects a flagged Folio - what then? s2, CO-S2-08",
        source: "use-case.mmd",
      },
    ]);
  });

  it("calls an OPEN note out of date only when every row it names is decided", () => {
    const note = {
      tag: "OPEN",
      text: "which clock? SP-S1-22, IG-01",
      source: "s",
    };
    const rows = new Map([
      ["SP-S1-22", row("SP-S1-22", "approved")],
      ["IG-01", row("IG-01", "resolved")],
    ]);
    expect(staleness(note, rows)).toEqual([
      { id: "SP-S1-22", status: "approved" },
      { id: "IG-01", status: "resolved" },
    ]);
    rows.set("IG-01", row("IG-01", "deferred"));
    expect(staleness(note, rows)).toBeNull();
    rows.set("IG-01", row("IG-01", "open"));
    expect(staleness(note, rows)).toBeNull();
  });

  it("reports Arabic whose row or note no longer exists", () => {
    const current = row("X-S1-01", "approved");
    const orphaned = orphanedTranslations(
      [
        feature([current], {
          "X-S1-01": arabicFor(current, "ج"),
          "X-S1-09": arabicFor(current, "ج"),
          "note-deadbeef": { text: "ملاحظة" },
        }),
      ],
      [
        {
          file: "0001-a.md",
          number: "0001",
          title: "A",
          date: "",
          amended: false,
        },
      ],
      {
        "0001": { source_hash: "h", title: "أ" },
        "0099": { source_hash: "h", title: "ب" },
      },
    );
    expect(orphaned).toEqual({
      x: ["X-S1-09", "note-deadbeef"],
      adrs: ["0099"],
    });
  });

  it("refuses a status it has no kind for, rather than miscounting it", () => {
    expect(kindOf("proposed")).toBe("pending");
    expect(() => kindOf("done")).toThrow();
  });

  it("groups rows by the slice their id names", () => {
    expect(groupOf("CO-S1-04")).toBe("S1");
    expect(groupOf("AL-DIFF-01")).toBe("DIFF");
    expect(groupOf("PRE-06")).toBe("PRE");
    expect(groupOf("IG-01")).toBe("");
  });
});
