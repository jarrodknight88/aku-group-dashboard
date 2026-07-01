-- 04_helpers.sql
-- Centralized access logic. Every RLS policy uses these two functions.
-- SECURITY DEFINER so they read profiles/user_locations without tripping RLS
-- (this is what prevents recursive-policy errors on profiles).

create or replace function public.is_org_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner','admin')
  );
$$;

-- Optional narrower helper if you later want Owner read-only on config:
--   swap is_org_admin() for is_admin() in 06/07 write policies.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.can_access_location(loc uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_org_admin()
      or exists (
           select 1 from public.user_locations ul
           where ul.user_id = auth.uid() and ul.location_id = loc
         );
$$;
