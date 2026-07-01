-- 05_rls_identity.sql
-- Enable RLS + policies on the identity tables. Prove the access model here
-- with two test users before building anything above it.

alter table public.profiles       enable row level security;
alter table public.locations      enable row level security;
alter table public.user_locations enable row level security;

-- ---------- profiles ----------
-- Read your own row; org-admins read everyone.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using ( id = auth.uid() or public.is_org_admin() );

-- Update your own row (role change is blocked by the trg_protect_role trigger);
-- org-admins may update anyone.
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using ( id = auth.uid() or public.is_org_admin() )
  with check     ( id = auth.uid() or public.is_org_admin() );

-- Inserts happen via the handle_new_user trigger (definer) only.
drop policy if exists profiles_insert_admin on public.profiles;
create policy profiles_insert_admin on public.profiles
  for insert with check ( public.is_org_admin() );

-- ---------- locations ----------
-- You see a location if you can access it (admins see all).
drop policy if exists locations_select on public.locations;
create policy locations_select on public.locations
  for select using ( public.can_access_location(id) );

drop policy if exists locations_write on public.locations;
create policy locations_write on public.locations
  for all using ( public.is_org_admin() )
            with check ( public.is_org_admin() );

-- ---------- user_locations ----------
-- See your own assignments; admins see all. Only admins assign.
drop policy if exists user_locations_select on public.user_locations;
create policy user_locations_select on public.user_locations
  for select using ( user_id = auth.uid() or public.is_org_admin() );

drop policy if exists user_locations_write on public.user_locations;
create policy user_locations_write on public.user_locations
  for all using ( public.is_org_admin() )
            with check ( public.is_org_admin() );

-- VERIFY:
--   1. Make yourself owner:  update profiles set role='owner' where id=auth.uid();
--      (run once as the service role / SQL editor, which bypasses RLS)
--   2. Create a second user, leave as 'manager', assign one location.
--   3. Log in as each; confirm the manager sees only their location.
