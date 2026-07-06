-- 37 — @-mention tagging in comment threads + in-app notifications.
--
-- Comments/notes carry a `mentions uuid[]` (profile ids the author tagged).
-- An AFTER INSERT trigger fans each mention out into `notifications`, which
-- the header bell polls; `ref` holds what the frontend needs to deep-link
-- back to the thread (invoice id, or the void/discount check identity).
-- `list_org_users()` powers the @ autocomplete: profiles are only
-- self-readable for managers, so the roster comes via security definer.

alter table public.invoice_comments
  add column if not exists mentions uuid[] not null default '{}';
alter table public.void_discount_notes
  add column if not exists mentions uuid[] not null default '{}';

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  actor_name  text,
  kind        text not null check (kind in ('invoice_comment', 'vd_note')),
  ref         jsonb not null default '{}'::jsonb,
  preview     text,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index if not exists idx_notif_user on public.notifications(user_id, created_at desc);

alter table public.notifications enable row level security;
drop policy if exists notif_select on public.notifications;
create policy notif_select on public.notifications for select
  using (user_id = (select auth.uid()));
drop policy if exists notif_update on public.notifications;
create policy notif_update on public.notifications for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
-- no insert policy: rows are written by the trigger below (security definer)

create or replace function public.notify_mentions()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
begin
  if new.mentions is null or array_length(new.mentions, 1) is null then
    return new;
  end if;
  foreach uid in array new.mentions loop
    if uid is distinct from new.author_id
       and exists (select 1 from public.profiles p where p.id = uid) then
      if tg_table_name = 'invoice_comments' then
        insert into public.notifications (user_id, actor_name, kind, ref, preview)
        values (uid, new.author_name, 'invoice_comment',
                jsonb_build_object('invoice_id', new.invoice_id),
                left(new.comment, 140));
      else
        insert into public.notifications (user_id, actor_name, kind, ref, preview)
        values (uid, new.author_name, 'vd_note',
                jsonb_build_object(
                  'location_id', new.location_id,
                  'business_date', new.business_date,
                  'kind', new.kind,
                  'employee_key', new.employee_key,
                  'check_guid', new.check_guid),
                left(new.note, 140));
      end if;
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists trg_ic_notify_mentions on public.invoice_comments;
create trigger trg_ic_notify_mentions
  after insert on public.invoice_comments
  for each row execute function public.notify_mentions();

drop trigger if exists trg_vdn_notify_mentions on public.void_discount_notes;
create trigger trg_vdn_notify_mentions
  after insert on public.void_discount_notes
  for each row execute function public.notify_mentions();

-- Roster for the @ autocomplete — any signed-in team member can see names.
create or replace function public.list_org_users()
returns table (id uuid, full_name text, email text, role text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.email, p.role::text
  from public.profiles p
  order by coalesce(p.full_name, p.email)
$$;
revoke all on function public.list_org_users() from public, anon;
grant execute on function public.list_org_users() to authenticated;
