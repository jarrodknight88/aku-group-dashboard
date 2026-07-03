-- 29 — Mobile intake links (no-login manager form).
-- Managers get a per-location link (/submit?k=<token>) they save to their
-- phone — same trust model as the old Fillout URL: the link is the
-- credential, and it's revocable here (active = false) without touching
-- anyone's account. The public page talks to the invoice-intake Edge
-- Function, which validates the token and writes with the service role;
-- nothing in the database itself is opened to anonymous clients.

-- who dropped it off (free text on mobile — there's no login to stamp)
alter table public.invoices add column if not exists submitted_name text;

create table if not exists public.invoice_intake_links (
  token       text primary key,                 -- 64 hex chars, the URL secret
  location_id uuid references public.locations(id) on delete cascade,  -- null = org-wide (page shows a picker)
  label       text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.invoice_intake_links enable row level security;
-- admins manage links from the dashboard; the Edge Function reads them with
-- the service role (bypasses RLS), so no anonymous grant is needed
drop policy if exists iil_admin on public.invoice_intake_links;
create policy iil_admin on public.invoice_intake_links
  for all using (public.is_org_admin()) with check (public.is_org_admin());

-- seed one link per active location (idempotent on rerun)
insert into public.invoice_intake_links (token, location_id, label)
select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), l.id, l.name
from public.locations l
where l.status = 'active'
  and not exists (select 1 from public.invoice_intake_links il where il.location_id = l.id);
