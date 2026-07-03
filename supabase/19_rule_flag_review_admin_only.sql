-- 19 — Reviewing rule-generated exceptions is a payroll-access action.
-- Rule-source flags (the $500 large-tip auto-holds) gate money movement:
-- approving one releases the tip onto the next exported payroll run. Only
-- org admins/owners run payroll, so only they may update 'rule' flags.
-- Manual/CSV flags stay editable by anyone with access to the location.

drop policy if exists exc_update on public.exception_flags;
create policy exc_update on public.exception_flags
  for update
  using (
    public.can_access_location(location_id)
    and (source <> 'rule' or public.is_org_admin())
  )
  with check (
    public.can_access_location(location_id)
    and (source <> 'rule' or public.is_org_admin())
  );
