-- Staff and permissions, slice 4: a reach change ends every session.
--
-- Slices 1 to 3 made reach changeable and published `staff.reach_changed` in
-- the transaction that changed it. Nothing consumed it, so a Staff Member whose
-- role was cut at nine could keep working under the old answer until their
-- session lapsed — which is the gap the whole feature exists to close, left
-- open on purpose while the way across it was undesigned (SP-S4-01).
--
-- The difficulty was never the handler. ADR 0005 put credentials behind
-- `ranza_auth`: `ranza_app` is granted nothing on `auth_session`, and neither is
-- `ranza_worker`. That boundary is the reason a defect in a tenant query cannot
-- reach a session token, and widening it to make one feature work would have
-- traded the property for the feature.
--
-- So nothing is widened. `ranza_worker` is granted **one function** and no table
-- at all. It cannot read a token, list a Staff Member's sessions, learn whether
-- somebody is signed in, or create anything. It can say "end every session this
-- Ranza user holds", which is the entire capability slice 4 needs, and the
-- function is the only thing that knows how to get from a Ranza user to the
-- provider subject the session table is keyed on (ADR 0027).

create function app.end_sessions_for(target_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  ended integer;
begin
  -- `auth_session."userId"` is the provider's subject, not a Ranza user id. The
  -- mapping is `public.auth_identities`, which is exactly the indirection ADR
  -- 0005 exists to keep in one place — and it is why this is a function rather
  -- than a grant: a caller holding the table would have had to know the
  -- mapping, and a caller that knows the mapping is a caller that can
  -- enumerate subjects.
  with subjects as (
    select identity.subject
    from public.auth_identities as identity
    where identity.user_id = target_user_id
  )
  delete from public.auth_session as session
  using subjects
  where session."userId" = subjects.subject;

  get diagnostics ended = row_count;
  return ended;
end;
$$;

comment on function app.end_sessions_for(uuid) is
  'Ends every session a Ranza user holds. The whole of what ranza_worker may do '
  'to the credential tables: no grant, no token, no way to ask who is signed in.';

-- Removed rather than expired in place. Better Auth removes a session on
-- sign-out, so the row is not a record anything relies on, and expiring instead
-- would leave a table that only ever grows. Why it happened is in
-- `audit.records`, written by the staff module in the transaction that changed
-- the reach — that is the history, and it does not live here.

grant execute on function app.end_sessions_for(uuid) to ranza_worker;
