# Decision sheet — folios lane: sabotage record

Every boundary test this lane added or relies on was run with the thing it
guards broken, the altered object printed first, and seen red. Run on the lane
database (port 54493) on 2026-09-29, on branch `decisions/folios` from
`3805ff9`. Each sabotage was undone afterwards and the suite rerun green; the
database was then rebuilt from the migrations for the gates.

Database sabotages to pgTAP suites were inserted after the suite's own `begin;`,
so they rolled back with it. Sabotages to functions and policies exercised by
the integration suite were applied to the lane database and restored from the
**latest** migration that defines the object. One restore first used an older
definition of `folio_line_is_postable` (001200 rather than 001700); MT-S5-10
and CO-S1-15 went red, which is how that was noticed. It was restored from
001700 and the FO-S4-09 sabotage was redone against that body.

## pgTAP — `tests/database/reversing_a_charge.test.sql`

| Row                     | Sabotage                                                                                                                                    | Altered object, as printed                                                                                                                                                       | Red                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| FO-S4-10                | policy asks `post_charge` for every line again                                                                                              | `with_check`: `(app.can_use_capability(property_id, 'billing_folios'::text, 'finance'::text) AND app.has_organization_permission(organization_id, 'finance.post_charge'::text))` | 4 "and may not reverse it", 6 "but reverses one" (15, 16 cascade)                       |
| FO-S7-01                | permission clause dropped from the policy                                                                                                   | `with_check`: `app.can_use_capability(property_id, 'billing_folios'::text, 'finance'::text)`                                                                                     | 8 "the shipped Front desk role lacks finance.post_charge" (4, 5, 6 too)                 |
| FO-S2-04                | `folio_lines_description_check` dropped                                                                                                     | check constraints: `folio_lines_amount_check,folio_lines_type_check,folio_lines_room_night_is_dated,folio_lines_source_check`                                                    | 11 "over 200 characters", 12 "blank once trimmed"                                       |
| FO-S4-05                | `folio_lines_type_check` dropped                                                                                                            | check constraints: `folio_lines_description_check,folio_lines_amount_check,folio_lines_room_night_is_dated,folio_lines_source_check`                                             | 14 "a reversal of a reversal", 15 "a charge that names one"                             |
| FO-S4-10 (custom roles) | migration's update narrowed to `organization_id is null and 'finance.post_charge' = any (permissions)` (diff of the migration copy printed) | the migration's own guard raised `P0001: a role holds finance.post_charge without finance.reverse_charge`                                                                        | 17 "the migration runs…", 18 "a role an Organization wrote that posted keeps reversing" |

## pgTAP — existing assertions the reworded rows now name

| Row      | Suite                  | Sabotage                                             | Altered object                                                                                                                            | Red                                                                                                                                                              |
| -------- | ---------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FO-S1-05 | configuration.test.sql | `drop trigger folios_open_in_the_propertys_currency` | triggers on folios: `folios_front_desk_closes_only_a_settled_folio`                                                                       | 22 "CF-S1-20: a Folio opens only in its Property's currency"                                                                                                     |
| FO-S1-06 | configuration.test.sql | `drop trigger properties_currency_is_fixed`          | triggers on properties: `properties_keep_today_after_the_last_close,properties_stamped`                                                   | 19 "CF-S1-04: the currency is fixed by the first Folio", 41 "CF-S1-04: the currency lock binds a role that bypasses every policy" (and 4, the trigger inventory) |
| FO-S1-06 | rates.test.sql         | lock function counts Folios only                     | `prosrc`: `begin if exists (select 1 from public.folios as folio where folio.property_id = new.id) then raise … end if; return new; end;` | 33 "RT-S2-07: a priced booking fixes the currency, for every role"                                                                                               |

## Integration — `tests/integration/folios.test.ts`

| Row      | Sabotage                                                                     | Altered object                                                                               | Red                                                                                                                                                                  |
| -------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FO-S9-02 | `order by folio.status, unit.name` restored                                  | module.ts line printed by grep                                                               | "lists open Folios before closed ones…"                                                                                                                              |
| FO-S3-02 | `folioDetail` restored from 3805ff9 (two statements in one transaction)      | function replaced from `git show 3805ff9`                                                    | "never prints a total that disagrees…", **red three runs out of three**, e.g. `balance 1700 over 17 lines, rows sum 1800 over 18`. The race is real, not structural. |
| FO-S2-04 | module bound loosened to `DESCRIPTION_MAX + 1`                               | `write.ts:147` printed                                                                       | "refuses a description over 200…": `expected FolioWriteError … to be an instance of FolioAmountError`                                                                |
| FO-S4-09 | `folios.status = 'open'` removed from `folio_line_is_postable` (001700 body) | `position('status = ''open''' in prosrc)` = 0                                                | "refuses to reverse a charge on a closed Folio": `promise resolved … instead of rejecting`                                                                           |
| FO-S5-06 | `and status = 'open'` removed from `closeFolio`'s update                     | update statement printed                                                                     | "closes once…": `to have a length of 1 but got 2`                                                                                                                    |
| FO-S7-01 | permission clause dropped from `folio_lines_insert_finance`                  | `with_check`: `app.can_use_capability(property_id, 'billing_folios'::text, 'finance'::text)` | "refuses a charge from the shipped Front desk role…"                                                                                                                 |
| FO-S7-09 | assignment clause removed from `app.accessible_property_ids()`               | `prosrc` printed without the `access_scope … or exists (property_assignments…)` clause       | "shows an assigned Finance reader nothing…": `expected [ { …(10) } ] to deeply equal []`                                                                             |
| FO-S8-03 | `folioId` removed from the `reservation.checked_in` context                  | `git diff --stat` of reservations/module.ts: 1 deletion                                      | "records the Folio on the check-in…"                                                                                                                                 |

**FO-S4-05, module half.** `folios.test.ts: refuses to reverse a reversal`
passes for either of two reasons: `reverseLine` selects only `line_type =
'charge'`, and `folio_lines_type_check` refuses the positive line a reversal of
a reversal would be. Removing the module filter leaves it green because the
constraint refuses; dropping the constraint leaves it green because the filter
finds no row. The two never diverge short of removing both, so the database
assertions above (14, 15) are what isolate the constraint, and the module
filter is recorded as subsumed by it.

## Unit

| Row                 | Test                    | Sabotage                                                 | Red                                                                               |
| ------------------- | ----------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| FO-S9-06            | format-money.test.ts    | `const minorUnits = 100 \|\| …` in `formatMoney`         | JPY and KWD in tr, en, ar (6); TRY stays green, correctly                         |
| FO-S9-03            | folio-panel.test.tsx    | `!line.reversed` removed                                 | "offers reverse only on a charge nothing has cancelled"                           |
| FO-S9-03 / FO-S4-10 | folio-panel.test.tsx    | `mayReverse &&` removed                                  | "offers no reverse to somebody without finance.reverse_charge"                    |
| FO-S9-03            | folio-panel.test.tsx    | `open &&` removed from the reverse condition             | "offers nothing on a closed Folio…"                                               |
| FO-S9-06            | folio-panel.test.tsx    | amount cell `text-end` → `text-right`                    | "mirrors through logical utilities only"                                          |
| FO-S9-06            | folio-panel.test.tsx    | `hourCycle: "h23"` → `"h12"`                             | "shows posting times on the 24-hour clock"                                        |
| FO-S2-05            | finance-actions.test.ts | the ASCII-only `toMinorUnits` copy restored from 3805ff9 | the three Arabic-digit cases                                                      |
| FO-S9-04            | finance-actions.test.ts | `console.error` in `failed()` replaced by `void subject` | "anything else reads the same and is recorded" ×3                                 |
| FO-S9-04 / FO-S4-09 | folio-refusals.test.ts  | `reverseLine`'s catch made bare again (`void error`)     | "reverseLine: a lost connection travels on as itself", "…a code it does not mean" |
| FO-S9-04            | folio-refusals.test.ts  | `postChargeWithin` wraps every error again               | "postCharge: a lost connection…", "…a code it does not mean"                      |
| FO-S9-04            | folio-refusals.test.ts  | `closeFolio` translates nothing (`throw error`)          | "closeFolio: 55000 is a refusal…"                                                 |
