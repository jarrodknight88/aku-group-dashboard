-- 03_locations.sql
-- Locations as rows (addable, not hardcoded) + one-to-many user mapping.

create table if not exists public.locations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  code       text not null unique,
  city       text,
  status     location_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_locations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id)  on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (user_id, location_id)
);

create index if not exists idx_user_locations_user on public.user_locations(user_id);
create index if not exists idx_user_locations_loc  on public.user_locations(location_id);

-- Seed current footprint. R Thomas reopening soon → coming_soon.
insert into public.locations (name, code, city, status) values
  ('Teranga ATL',   'ATL',     'Atlanta',   'active'),
  ('Teranga CLT',   'CLT',     'Charlotte', 'active'),
  ('Afro District', 'AFRO',    'Atlanta',   'active'),
  ('R Thomas',      'RTHOMAS', 'Atlanta',   'coming_soon')
on conflict (code) do nothing;
