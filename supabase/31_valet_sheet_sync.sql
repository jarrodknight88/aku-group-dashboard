-- 31 — Valet sheet sync. The live valet source is a per-location Google
-- Sheet ("REVENUE BREAKDOWN" weekly blocks): daily rows carry
-- Date, Cashapp, Cash, Clover, TOTAL, # of Workers, Workers Pay, then the
-- expense columns (BPD, Mike, Tickets, C/card fees, Other), TOTAL EXPENSE
-- and TERANGA (net). Week-level expenses appear only on the block's TOTAL
-- row; the sync attributes the surplus to the block's last recorded night
-- so calendar-month totals stay correct. Zero placeholder rows (future
-- dates pre-filled in the sheet) are skipped. Re-running is idempotent:
-- each night is fully rewritten from the sheet before extras are re-added.
--
-- Sheets are link-readable; the database fetches the CSV export directly
-- (http extension), so there are no credentials to manage. Add a location:
-- insert a row into valet_sheet_sources. Nightly cron + an admin "Sync
-- now" RPC from the Financials valet section.

create extension if not exists http with schema extensions;

create table if not exists public.valet_sheet_sources (
  location_id    uuid primary key references public.locations(id) on delete cascade,
  sheet_id       text not null,      -- docs.google.com/spreadsheets/d/<sheet_id>
  gid            text,               -- tab id; null = the default tab
  active         boolean not null default true,
  last_synced_at timestamptz,
  last_result    text,
  created_at     timestamptz not null default now()
);
alter table public.valet_sheet_sources enable row level security;
drop policy if exists vss_admin on public.valet_sheet_sources;
create policy vss_admin on public.valet_sheet_sources
  for all using (public.is_org_admin()) with check (public.is_org_admin());

-- Teranga ATL's sheet (single tab). Other venues get rows as their sheets exist.
insert into public.valet_sheet_sources (location_id, sheet_id)
select id, '10M-AFYBCFWBHP1ffxcax2Wy2H0Zm3pqXLPlEf9W_rko'
from public.locations where code = 'ATL'
on conflict (location_id) do nothing;

-- forgiving money parser: "$ 1,234.50" → 1234.50, "", "$ -", junk → 0
create or replace function public.valet_num(p text)
returns numeric language sql immutable as $$
  select case
    when regexp_replace(coalesce(p, ''), '[^0-9.\-]', '', 'g') ~ '^-?[0-9]+\.?[0-9]*$'
    then regexp_replace(coalesce(p, ''), '[^0-9.\-]', '', 'g')::numeric
    else 0
  end
$$;

create or replace function public.sync_valet_sheets()
returns table (location_code text, nights int)
language plpgsql security definer set search_path = public, extensions as $$
declare
  src record;
  resp record;
  ln text;
  cols text[];
  d date;
  ypart text;
  v_app numeric; v_cash numeric; v_clover numeric; v_total numeric;
  v_workers numeric; v_other numeric; v_net numeric;
  blk_last date;            -- last recorded night in the current weekly block
  blk_other numeric := 0;   -- daily-level "other" already counted in the block
  wk_extra numeric;
  n int;
begin
  -- cron runs with no JWT (auth.uid() is null); logged-in callers must be admins
  if auth.uid() is not null and not public.is_org_admin() then
    raise exception 'only admins can run the valet sheet sync';
  end if;

  for src in
    select s.location_id, s.sheet_id, s.gid, lower(l.code) as code
    from public.valet_sheet_sources s
    join public.locations l on l.id = s.location_id
    where s.active
  loop
    n := 0;
    blk_last := null;
    blk_other := 0;
    begin
      select * into resp from extensions.http_get(
        'https://docs.google.com/spreadsheets/d/' || src.sheet_id || '/export?format=csv'
        || coalesce('&gid=' || src.gid, ''));
    exception when others then
      update public.valet_sheet_sources set last_synced_at = now(), last_result = 'fetch failed: ' || sqlerrm
        where location_id = src.location_id;
      continue;
    end;
    if resp.status <> 200 then
      update public.valet_sheet_sources set last_synced_at = now(), last_result = 'HTTP ' || resp.status
        where location_id = src.location_id;
      continue;
    end if;

    foreach ln in array regexp_split_to_array(resp.content, E'\r?\n') loop
      cols := string_to_array(ln, ',');
      if coalesce(array_length(cols, 1), 0) < 14 then continue; end if;

      if trim(cols[1]) ~ '^\d{1,2}/\d{1,2}/\d{2,4}$' then
        ypart := split_part(trim(cols[1]), '/', 3);
        d := to_date(trim(cols[1]), case when length(ypart) = 4 then 'FMMM/FMDD/YYYY' else 'FMMM/FMDD/YY' end);
        v_app     := public.valet_num(cols[2]);
        v_cash    := public.valet_num(cols[3]);
        v_clover  := public.valet_num(cols[4]);
        v_total   := public.valet_num(cols[5]);
        v_workers := public.valet_num(cols[7]);
        v_other   := public.valet_num(cols[8]) + public.valet_num(cols[9]) + public.valet_num(cols[10])
                   + public.valet_num(cols[11]) + public.valet_num(cols[12]);
        v_net     := public.valet_num(cols[14]);
        -- pre-filled future rows are all zeros — not a night, skip
        if v_total = 0 and v_workers = 0 and v_other = 0 then continue; end if;

        insert into public.valet_days
          (location_id, business_date, cash, cashapp, clover, total_revenue, workers_paid, other_expenses, net, notes, source)
        values
          (src.location_id, d, v_cash, v_app, v_clover, v_total, v_workers, v_other, v_net,
           nullif(trim(cols[6]), '') || ' workers', 'sheet_sync')
        on conflict (location_id, business_date) do update set
          cash = excluded.cash, cashapp = excluded.cashapp, clover = excluded.clover,
          total_revenue = excluded.total_revenue, workers_paid = excluded.workers_paid,
          other_expenses = excluded.other_expenses, net = excluded.net,
          notes = excluded.notes, source = 'sheet_sync', updated_at = now();
        n := n + 1;
        blk_last := d;
        blk_other := blk_other + v_other;

      elsif trim(cols[1]) = 'TOTAL' then
        -- week-level expenses (Mike, tickets, card fees…) live only on this
        -- row; put the surplus on the block's last night so months add up
        wk_extra := public.valet_num(cols[8]) + public.valet_num(cols[9]) + public.valet_num(cols[10])
                  + public.valet_num(cols[11]) + public.valet_num(cols[12]) - blk_other;
        if wk_extra > 0.005 and blk_last is not null then
          update public.valet_days
          set other_expenses = other_expenses + wk_extra,
              net = total_revenue - workers_paid - (other_expenses + wk_extra),
              updated_at = now()
          where location_id = src.location_id and business_date = blk_last;
        end if;
        blk_last := null;
        blk_other := 0;
      end if;
    end loop;

    update public.valet_sheet_sources
    set last_synced_at = now(), last_result = n || ' nights'
    where location_id = src.location_id;
    location_code := src.code;
    nights := n;
    return next;
  end loop;
end $$;

revoke execute on function public.sync_valet_sheets() from anon;

-- nightly, 11:30 UTC — right after the 11:00 Toast pull
select cron.schedule('valet-sheet-sync', '30 11 * * *', $$select public.sync_valet_sheets()$$);
