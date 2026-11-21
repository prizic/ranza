/**
 * Guided import, through the runner the application uses (IMP-S1-*, ADR 0065).
 *
 * tests/database/guided_import.test.sql proves each policy and trigger one
 * statement at a time, and tests/unit/import-*.test.ts the reading of a file.
 * This proves what only the whole adds: a file becomes rooms through
 * accommodation's own command under the uploader's session, so an importer who
 * may not add rooms adds none; a room already there is skipped and left as it
 * was; a closed tab pauses and never doubles; each move is audited with counts
 * and no cell of the file; and the worker forgets the rows.
 *
 * A Property of each run's own; the Organization and its people are shared and
 * idempotent.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createImportRun } from "../../apps/operator-workspace/src/server/import-run";
import { createAccommodationModule } from "../../packages/ranza/accommodation/src";
import { createCoreModule } from "../../packages/ranza/core/src";
import { createPrismaClient } from "../../packages/db/src";
import {
  IMPORT_BATCH,
  ImportAlreadyRunningError,
  ImportRefusedError,
  ImportStateError,
  createImportSweeper,
  createImportsModule,
} from "../../packages/ranza/imports/src";
import { latestRecord } from "./audit-record";

const ORG = "a6600002-0000-4000-8000-000000000001";
const MANAGER = "a6600001-0000-4000-8000-000000000001";
const SECOND_MANAGER = "a6600001-0000-4000-8000-000000000002";
const IMPORTER_ONLY = "a6600001-0000-4000-8000-000000000003";
const DESK = "a6600001-0000-4000-8000-000000000004";
const PROPERTY = randomUUID();

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const worker = createPrismaClient(process.env.WORKER_DATABASE_URL!);
const owner = createPrismaClient(process.env.DIRECT_URL!);
const imports = createImportsModule({ db: prisma });
const accommodation = createAccommodationModule({ db: prisma });
const core = createCoreModule({ db: prisma });
const sweeper = createImportSweeper({ db: worker });

const unreported: unknown[] = [];
const run = createImportRun({
  imports,
  accommodation,
  operatingModel: (userId, propertyId) =>
    core.operatingModel(userId, propertyId),
  report: (_event, _context, error) => unreported.push(error),
});

const csv = (...lines: string[]) =>
  new TextEncoder().encode(
    ["Blok;Kat;Oda No;Kapasite;Yatak bazlı;Kimler kalabilir", ...lines].join(
      "\n",
    ),
  );

async function staged(
  userId: string,
  fileName: string,
  bytes: Uint8Array,
): Promise<string> {
  const preview = await run.previewRooms(userId, {
    propertyId: PROPERTY,
    fileName,
    bytes,
  });
  if (preview.status !== "staged")
    throw new Error(`not staged: ${preview.status}`);
  return preview.importId;
}

async function runToTheEnd(userId: string, importId: string): Promise<number> {
  let passes = 0;
  while ((await run.importNext(userId, importId)) === "importing") passes += 1;
  return passes + 1;
}

const rooms = () =>
  owner.$queryRawUnsafe<
    {
      name: string;
      capacity: number;
      admits: string | null;
      building: string | null;
      beds: number;
    }[]
  >(
    `select unit.name, unit.capacity, unit.admits, unit.building,
            (select count(*)::int from public.accommodation_units as bed
              where bed.parent_id = unit.id) as beds
       from public.accommodation_units as unit
      where unit.property_id = $1::uuid and unit.parent_id is null
      order by unit.name`,
    PROPERTY,
  );

beforeAll(async () => {
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email) values
       ($1, 'import-manager@example.test'), ($2, 'import-second@example.test'),
       ($3, 'import-only@example.test'), ($4, 'import-desk@example.test')
     on conflict (id) do nothing`,
    MANAGER,
    SECOND_MANAGER,
    IMPORTER_ONLY,
    DESK,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status)
     values ($1, 'Import Run Organization', 'active') on conflict (id) do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.subscriptions (organization_id, status) values ($1, 'active')
     on conflict (organization_id) do update set status = 'active'`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.entitlements (organization_id, module_key, status)
     values ($1, 'front_office', 'active')
     on conflict (organization_id, module_key) do update set status = 'active'`,
    ORG,
  );
  // A role that may import and may not add a room: what makes "an import does
  // only what its uploader could do by hand" a claim that can fail.
  await owner.$executeRawUnsafe(
    `insert into public.staff_roles (scope_id, key, organization_id, name, permissions)
     values ($1, 'importer_only', $1, 'Importer only', array['import.run'])
     on conflict do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organization_memberships
       (organization_id, user_id, role, role_scope_id, access_scope)
     values ($1, $2, 'manager', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
            ($1, $3, 'manager', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
            ($1, $4, 'importer_only', $1, 'organization_wide'),
            ($1, $5, 'front_desk', '00000000-0000-0000-0000-000000000000', 'organization_wide')
     on conflict (organization_id, user_id) do update
       set status = 'active', revoked_at = null`,
    ORG,
    MANAGER,
    SECOND_MANAGER,
    IMPORTER_ONLY,
    DESK,
  );
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name, operating_model)
     values ($1, $2, $3, 'dormitory')`,
    PROPERTY,
    ORG,
    `Import Yurt ${PROPERTY.slice(0, 8)}`,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled)
     values ($1, $2, 'front_desk', true)`,
    PROPERTY,
    ORG,
  );
});

afterAll(async () => {
  await owner.$disconnect();
  await worker.$disconnect();
  await prisma.$disconnect();
});

describe("a file of rooms", () => {
  let first: string;

  it("IMP-S1-22: an imported room has its beds and is audited to its uploader", async () => {
    first = await staged(
      MANAGER,
      "odalar.csv",
      csv(
        "Blok Zeytin;1;101;4;Evet;Kadın",
        "Blok Zeytin;1;102;2;Hayır;",
        ";;1o3;2;;",
        "Blok Zeytin;2;201;3;;Erkek",
      ),
    );
    const preview = await imports.getImport(MANAGER, first);
    expect(preview?.status).toBe("staged");
    expect(preview?.counts).toMatchObject({ ready: 3, wrong: 1, skipped: 0 });
    expect(
      preview?.rows.find((row) => row.state === "wrong")?.problems,
    ).toEqual([{ column: "room", code: "not_digits" }]);
    expect(await rooms()).toEqual([]);

    await imports.startImport(MANAGER, first);
    expect(await runToTheEnd(MANAGER, first)).toBe(1);

    expect(await rooms()).toEqual([
      {
        name: "101",
        capacity: 4,
        admits: "female",
        building: "Blok Zeytin",
        beds: 4,
      },
      {
        name: "102",
        capacity: 2,
        admits: null,
        building: "Blok Zeytin",
        beds: 0,
      },
      // No word for the bed: a dormitory lets a room by the bed (ADR 0057).
      {
        name: "201",
        capacity: 3,
        admits: "male",
        building: "Blok Zeytin",
        beds: 3,
      },
    ]);
    const done = await imports.getImport(MANAGER, first);
    expect(done?.status).toBe("finished");
    expect(done?.counts).toEqual({
      ready: 0,
      wrong: 1,
      skipped: 0,
      imported: 3,
      refused: 0,
      left: 0,
    });

    const [added] = await owner.$queryRawUnsafe<{ actorId: string }[]>(
      `select actor_id as "actorId" from audit.records
        where action = 'unit.added' and location_id = $1::uuid
        order by occurred_at desc limit 1`,
      PROPERTY,
    );
    expect(added?.actorId).toBe(MANAGER);
    expect(unreported).toEqual([]);
  });

  it("IMP-S1-16: starting and finishing are audited with counts and no cell of the file", async () => {
    const started = await latestRecord(owner, "import.started", first);
    const finished = await latestRecord(owner, "import.finished", first);
    expect(started).toMatchObject({
      locationId: PROPERTY,
      context: { kind: "rooms", fileName: "odalar.csv", ready: 3, wrong: 1 },
    });
    expect(finished).toMatchObject({
      locationId: PROPERTY,
      context: { imported: 3, wrong: 1, ready: 0 },
    });
    expect(JSON.stringify([started, finished])).not.toContain("Zeytin");
  });

  it("IMP-S1-21: the same file a second time has no ready row", async () => {
    const again = await staged(
      MANAGER,
      "odalar.csv",
      csv(
        "Blok Zeytin;1;101;4;Evet;Kadın",
        "Blok Zeytin;1;102;2;Hayır;",
        "Blok Zeytin;2;201;3;;Erkek",
      ),
    );
    expect((await imports.getImport(MANAGER, again))?.counts).toMatchObject({
      ready: 0,
      skipped: 3,
    });
    await expect(imports.startImport(MANAGER, again)).rejects.toBeInstanceOf(
      ImportStateError,
    );
    expect(await rooms()).toHaveLength(3);
    await imports.discardImport(MANAGER, again);
  });

  it("IMP-S1-20: a room the Property already has is skipped and left as it was", async () => {
    const racing = await staged(
      MANAGER,
      "yarış.csv",
      csv(";3;301;6;Evet;", ";3;302;2;Hayır;"),
    );
    // Somebody adds 301 by hand between the preview and the import, sleeping two.
    await accommodation.addUnits(SECOND_MANAGER, {
      propertyId: PROPERTY,
      building: null,
      floor: 3,
      unitType: "room",
      firstNumber: "301",
      count: 1,
      capacity: 2,
      letByTheBed: false,
      admits: null,
    });
    await imports.startImport(MANAGER, racing);
    await runToTheEnd(MANAGER, racing);

    const after = await imports.getImport(MANAGER, racing);
    expect(after?.counts).toMatchObject({
      imported: 1,
      skipped: 1,
      refused: 0,
    });
    expect(after?.rows.find((row) => row.cells.room === "301")).toMatchObject({
      state: "skipped",
      outcome: "already_there",
    });
    expect((await rooms()).find((room) => room.name === "301")).toMatchObject({
      capacity: 2,
      beds: 0,
    });
  });

  it("IMP-S1-05: an importer who may not add rooms adds none through an import", async () => {
    const before = await rooms();
    const theirs = await staged(
      IMPORTER_ONLY,
      "izinsiz.csv",
      csv(";4;401;2;;", ";4;402;2;;"),
    );
    await imports.startImport(IMPORTER_ONLY, theirs);
    await runToTheEnd(IMPORTER_ONLY, theirs);

    const after = await imports.getImport(IMPORTER_ONLY, theirs);
    expect(after?.status).toBe("finished");
    expect(after?.counts).toMatchObject({ imported: 0, refused: 2 });
    expect(after?.rows.map((row) => row.outcome)).toEqual([
      "not_permitted",
      "not_permitted",
    ]);
    expect(await rooms()).toEqual(before);
    expect(unreported).toEqual([]);
  });

  it("IMP-S1-02: a front desk without import.run previews nothing", async () => {
    await expect(
      run.previewRooms(DESK, {
        propertyId: PROPERTY,
        fileName: "resepsiyon.csv",
        bytes: csv(";5;501;2;;"),
      }),
    ).rejects.toBeInstanceOf(ImportRefusedError);
    expect(await imports.mayImport(DESK, PROPERTY)).toBe(false);
    expect(await imports.mayImport(MANAGER, PROPERTY)).toBe(true);
    expect(await imports.listImports(DESK, PROPERTY)).toEqual([]);
  });

  it("IMP-S1-17: a heading nobody recognises is asked about, and the answer is used", async () => {
    const bytes = new TextEncoder().encode("Oda;Kaç kişilik\n601;2\n");
    const asked = await run.previewRooms(MANAGER, {
      propertyId: PROPERTY,
      fileName: "başlık.csv",
      bytes,
    });
    expect(asked).toMatchObject({
      status: "needsMapping",
      missing: ["sleeps"],
      headers: ["Oda", "Kaç kişilik"],
    });
    if (asked.status !== "needsMapping") return;

    const answered = await run.previewRooms(MANAGER, {
      propertyId: PROPERTY,
      fileName: "başlık.csv",
      bytes,
      chosen: { ...asked.mapping, sleeps: 1 },
    });
    expect(answered.status).toBe("staged");
    if (answered.status !== "staged") return;
    expect(
      (await imports.getImport(MANAGER, answered.importId))?.counts.ready,
    ).toBe(1);
    await imports.discardImport(MANAGER, answered.importId);
  });
});

describe("an import in progress", () => {
  const many = Array.from(
    { length: IMPORT_BATCH * 2 + 5 },
    (_, index) => `;7;${7001 + index};2;Hayır;`,
  );
  let long: string;

  it("IMP-S1-11: an import carried on after a pause imports the rest and nothing twice", async () => {
    long = await staged(MANAGER, "uzun.csv", csv(...many));
    await imports.startImport(MANAGER, long);

    // One request's worth, and then the tab is closed.
    expect(await run.importNext(MANAGER, long)).toBe("importing");
    const paused = await imports.getImport(MANAGER, long);
    expect(paused?.counts).toMatchObject({
      imported: IMPORT_BATCH,
      ready: IMPORT_BATCH + 5,
    });

    expect(await runToTheEnd(MANAGER, long)).toBe(2);
    const done = await imports.getImport(MANAGER, long);
    expect(done?.counts).toMatchObject({
      imported: many.length,
      ready: 0,
      skipped: 0,
      refused: 0,
    });
    expect(
      (await rooms()).filter((room) => room.name.startsWith("70")),
    ).toHaveLength(many.length);
    // Asked once more after the end: nothing is imported and nothing breaks.
    expect(await run.importNext(MANAGER, long)).toBe("finished");
  }, 60_000);

  it("IMP-S1-07: a second import does not start while one is running, and IMP-S1-12: anybody who imports there may stop it", async () => {
    const running = await staged(
      MANAGER,
      "ilk.csv",
      csv(";8;801;2;;", ";8;802;2;;"),
    );
    const waiting = await staged(
      SECOND_MANAGER,
      "ikinci.csv",
      csv(";8;811;2;;"),
    );
    await imports.startImport(MANAGER, running);
    await expect(
      imports.startImport(SECOND_MANAGER, waiting),
    ).rejects.toBeInstanceOf(ImportAlreadyRunningError);

    // The second manager reads the import and none of its rows (IMP-S1-04),
    // cannot carry it on (IMP-S1-10), and may stop it.
    const seen = await imports.getImport(SECOND_MANAGER, running);
    expect(seen).toMatchObject({ mine: false, status: "importing", rows: [] });
    await expect(
      run.importNext(SECOND_MANAGER, running),
    ).rejects.toBeInstanceOf(ImportRefusedError);
    await imports.stopImport(SECOND_MANAGER, running);

    const stopped = await imports.getImport(MANAGER, running);
    expect(stopped?.status).toBe("finished");
    expect(stopped?.counts).toMatchObject({ imported: 0, left: 2 });
    expect(await latestRecord(owner, "import.stopped", running)).toMatchObject({
      locationId: PROPERTY,
      context: { left: 2 },
    });
    expect((await rooms()).some((room) => room.name === "801")).toBe(false);

    await imports.startImport(SECOND_MANAGER, waiting);
    await runToTheEnd(SECOND_MANAGER, waiting);
    expect((await rooms()).some((room) => room.name === "811")).toBe(true);
  });

  it("IMP-S1-28: past imports are listed newest first, each with its uploader and counts", async () => {
    const list = await imports.listImports(MANAGER, PROPERTY);
    expect(list.length).toBeGreaterThan(5);
    expect(list[0]).toMatchObject({
      fileName: "ikinci.csv",
      mine: false,
      status: "finished",
    });
    expect(list[0]?.uploaderEmail).toBe("import-second@example.test");
    expect(list.map((item) => item.createdAt.getTime())).toEqual(
      [...list].map((item) => item.createdAt.getTime()).sort((a, b) => b - a),
    );
  });

  it("IMP-S1-15: the worker forgets the rows after seven days and the counts stay", async () => {
    // Eight days pass. The stamp trigger is off inside this one transaction,
    // because nothing but time is meant to age an import.
    await owner.$transaction([
      owner.$executeRawUnsafe(
        `alter table public.imports disable trigger imports_move_forward`,
      ),
      owner.$executeRawUnsafe(
        `update public.imports set touched_at = now() - interval '8 days' where id = $1::uuid`,
        long,
      ),
      owner.$executeRawUnsafe(
        `alter table public.imports enable trigger imports_move_forward`,
      ),
    ]);

    const report = await sweeper.sweep();
    expect(report.failures).toEqual([]);
    expect(report.forgotten).toBeGreaterThanOrEqual(1);

    const forgotten = await imports.getImport(MANAGER, long);
    expect(forgotten).toMatchObject({
      rowsForgotten: true,
      rows: [],
      status: "finished",
    });
    expect(forgotten?.counts.imported).toBe(many.length);
    // And nothing younger was touched.
    const young = (await imports.listImports(MANAGER, PROPERTY)).filter(
      (item) => item.id !== long,
    );
    expect(young.every((item) => !item.rowsForgotten)).toBe(true);
  });
});
