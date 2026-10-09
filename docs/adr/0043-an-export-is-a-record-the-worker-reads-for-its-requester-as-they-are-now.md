# 0043. An export is a record the worker reads for its requester as they are now

Date: 2026-10-09

Status: Proposed

Builds on [ADR 0012](0012-a-write-is-bounded-by-a-policy-not-a-check.md),
[ADR 0018](0018-the-worker-has-its-own-role-and-its-own-context.md),
[ADR 0026](0026-a-role-is-a-named-set-of-permissions-and-reach-is-taken-away-for-free.md),
[ADR 0027](0027-the-worker-ends-a-session-through-one-function-and-no-grant.md) and
[ADR 0031](0031-an-audit-record-carries-its-location-and-is-read-by-permission.md).

## Context

Blueprint 7.5 and 13.10 want Organization data to be exportable on request and
on a schedule, and an export to be a record with a requester and a state, not a
file somebody made once. `20260916010100` built the record. It could not
produce a file:

- its queries named columns and a table that do not exist (`first_name`,
  `unit_number`, `fl.amount`, `audit.events`), and `ranza_worker` held no
  privilege on what they would have read;
- a failure was written outside the worker's context, where row-level security
  dropped it, behind a `.catch(() => {})`, so a failed export stayed
  `processing` for ever and the oldest fifty pending exports stopped the queue;
- the runtime role could insert `status` and `file_content`, so a requester
  could forge a ready export, and update `status` afterwards;
- the list of exports selected every file body, fifty of them, to the browser;
- the download route let any reader of the Organization's exports have any file;
- nothing enforced the expiry the row carried.

The shortcut the first version took is the one ADR 0018 refuses: give the
worker enough of a grant to run the requester's queries. A worker that can read
guests, folios and the audit log across an Organization is a standing privilege
on the most sensitive data the product holds, held by a process nobody watches.

## Decision

### 1. An export is read by functions, for the requester, as they are now

`ranza_worker` holds no privilege on `data_exports`, `export_schedules` or any
table an export reads. It reaches an export through fourteen single-purpose
`SECURITY DEFINER` functions with `set search_path = ''`, executable by it
alone (ADR 0027): four lists across Organizations (`pending_data_exports`,
`export_schedules_due`, `stalled_data_exports`, `expired_data_exports`), the
claim, five readers (one per dataset), and `complete_data_export`,
`fail_data_export`, `expire_data_export` and `run_export_schedule`. Each one
that acts checks that the worker's Organization is the export's before it
reads or writes anything.

A reader answers for the export's **requester**, not for the worker, and as the
requester is when it is asked, not when they asked. It asks, in this order:
that the export is being processed in the worker's Organization; that the
requester has an active membership and an active role holding
`data_export.create` and a permission the dataset needs; and then it returns
only rows at Properties the requester reaches where the dataset's commercial
gates (`capability_is_available`) are on. A requester who has lost the right
gets a refusal, not data: the export fails `requester_not_permitted`. A
schedule's run is the same: it creates a pending export requested by its
creator and the readers re-check the creator at run time. A schedule whose
creator was refused is paused, because the same refusal every morning is noise
and resuming it is somebody's decision.

The readers duplicate the shape of the workspace's gates for a person who is
not the caller (`app.accessible_property_ids()` asks about
`app.current_user_id()`). Setting the requester as the acting user inside the
worker's transaction would have reused them and given the worker an identity to
impersonate, which ADR 0018 forbids by design. The duplication is held in place
by a differential test: for each dataset, the worker's rows for a requester are
compared with what that requester reads under their own row-level security and
the screens' commercial gates, and the two must be the same set.

### 2. Which permission each dataset needs

| Dataset              | Needs, besides `data_export.create` | Why                                                                                               |
| -------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| `residents_guests`   | any one `front_desk.*` permission   | The workspace reads guests on reach and the front desk being on. See "What this leaves open".     |
| `reservations_stays` | any one `front_desk.*` permission   | The same.                                                                                         |
| `rooms_beds`         | nothing                             | Units are read on reach and the front desk being on; they are not personal data.                  |
| `folios_payments`    | `finance.manage_folio`              | The permission to work with a Folio.                                                              |
| `audit_log`          | `audit.read`                        | ADR 0031. The records returned are the ones the log would show that requester, archived included. |

The mapping is one function, `app.data_export_resource_permissions()`. The
insert policy asks it of a request (`app.may_export()`), so asking for what you
could not export is refused when it is made; a download asks it of the
downloader; the readers ask it of the requester. A pgTAP assertion keeps every
`front_desk.*` permission in the catalogue in the guest datasets' list, so a new
one is a red test that makes somebody decide.

### 3. A request is the request fields and nothing else

`ranza_app` inserts `organization_id`, `requester_id`, `requester_name`,
`resource_types` and `format`, selects every column but `file_content`, and
updates and deletes nothing. A trigger draws the states for every role, the
owner included:

```
pending -> processing | failed      processing -> ready | failed      ready -> expired
```

`failed` and `expired` are final, a row is born `pending`, and who asked and
what for is never rewritten. `pending -> failed` exists so a row that cannot
even be claimed is not left at the front of the queue. Check constraints say a
file exists exactly while the export is `ready`, that only a failed export has
a reason and that the reason is one of four codes the screen says in the
reader's language (`requester_not_permitted`, `too_large`, `worker_stopped`,
`internal_error`); the exception behind `internal_error` is in the worker's log
and in no row. The format is `csv` or `json`: `excel` was offered and nothing
wrote one.

`requester_name` is a name, or the address with its domain dropped
(`local@***`), made so by the database at insert, whatever the caller sent. The
status the first version called `processing` keeps that name, not `running`.

### 4. Failure always reaches a terminal state, and the queue cannot be held

The worker claims an export in a transaction of its own, so it leaves the queue
the moment a job takes it; builds and finishes it in a second, at one snapshot
so that two datasets in one file agree; and writes a failure in a third,
through `fail_data_export()`. A failure that cannot be written down is reported
as such and left for the sweep, which fails any export `processing` for thirty
minutes as `worker_stopped`. Every failure is logged with its reason and the
exception; the terminal transitions publish `data_export.completed`,
`data_export.failed` and `data_export.expired` to the outbox, with ids and
counts and nothing else.

### 5. Storage, expiry and download

Files stay in the database as text in `file_content` for now, bounded at 25 MiB
by a check constraint. A dataset is capped at 100,000 rows and fails
`too_large` rather than being handed over short. Object storage is a proposed
deferred row (EXP-DEF-01).

`complete_data_export()` sets the seven-day expiry. The worker clears the
content of a ready export past it and marks it `expired`; the record stays. The
download does not wait for the worker: it refuses an export past `expires_at`
whether or not the sweep has run.

The runtime role cannot select the file at all. It reaches it through
`app.read_data_export_file()`, which returns it only to the export's requester
or to somebody whose reach is the whole Organization and who holds
`data_export.read`, and in both cases holds every permission the export's
datasets need **now**: a Staff Member who lost `audit.read` cannot fetch the
audit export they made last week. Every download is recorded in the audit log
(`data_export.downloaded`) in the transaction that fetched the file, so none
leaves unrecorded; a refusal and a missing export are the same bodiless 404.
A request is recorded too (`data_export.requested`).

A CSV cell that is text and starts with `=`, `+`, `-`, `@`, a tab or a carriage
return is written with a leading apostrophe so a spreadsheet reads it as text.
Numbers are not touched, since a reversal's `-5000` is an amount. A CSV with
several datasets is stacked sections under `# dataset: name` lines, behind a
byte-order mark so Excel reads Turkish and Arabic; a CSV cannot hold two tables
and a file per dataset needs a container (EXP-DEF-02).

## Consequences

- Thirteen definers are added to the inventory in `insert_grants.test.sql`:
  five write, four of them behind `app.worker_organization_id()`, and four
  readers call `app.capability_is_available()`, which is correct for a worker
  and is pinned there.
- `ranza_worker` loses the grants and policies `20260916010100` gave it on
  `data_exports` and `export_schedules`. Nothing else reached them.
- A schedule's name, datasets and cadence are no longer editable from the
  workspace; changing what it exports would need the permission check an insert
  has. Pause and resume are.
- Every export carries the Property's commercial gates, so an Organization
  whose Subscription lapsed can export nothing but the audit log. Whether
  somebody leaving the product keeps a right to their data is not decided here
  (EXP-DEF-03).

## What this leaves open

The catalogue has no permission to read guests or reservations, so the guest
datasets ask for any one `front_desk.*` permission, which admits whoever works
at the desk and excludes Finance and Housekeeping. A permission of its own would
say it in one word and is a change to every shipped role (EXP-DEF-04).
