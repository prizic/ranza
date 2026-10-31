-- A Property has an operating model: hotel or dormitory (ADR 0057, Proposed).
--
-- The model chooses what the screens default to, show first and call things.
-- It never chooses a rule: no policy, trigger or function reads this column,
-- and tests/database/operating_model.test.sql fails if one starts to. A rule a
-- dormitory needs is built as a setting any Property can use.
--
-- Hotel is the default, so every Property that exists keeps exactly the
-- screens it has.

alter table public.properties
  add column operating_model text not null default 'hotel'
  constraint properties_operating_model_check
    check (operating_model in ('hotel', 'dormitory'));

comment on column public.properties.operating_model is
  'What the screens default to, show first and call things (ADR 0057). Read '
  'by no policy, trigger or function, so changing it changes no rule.';

-- Changed on Configuration, under properties_update_configure: the same five
-- gates, the same stamp and the same audit record as every other setting.
grant update (operating_model) on public.properties to ranza_app;
