-- Resume Formatter: activate a template in one transaction (TEC-61).
--
-- Approved by the technical director on 2026-09-25, as holder of Postgres
-- design: a `resume` schema function that clears the active template and sets
-- the new one together.
--
-- Activating took two PostgREST updates — clear every active row, then set the
-- chosen one — so a failure between them left no template active, and
-- /api/reformat refuses to run without one. It cannot be one update: the
-- partial unique index `templates_single_active` is not deferrable, so Postgres
-- checks it row by row as a single UPDATE runs, and whether that statement
-- trips it depends on the order it happens to visit the rows. Two statements
-- in one function body share one transaction, so either both land or neither
-- does, and the index is never asked to hold two active rows at once.
--
-- Returns the activated row, or no rows when the id is not there — in which
-- case nothing was cleared, because the existence check comes first. The
-- archived-cannot-be-active rule stays where it is, in the check constraint
-- `templates_archived_not_active`: activating an archived template raises
-- there and the whole call rolls back, leaving the current active untouched.
--
-- SECURITY INVOKER, the default, stated so nobody has to remember it: the
-- function runs with the caller's rights, so Row Level Security still applies
-- to anyone but the service role.
--
-- **Grants.** This is the first function in the project's history, and
-- functions are not covered by 20260910051549, which set default privileges on
-- TABLES only. Postgres grants EXECUTE on every new function to PUBLIC by
-- default, which in this project means `anon` — a leaked publishable key could
-- call it. RLS would stop the writes (zero policies), but the rule here is
-- that nothing beyond what the server needs is reachable, so EXECUTE is revoked
-- from PUBLIC, `anon` and `authenticated` and granted to `service_role` alone,
-- which is the only role the app uses.
--
-- **Shape: additive.** A new function; no table, column, index or constraint
-- changes. The code before this lands never calls it, so the database sitting
-- ahead of the code changes nothing. Safe to apply before merging.

create function resume.activate_template(template_id uuid)
returns setof resume.templates
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Lock the target first. An id that is not there returns no rows and
  -- clears nothing: clearing first would leave nothing active.
  perform 1 from resume.templates t where t.id = activate_template.template_id for update;
  if not found then
    return;
  end if;

  update resume.templates t
     set is_active = false
   where t.is_active
     and t.id <> activate_template.template_id;

  return query
    update resume.templates t
       set is_active = true
     where t.id = activate_template.template_id
    returning t.*;
end;
$$;

comment on function resume.activate_template(uuid) is
  'Make one template the active one, clearing the previous active in the same transaction. '
  'No rows back means no such id, and nothing was changed.';

revoke execute on function resume.activate_template(uuid) from public, anon, authenticated;
grant execute on function resume.activate_template(uuid) to service_role;

NOTIFY pgrst, 'reload schema';
