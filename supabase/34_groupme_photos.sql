-- 34 — GroupMe void/comp photos. Each venue's VOID & COMP GroupMe has a bot
-- whose callback URL points at the groupme-intake Edge Function (the ?k=
-- token in that URL is the credential — same model as the mobile intake
-- links). Every photo posted lands here; a follow-up text from the same
-- sender within 10 minutes is appended to the photo's caption (the crews
-- post the picture first, then the reason).
--
-- Matching to a specific void/comp happens NIGHTLY, after the Toast pull
-- writes daily_vd_checks: same location + business day, sender's name
-- token-matches the server who rang the check, posted within ±2 hours of
-- the check opening. Exactly one candidate → auto-match (by check_guid,
-- which survives re-imports). Otherwise the photo stays in that night's
-- gallery for a one-tap manual pin on the drill-down.

create table if not exists public.groupme_sources (
  group_id    text primary key,                 -- GroupMe group id
  token       text not null,                    -- callback URL secret
  location_id uuid not null references public.locations(id) on delete cascade,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.groupme_sources enable row level security;
drop policy if exists gms_admin on public.groupme_sources;
create policy gms_admin on public.groupme_sources
  for all using (public.is_org_admin()) with check (public.is_org_admin());

-- ATL- VOID & COMP (group 106976275)
insert into public.groupme_sources (group_id, token, location_id)
select '106976275', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), id
from public.locations where code = 'ATL'
on conflict (group_id) do nothing;

create table if not exists public.groupme_photos (
  id                 uuid primary key default gen_random_uuid(),
  location_id        uuid not null references public.locations(id) on delete cascade,
  group_id           text not null,
  message_id         text not null unique,      -- GroupMe message id = idempotency key
  sender_name        text,
  posted_at          timestamptz not null,
  business_date      date not null,             -- venue-local, 5am roll (matches Toast)
  caption            text,
  image_url          text not null,             -- i.groupme.com — stable hosting
  matched_check_guid text,                      -- daily_vd_checks.check_guid (survives re-imports)
  matched_kind       text,                      -- 'void' | 'discount'
  match_status       text not null default 'unmatched',  -- 'unmatched' | 'auto' | 'manual' | 'rejected'
  created_at         timestamptz not null default now()
);
create index if not exists idx_gmp_loc_date on public.groupme_photos(location_id, business_date);

alter table public.groupme_photos enable row level security;
drop policy if exists gmp_select on public.groupme_photos;
create policy gmp_select on public.groupme_photos for select
  using (public.can_access_location(location_id));
-- manual pin/unpin from the drill-down (managers included); inserts come
-- from the Edge Function's service role only
drop policy if exists gmp_update on public.groupme_photos;
create policy gmp_update on public.groupme_photos for update
  using (public.can_access_location(location_id))
  with check (public.can_access_location(location_id));

-- ---------- nightly auto-match ----------
-- Name matching anchors on the employee's FIRST name: some token of the
-- GroupMe display name must prefix-match it, either direction
-- ("Touched By Tish" ~ "Tishaa Harris", "Kim Yung" ~ "Kimberly Dobson").
-- Surname-only matches are rejected -- family members share them.
create or replace function public.names_probably_match(p_sender text, p_employee text)
returns boolean language sql immutable as $$
  select exists (
    select 1
    from unnest(regexp_split_to_array(lower(coalesce(p_sender, '')), '[^a-z]+')) s(tok),
         lateral (select t as first from unnest(regexp_split_to_array(lower(coalesce(p_employee, '')), '[^a-z]+')) t
                  where length(t) >= 3 limit 1) f
    where length(s.tok) >= 3
      and (s.tok like f.first || '%' or f.first like s.tok || '%')
  )
$$;

create or replace function public.match_groupme_photos()
returns int language plpgsql security definer set search_path = public as $$
declare
  p record;
  v_guid text;
  v_kind text;
  v_candidates int;
  n int := 0;
begin
  -- self-regulating retro-match: attempt any unmatched photo whose night has
  -- check-level data ('rejected' photos -- manually unpinned -- are never
  -- re-attempted). Precision over recall: the check must have a known open
  -- time within 45 minutes of the photo; anything looser waits in the night
  -- gallery for a manual pin.
  for p in
    select gp.* from public.groupme_photos gp
    where gp.match_status = 'unmatched'
      and exists (
        select 1 from public.daily_vd_checks c
        where c.location_id = gp.location_id and c.business_date = gp.business_date
      )
  loop
    select count(distinct c.check_guid) into v_candidates
    from public.daily_vd_checks c
    where c.location_id = p.location_id
      and c.business_date = p.business_date
      and c.check_guid is not null
      and c.opened_at is not null
      and public.names_probably_match(p.sender_name, c.employee_name)
      and abs(extract(epoch from (c.opened_at - p.posted_at))) < 2700;
    if v_candidates = 1 then
      select c.check_guid, c.kind into v_guid, v_kind
      from public.daily_vd_checks c
      where c.location_id = p.location_id
        and c.business_date = p.business_date
        and c.check_guid is not null
        and c.opened_at is not null
        and public.names_probably_match(p.sender_name, c.employee_name)
        and abs(extract(epoch from (c.opened_at - p.posted_at))) < 2700
      order by (c.kind = 'void') desc
      limit 1;
      update public.groupme_photos
      set matched_check_guid = v_guid, matched_kind = v_kind, match_status = 'auto'
      where id = p.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

revoke execute on function public.match_groupme_photos() from anon;

-- nightly at 12:00 UTC — after the 11:00 Toast pull has written the checks
select cron.schedule('groupme-photo-match', '0 12 * * *', $$select public.match_groupme_photos()$$);
