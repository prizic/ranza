-- A bed under a room says so (ADR 0025), whoever writes it.
--
-- accommodation_units_nesting_check required `parent_unit_type = 'room'` of any
-- Unit with a parent, and the composite foreign key on (parent_id, property_id,
-- organization_id, parent_unit_type) proved the parent really is one. A blank
-- parent_unit_type defeated both: `null = 'room'` is null and a check passes on
-- null, and a foreign key with MATCH SIMPLE is not checked for a row with any
-- null column. So a bed could hang under another bed, or under another
-- Property's room, and nothing said a word. The yurt seed wrote all 120 of its
-- beds that way, and so did several test fixtures.
--
-- The column restates a fact that lives on the parent, so asking every writer
-- to restate it was the trap. A trigger now copies it from the parent when it
-- is left blank, the foreign key then always has a value to prove, and the
-- check refuses a blank that is still blank: a parent the writer cannot see, or
-- none at all.

-- What is already there names its parent's actual type. Where that parent is a
-- room the bed is now proved like every other; where it is not, the check below
-- refuses the row and this migration stops, which is right: such a bed has to
-- be looked at by a person, not repaired here.
update public.accommodation_units as bed
   set parent_unit_type = parent.unit_type
  from public.accommodation_units as parent
 where parent.id = bed.parent_id
   and bed.parent_unit_type is null;

-- `is not distinct from` is false for null, where `=` was null and let it by.
alter table public.accommodation_units
  drop constraint accommodation_units_nesting_check,
  add constraint accommodation_units_nesting_check
    check (
      case
        when parent_id is null then parent_unit_type is null
        else unit_type = 'bed' and parent_unit_type is not distinct from 'room'
      end
    );

-- Security invoker: the parent is read through the writer's own reach, so the
-- trigger tells nobody the type of a Unit they cannot see. A parent they cannot
-- see leaves the column blank, and the check above refuses the row.
create function app.unit_names_its_parent_type()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is not null and new.parent_unit_type is null then
    select parent.unit_type
      into new.parent_unit_type
      from public.accommodation_units as parent
     where parent.id = new.parent_id;
  end if;
  return new;
end;
$$;

revoke execute on function app.unit_names_its_parent_type() from public;

comment on function app.unit_names_its_parent_type() is
  'Fills accommodation_units.parent_unit_type from the parent when a writer leaves it blank, so the composite foreign key always proves a bed is under a room (ADR 0025).';

create trigger accommodation_units_name_their_parent_type
  before insert or update of parent_id, parent_unit_type
  on public.accommodation_units
  for each row execute function app.unit_names_its_parent_type();
