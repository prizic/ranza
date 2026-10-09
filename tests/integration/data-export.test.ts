/**
 * Data export against a real database (RANZ-48, ADR 0043).
 *
 * The pgTAP suite (`tests/database/data_export.test.sql`) proves each function
 * and grant one call at a time. This proves the path they sit on: a request
 * through the module on `ranza_app`, a worker pass through the runner on
 * `ranza_worker` exactly as `apps/worker` composes it, and a download back
 * through the module — the file a person actually receives, not the rows a
 * function returned.
 *
 * A pass works through every pending export in the database, so it also
 * settles whatever another run left behind. Every assertion here is about this
 * suite's own Organization, which is new on every run.
 *
 * Breaks that were run, and what went red:
 *   the formula guard removed from csvCell      EXP-S1-41 (and the unit suite)
 *   every failure recorded as internal_error    EXP-S1-27, EXP-S1-33, EXP-S1-36
 *   a failure not written down                  EXP-S1-27, EXP-S1-33, EXP-S1-36
 *   the sweep failing nothing stalled           EXP-S1-31
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../../packages/db/src";
import {
  createDataExportModule,
  createExportRunner,
  DataExportRefusedError,
  type ExportFormat,
  type ExportResourceType,
} from "../../packages/ranza/data-export/src";

const app = createPrismaClient(process.env.DATABASE_URL!);
const worker = createPrismaClient(process.env.WORKER_DATABASE_URL!);
const owner = createPrismaClient(process.env.DIRECT_URL!);

const exports = createDataExportModule({ db: app });
const runner = createExportRunner({ db: worker });

const ORG = randomUUID();
const OTHER_ORG = randomUUID();
const P1 = randomUUID();
const P2 = randomUUID();
const OTHER_P = randomUUID();

const OWNER = randomUUID();
const ONE = randomUUID();
const STRANGER = randomUUID();
const AUDITOR = randomUUID();
const SCHEDULER = randomUUID();

const GUEST_FORMULA = randomUUID();
const GUEST_TURKISH = randomUUID();
const GUEST_OTHER_ORG = randomUUID();
const UNIT_P1 = randomUUID();
const UNIT_P2 = randomUUID();
const FOLIO_P1 = randomUUID();

const ALL: ExportResourceType[] = [
  "residents_guests",
  "reservations_stays",
  "rooms_beds",
  "folios_payments",
];

async function sql(query: string, ...values: unknown[]): Promise<void> {
  await owner.$executeRawUnsafe(query, ...values);
}

async function row<T>(query: string, ...values: unknown[]): Promise<T> {
  const [found] = await owner.$queryRawUnsafe<T[]>(query, ...values);
  return found as T;
}

beforeAll(async () => {
  await sql(
    `insert into public.users (id, email) values
       ($1::uuid, 'export-int-owner-' || $1 || '@example.test'),
       ($2::uuid, 'export-int-one-' || $2 || '@example.test'),
       ($3::uuid, 'export-int-stranger-' || $3 || '@example.test'),
       ($4::uuid, 'export-int-auditor-' || $4 || '@example.test'),
       ($5::uuid, 'export-int-scheduler-' || $5 || '@example.test')`,
    OWNER,
    ONE,
    STRANGER,
    AUDITOR,
    SCHEDULER,
  );
  await sql(
    `insert into public.organizations (id, name, status) values
       ($1::uuid, 'Export Integration', 'active'),
       ($2::uuid, 'Export Integration Other', 'active')`,
    ORG,
    OTHER_ORG,
  );
  await sql(
    `insert into public.subscriptions (organization_id, status) values
       ($1::uuid, 'active'), ($2::uuid, 'active')`,
    ORG,
    OTHER_ORG,
  );
  await sql(
    `insert into public.entitlements (organization_id, module_key) values
       ($1::uuid, 'front_office'), ($1::uuid, 'billing_folios'),
       ($2::uuid, 'front_office')`,
    ORG,
    OTHER_ORG,
  );
  await sql(
    `insert into public.properties (id, organization_id, name) values
       ($1::uuid, $3::uuid, 'Export P1'), ($2::uuid, $3::uuid, 'Export P2'),
       ($4::uuid, $5::uuid, 'Export Other')`,
    P1,
    P2,
    ORG,
    OTHER_P,
    OTHER_ORG,
  );
  await sql(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled)
     select p, $3::uuid, c, true
       from unnest(array[$1::uuid, $2::uuid]) as p
      cross join unnest(array['front_desk', 'finance']) as c`,
    P1,
    P2,
    ORG,
  );
  await sql(
    `insert into public.staff_roles (scope_id, key, organization_id, name, permissions) values
       ($1::uuid, 'exporter_one', $1::uuid, 'Exporter one',
        array['data_export.create', 'data_export.read', 'front_desk.check_in', 'finance.manage_folio']),
       ($1::uuid, 'auditor', $1::uuid, 'Auditor',
        array['data_export.create', 'data_export.read', 'audit.read']),
       ($1::uuid, 'scheduler', $1::uuid, 'Scheduler',
        array['data_export.create', 'data_export.read', 'audit.read'])`,
    ORG,
  );
  await sql(
    `insert into public.organization_memberships
       (organization_id, user_id, role, role_scope_id, access_scope) values
       ($1::uuid, $2::uuid, 'owner', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
       ($1::uuid, $3::uuid, 'exporter_one', $1::uuid, 'assigned_properties'),
       ($1::uuid, $5::uuid, 'auditor', $1::uuid, 'organization_wide'),
       ($1::uuid, $7::uuid, 'scheduler', $1::uuid, 'organization_wide'),
       ($4::uuid, $6::uuid, 'owner', '00000000-0000-0000-0000-000000000000', 'organization_wide')`,
    ORG,
    OWNER,
    ONE,
    OTHER_ORG,
    AUDITOR,
    STRANGER,
    SCHEDULER,
  );
  await sql(
    `insert into public.property_assignments (property_id, organization_id, user_id)
     values ($1::uuid, $2::uuid, $3::uuid)`,
    P1,
    ORG,
    ONE,
  );

  // A name that is a formula, one that is not ASCII, one with a comma and a
  // quote in it, and another Organization's, which no export here may hold.
  await sql(
    `insert into public.guests (id, organization_id, full_name, email) values
       ($1::uuid, $4::uuid, '=HYPERLINK("http://example.test","click")', 'formula@example.test'),
       ($2::uuid, $4::uuid, 'Şule Çelik, "Sue"', null),
       ($3::uuid, $5::uuid, 'Another Organization Guest', null)`,
    GUEST_FORMULA,
    GUEST_TURKISH,
    GUEST_OTHER_ORG,
    ORG,
    OTHER_ORG,
  );
  await sql(
    `insert into public.accommodation_units (id, property_id, organization_id, name, unit_type, capacity) values
       ($1::uuid, $3::uuid, $5::uuid, 'INT-101', 'room', 2),
       ($2::uuid, $4::uuid, $5::uuid, 'INT-201', 'room', 2)`,
    UNIT_P1,
    UNIT_P2,
    P1,
    P2,
    ORG,
  );
  const stay = randomUUID();
  await sql(
    `insert into public.stays
       (id, organization_id, property_id, accommodation_unit_id, user_id, stay_type, status, starts_on, ends_on)
     values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, null, 'guest', 'in_house',
             app.property_today($3::uuid), app.property_today($3::uuid) + 2)`,
    stay,
    ORG,
    P1,
    UNIT_P1,
  );
  await sql(
    `insert into public.folios (id, organization_id, property_id, stay_id, currency)
     values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'TRY')`,
    FOLIO_P1,
    ORG,
    P1,
    stay,
  );
  await sql(
    `insert into public.folio_lines
       (organization_id, property_id, folio_id, line_type, description, amount_minor, payment_method)
     values ($1::uuid, $2::uuid, $3::uuid, 'charge', '-Minibar, "late" night', 12000, null),
            ($1::uuid, $2::uuid, $3::uuid, 'payment', 'Cash', -4000, 'cash')`,
    ORG,
    P1,
    FOLIO_P1,
  );
});

afterAll(async () => {
  await Promise.all([
    app.$disconnect(),
    worker.$disconnect(),
    owner.$disconnect(),
  ]);
});

async function produce(
  userId: string,
  resourceTypes: ExportResourceType[],
  format: ExportFormat = "csv",
  property = P1,
): Promise<string> {
  const requested = await exports.requestExport(userId, property, {
    resourceTypes,
    format,
    requesterName: null,
  });
  return requested.id;
}

async function statusOf(exportId: string) {
  return row<{ status: string; error: string | null; contentIsNull: boolean }>(
    `select status, error, file_content is null as "contentIsNull"
       from public.data_exports where id = $1::uuid`,
    exportId,
  );
}

describe("a request becomes a file", () => {
  it("EXP-S1-01: is requested pending, produced by the worker, and downloaded by its requester", async () => {
    const id = await produce(OWNER, ["residents_guests", "rooms_beds"]);

    const requested = await exports.getExport(OWNER, id);
    expect(requested).toMatchObject({
      status: "pending",
      triggerType: "on_demand",
      fileName: null,
      error: null,
    });
    expect(requested!.requesterName).toMatch(
      /^export-int-owner-[0-9a-f-]+@\*\*\*$/,
    );
    expect(await exports.downloadExport(OWNER, id)).toBeNull();

    const report = await runner.processPendingExports();
    expect(
      report.failures.filter((failure) => failure.exportId === id),
    ).toEqual([]);

    const ready = await exports.getExport(OWNER, id);
    expect(ready).toMatchObject({
      status: "ready",
      fileName: `export-${id.slice(0, 8)}.csv`,
    });
    expect(ready!.recordCounts).toMatchObject({ rooms_beds: 2 });
    expect(ready!.expiresAt!.getTime()).toBeGreaterThan(
      Date.now() + 6 * 86_400_000,
    );

    const file = await exports.downloadExport(OWNER, id);
    expect(file).not.toBeNull();
    expect(file!.fileName).toBe(`export-${id.slice(0, 8)}.csv`);
    expect(
      file!.content.startsWith("\uFEFF# dataset: residents_guests\r\n"),
    ).toBe(true);
    expect(file!.content).toContain("\r\n\r\n# dataset: rooms_beds\r\n");
    expect(file!.content).toContain("INT-101");
    expect(file!.content).toContain("INT-201");
    expect(file!.content).toContain('"Şule Çelik, ""Sue"""');
    expect(file!.content).not.toContain("Another Organization Guest");
  });

  it("EXP-S1-41: a cell that is a formula is written as text", async () => {
    const id = await produce(OWNER, ["residents_guests"]);
    await runner.processPendingExports();

    const file = (await exports.downloadExport(OWNER, id))!;
    // Plain CSV for one dataset: the header is the first row.
    expect(
      file.content.startsWith("\uFEFFid,full_name,email,phone,created_at\r\n"),
    ).toBe(true);
    expect(file.content).toContain(
      `"'=HYPERLINK(""http://example.test"",""click"")"`,
    );
    expect(file.content).not.toMatch(/(^|,)"?=HYPERLINK/m);
  });

  it("EXP-S1-42: a JSON export carries amounts as numbers, a reversal's sign included", async () => {
    const id = await produce(OWNER, ["folios_payments"], "json");
    await runner.processPendingExports();

    const file = (await exports.downloadExport(OWNER, id))!;
    expect(file.fileName).toBe(`export-${id.slice(0, 8)}.json`);
    const parsed = JSON.parse(file.content) as {
      folios_payments: {
        amount_minor: number;
        description: string;
        currency: string;
      }[];
    };
    const lines = parsed.folios_payments.filter(
      (line) => line.amount_minor !== null,
    );
    expect(
      lines.map((line) => line.amount_minor).sort((a, b) => a - b),
    ).toEqual([-4000, 12000]);
    expect(lines.every((line) => line.currency === "TRY")).toBe(true);
    expect(lines.map((line) => line.description)).toContain(
      '-Minibar, "late" night',
    );
  });

  it("EXP-S1-13: a list of exports never carries a file", async () => {
    const list = await exports.listExports(OWNER, P1);
    expect(list.length).toBeGreaterThan(0);
    for (const item of list) expect("fileContent" in item).toBe(false);
  });
});

describe("what the requester could read", () => {
  it("EXP-S1-24: a requester who reaches one Property exports that Property's rooms and not the other's", async () => {
    const id = await produce(ONE, ["rooms_beds", "reservations_stays"]);
    await runner.processPendingExports();

    const file = (await exports.downloadExport(ONE, id))!;
    expect(file.content).toContain("INT-101");
    expect(file.content).not.toContain("INT-201");
  });

  it("EXP-S1-03: a dataset the role cannot export is refused when it is asked for", async () => {
    await expect(produce(ONE, ["audit_log"])).rejects.toBeInstanceOf(
      DataExportRefusedError,
    );
  });

  it("EXP-S1-05: nor can an Organization's export be asked for by somebody outside it", async () => {
    await expect(
      produce(STRANGER, ["rooms_beds"], "csv", P1),
    ).rejects.toBeInstanceOf(DataExportRefusedError);
  });

  it("EXP-S1-27: an export is refused at run time when its requester has since lost the permission", async () => {
    const id = await produce(AUDITOR, ["audit_log"]);
    await sql(
      `update public.staff_roles set permissions = array['data_export.create', 'data_export.read']
        where scope_id = $1::uuid and key = 'auditor'`,
      ORG,
    );

    const report = await runner.processPendingExports();

    expect(
      report.failures.filter((failure) => failure.exportId === id),
    ).toMatchObject([{ exportId: id, reason: "requester_not_permitted" }]);
    expect(await statusOf(id)).toEqual({
      status: "failed",
      error: "requester_not_permitted",
      contentIsNull: true,
    });
    expect(await exports.downloadExport(AUDITOR, id)).toBeNull();
  });
});

describe("who may download", () => {
  it("EXP-S1-38: only the requester, or somebody whose reach is the Organization and who holds what it covers", async () => {
    const id = await produce(ONE, ["rooms_beds"]);
    await runner.processPendingExports();

    expect(await exports.downloadExport(ONE, id)).not.toBeNull();
    // The owner is Organization-wide with every permission.
    expect(await exports.downloadExport(OWNER, id)).not.toBeNull();
    // Another Organization's owner is told what a missing export is told.
    expect(await exports.downloadExport(STRANGER, id)).toBeNull();
    // Reaches the Organization and holds data_export.read, but one Property
    // is not "the whole Organization" and was not the requester.
    const own = await produce(OWNER, ["rooms_beds"]);
    await runner.processPendingExports();
    expect(await exports.downloadExport(ONE, own)).toBeNull();
  });

  it("EXP-S1-37: every download is recorded, with who and what", async () => {
    const id = await produce(OWNER, ["rooms_beds"]);
    await runner.processPendingExports();
    await exports.downloadExport(OWNER, id);

    const requested = await row<{ n: number }>(
      `select count(*)::int as n from audit.records
        where action = 'data_export.requested' and subject_id = $1::uuid and actor_id = $2::uuid`,
      id,
      OWNER,
    );
    const downloaded = await row<{
      context: { format: string; bytes: number; resourceTypes: string[] };
    }>(
      `select context from audit.records
        where action = 'data_export.downloaded' and subject_id = $1::uuid and actor_id = $2::uuid`,
      id,
      OWNER,
    );
    expect(requested.n).toBe(1);
    expect(downloaded.context).toMatchObject({
      format: "csv",
      resourceTypes: ["rooms_beds"],
    });
    expect(downloaded.context.bytes).toBeGreaterThan(0);
  });
});

describe("the queue", () => {
  it("EXP-S1-36: exports that fail do not hold the queue: one behind fifty-two of them is produced", async () => {
    const gone = randomUUID();
    await sql(
      `insert into public.users (id, email) values ($1::uuid, 'export-int-gone-' || $1 || '@example.test')`,
      gone,
    );
    // A requester who is not a member of anything: every one of these is
    // refused when the worker reads for them.
    await sql(
      `insert into public.data_exports
         (organization_id, requester_id, requester_name, resource_types, format, requested_at)
       select $1::uuid, $2::uuid, 'Gone', array['rooms_beds'], 'csv',
              now() - interval '1 day' - make_interval(secs => n)
         from generate_series(1, 52) as n`,
      ORG,
      gone,
    );
    const behind = await produce(OWNER, ["rooms_beds"]);

    await runner.processPendingExports();
    await runner.processPendingExports();

    expect((await statusOf(behind)).status).toBe("ready");
    const settled = await row<{ n: number }>(
      `select count(*)::int as n from public.data_exports
        where requester_id = $1::uuid and status = 'failed' and error = 'requester_not_permitted'`,
      gone,
    );
    expect(settled.n).toBe(52);
  }, 120_000);

  it("EXP-S1-31: an export a worker claimed and abandoned is failed by the sweep, and a file past its retention is cleared", async () => {
    const stalled = await produce(OWNER, ["rooms_beds"]);
    await sql(
      `update public.data_exports set status = 'processing' where id = $1::uuid`,
      stalled,
    );
    await owner.$transaction([
      owner.$executeRawUnsafe(`set local session_replication_role = replica`),
      owner.$executeRawUnsafe(
        `update public.data_exports set updated_at = now() - interval '31 minutes' where id = $1::uuid`,
        stalled,
      ),
    ]);

    const old = await produce(OWNER, ["rooms_beds"]);
    await runner.processPendingExports();
    await owner.$transaction([
      owner.$executeRawUnsafe(`set local session_replication_role = replica`),
      owner.$executeRawUnsafe(
        `update public.data_exports set expires_at = now() - interval '1 minute' where id = $1::uuid`,
        old,
      ),
    ]);

    const report = await runner.sweepExports();

    expect(report.failures).toEqual([]);
    expect(await statusOf(stalled)).toEqual({
      status: "failed",
      error: "worker_stopped",
      contentIsNull: true,
    });
    expect(await statusOf(old)).toEqual({
      status: "expired",
      error: null,
      contentIsNull: true,
    });
    expect(await exports.downloadExport(OWNER, old)).toBeNull();
  });
});

describe("a schedule", () => {
  it("EXP-S1-32: starts exports when it is due, as its creator, and moves on", async () => {
    const created = await exports.createSchedule(OWNER, P1, {
      name: 'Nightly "rooms"',
      resourceTypes: ["rooms_beds"],
      format: "json",
      frequency: "daily",
      creatorName: "Dilara Owner",
    });
    expect(created.createdByName).toBe("Dilara Owner");
    expect(created.nextRunAt.getTime()).toBeGreaterThan(
      Date.now() + 23 * 3_600_000,
    );

    await owner.$transaction([
      owner.$executeRawUnsafe(`set local session_replication_role = replica`),
      owner.$executeRawUnsafe(
        `update public.export_schedules set next_run_at = now() - interval '5 minutes' where id = $1::uuid`,
        created.id,
      ),
    ]);

    const schedules = await runner.processDueSchedules();
    expect(schedules.failures).toEqual([]);
    expect(schedules.exportsTriggered).toBeGreaterThanOrEqual(1);
    await runner.processPendingExports();

    const started = await row<{
      id: string;
      status: string;
      requesterName: string;
      triggerType: string;
    }>(
      `select id, status, requester_name as "requesterName", trigger_type as "triggerType"
         from public.data_exports where schedule_id = $1::uuid`,
      created.id,
    );
    expect(started).toMatchObject({
      status: "ready",
      requesterName: "Dilara Owner",
      triggerType: "scheduled",
    });
    expect(await exports.downloadExport(OWNER, started.id)).not.toBeNull();

    const [after] = (await exports.listSchedules(OWNER, P1)).filter(
      (s) => s.id === created.id,
    );
    expect(after!.lastRunAt).not.toBeNull();
    expect(after!.nextRunAt.getTime()).toBeGreaterThan(
      Date.now() + 23 * 3_600_000,
    );
  });

  it("EXP-S1-33: a schedule whose creator may no longer export produces a refusal, and is paused", async () => {
    const created = await exports.createSchedule(SCHEDULER, P1, {
      name: "Audit nightly",
      resourceTypes: ["audit_log"],
      format: "csv",
      frequency: "daily",
      creatorName: null,
    });
    await sql(
      `update public.staff_roles set permissions = array['data_export.create', 'data_export.read']
        where scope_id = $1::uuid and key = 'scheduler'`,
      ORG,
    );
    await owner.$transaction([
      owner.$executeRawUnsafe(`set local session_replication_role = replica`),
      owner.$executeRawUnsafe(
        `update public.export_schedules set next_run_at = now() - interval '5 minutes' where id = $1::uuid`,
        created.id,
      ),
    ]);

    await runner.processDueSchedules();
    const report = await runner.processPendingExports();

    const refused = await row<{ id: string; status: string; error: string }>(
      `select id, status, error from public.data_exports where schedule_id = $1::uuid`,
      created.id,
    );
    expect(refused).toMatchObject({
      status: "failed",
      error: "requester_not_permitted",
    });
    expect(report.failures.map((failure) => failure.exportId)).toContain(
      refused.id,
    );
    expect(
      (await exports.listSchedules(OWNER, P1)).find((s) => s.id === created.id)
        ?.status,
    ).toBe("paused");
  });
});

describe("what the worker holds", () => {
  it("EXP-S1-18: ranza_worker cannot read an export or any table an export reads", async () => {
    for (const table of [
      "public.data_exports",
      "public.guests",
      "public.folio_lines",
      "audit.records",
    ]) {
      await expect(
        worker.$queryRawUnsafe(`select 1 from ${table} limit 1`),
      ).rejects.toThrow(/permission denied/);
    }
  });

  it("EXP-S1-06: ranza_app cannot select an export's file or mark one ready", async () => {
    await expect(
      app.$queryRawUnsafe(
        `select file_content from public.data_exports limit 1`,
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      app.$executeRawUnsafe(`update public.data_exports set status = 'ready'`),
    ).rejects.toThrow(/permission denied/);
  });
});
