# Decision register translations

`pnpm decisions` renders `docs/decisions.html` — every feature's questions and
the answers settled on — from `docs/features/*/edge-cases.csv`. This folder
holds the Arabic for it. The English tables stay the record; nothing here can
change a decision.

## What the page reads

- every `docs/features/*/edge-cases.csv` on the branch it runs in, and the
  `%% OPEN:` / `%% DECIDED:` notes in the same folder's diagrams
- the ADR index
- decisions that exist only on **unmerged branches in this clone** — whole
  tables this branch lacks, and rows branches add to tables it has — shown in
  their own section with the branch each came from. They are read from git,
  not checked out, and are not translated until they merge. `pnpm decisions
--no-branches` leaves them out.

## Shape

`ar/<feature>.json`, one per feature folder:

```json
{
  "title": "تسجيل المغادرة",
  "entries": {
    "CO-S1-01": {
      "source_hash": "…",
      "situation": "…",
      "given": "…",
      "when": "…",
      "then": "…"
    },
    "note-1a2b3c4d": { "text": "…" }
  }
}
```

`ar/adrs.json` maps an ADR number to `{ "source_hash", "title" }`.

`source_hash` is copied, never written by hand: it fingerprints the English the
translation was made from. A note needs none — its key is already a hash of its
wording, so a reworded note is simply untranslated. When a row changes, the page stops showing its
Arabic and shows the English with a warning until someone translates it again.

## Translating

```sh
pnpm decisions --pending ar                  # everything missing or out of date
pnpm decisions --pending ar check-out        # one feature
pnpm decisions --pending ar adrs             # ADR titles
```

The output is the English in exactly the shape above. Translate the values,
keep every key and `source_hash`, merge into the feature's file, and run
`pnpm decisions` — it reports how many rows are current, out of date and
missing.

## Rules

- Modern Standard Arabic, plain and precise. A decision is a specification: do
  not soften, summarise or add to it.
- Leave untouched: row ids (`CO-S1-04`), anything in backticks, table, column,
  function, permission and role identifiers (`audit.read`, `ranza_app`,
  `in_house`), ADR numbers, file names and test names.
- Use the product's own words, from the Arabic catalogue in
  `apps/operator-workspace/src/messages.ts`:

| English                   | Arabic                        |
| ------------------------- | ----------------------------- |
| Organization              | المؤسسة                       |
| Property                  | المنشأة                       |
| Guest                     | الضيف                         |
| Resident                  | المقيم                        |
| Stay                      | الإقامة                       |
| Reservation               | الحجز                         |
| Folio                     | الحساب                        |
| Unit / Room / Bed         | الوحدة / الغرفة / السرير      |
| Staff Member              | الموظف                        |
| Role / permission         | الدور / الصلاحية              |
| check-in / check-out      | تسجيل الوصول / تسجيل المغادرة |
| audit log / record        | سجل التدقيق / السجل           |
| Front Desk                | المكتب الأمامي                |
| Housekeeping              | التدبير الفندقي               |
| inspection                | الفحص                         |
| Owner / Manager / Finance | المالك / المدير / المالية     |
| Subscription              | الاشتراك                      |
| business date             | تاريخ العمل                   |
| reverse / undo            | عكس / التراجع                 |
| row-level security policy | سياسة أمان على مستوى الصف     |
