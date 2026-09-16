-- Preserve parser-only CSV errors in the staged preview. The server marks a
-- wrong-column row explicitly because it cannot be represented by the three
-- normalized field values expected by the database validator.

create or replace function private.stage_student_roster_import(
  actor_id uuid,
  target_operator_id uuid,
  target_branch_id uuid,
  target_import_key text,
  submitted_rows jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  batch private.roster_imports%rowtype;
  item jsonb;
  row_no integer;
  reference text;
  student_name text;
  locale text;
  row_errors text[];
  invalid_column_count boolean;
begin
  if not private.actor_can_manage_roster(
    actor_id,
    target_operator_id,
    target_branch_id
  ) then
    raise exception 'Roster import access denied' using errcode = '42501';
  end if;
  if target_import_key !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(submitted_rows) <> 'array'
    or jsonb_array_length(submitted_rows) > 1000
  then
    raise exception 'Invalid roster import payload' using errcode = '22023';
  end if;

  select * into batch
  from private.roster_imports
  where operator_id = target_operator_id and import_key = target_import_key;
  if batch.id is not null then
    if batch.branch_id <> target_branch_id then
      raise exception 'Roster import key scope mismatch' using errcode = '42501';
    end if;
    return private.roster_import_preview(batch.id);
  end if;

  insert into private.roster_imports (
    operator_id,
    branch_id,
    import_key,
    created_by
  ) values (
    target_operator_id,
    target_branch_id,
    target_import_key,
    actor_id
  ) returning * into batch;

  for item in select value from jsonb_array_elements(submitted_rows)
  loop
    row_no := case
      when coalesce(item ->> 'rowNumber', '') ~ '^[0-9]+$'
        then (item ->> 'rowNumber')::integer
      else 2 + batch.row_count
    end;
    reference := btrim(coalesce(item ->> 'externalReference', ''));
    student_name := btrim(coalesce(item ->> 'displayName', ''));
    locale := lower(btrim(coalesce(item ->> 'preferredLocale', '')));
    invalid_column_count := coalesce(item ->> 'invalidColumnCount', 'false') = 'true';
    row_errors := array[]::text[];

    if row_no < 2 then
      row_errors := array_append(row_errors, 'INVALID_ROW_NUMBER');
      row_no := 2 + batch.row_count;
    end if;
    if invalid_column_count then
      row_errors := array_append(row_errors, 'INVALID_COLUMN_COUNT');
    else
      if char_length(reference) not between 1 and 120 then
        row_errors := array_append(row_errors, 'INVALID_EXTERNAL_REFERENCE');
      end if;
      if char_length(student_name) not between 2 and 120 then
        row_errors := array_append(row_errors, 'INVALID_DISPLAY_NAME');
      end if;
      if locale not in ('tr', 'en', 'ar') then
        row_errors := array_append(row_errors, 'INVALID_LOCALE');
      end if;
      if reference <> '' and exists (
        select 1 from public.students student
        where student.operator_id = target_operator_id
          and student.external_reference = reference
      ) then
        row_errors := array_append(row_errors, 'EXISTING_EXTERNAL_REFERENCE');
      end if;
    end if;

    insert into private.roster_import_rows (
      import_id,
      row_number,
      external_reference,
      display_name,
      preferred_locale,
      errors
    ) values (
      batch.id,
      row_no,
      nullif(reference, ''),
      nullif(student_name, ''),
      nullif(locale, ''),
      row_errors
    );
    batch.row_count := batch.row_count + 1;
  end loop;

  update private.roster_import_rows row
  set errors = array_append(row.errors, 'DUPLICATE_EXTERNAL_REFERENCE')
  where row.import_id = batch.id
    and row.external_reference is not null
    and exists (
      select 1 from private.roster_import_rows duplicate
      where duplicate.import_id = row.import_id
        and duplicate.external_reference = row.external_reference
        and duplicate.row_number <> row.row_number
    );

  update private.roster_imports target
  set row_count = (
        select count(*) from private.roster_import_rows where import_id = batch.id
      ),
      valid_count = (
        select count(*) from private.roster_import_rows
        where import_id = batch.id and cardinality(errors) = 0
      ),
      error_count = (
        select coalesce(sum(cardinality(errors)), 0)
        from private.roster_import_rows where import_id = batch.id
      )
  where target.id = batch.id;

  return private.roster_import_preview(batch.id);
end;
$$;
