-- 28 — Native invoice intake (INVOICE_SYSTEM reference §10.1).
-- The dashboard gets its own submit form, running in parallel with Fillout
-- until it's retired. Client inserts hit the same rules engine as the Zap:
-- the BEFORE trigger stamps the submitter and forces needs_review as the
-- starting status so nobody can hand themselves an approved invoice.
-- No Evernote hop from the native form yet (pending the owner conversation);
-- Fillout submissions keep flowing through the existing Zap unchanged.

-- ---------- trigger: stamp identity + never trust client status ----------
-- Identical to migration 24's function except the client-insert block at the
-- top. auth.uid() is null for the service role (Zapier / backfill), so those
-- paths — including imported_legacy — behave exactly as before.
create or replace function public.invoice_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_norm text;
  v_vendor public.vendors%rowtype;
  v_reasons text[] := '{}';
  v_median numeric;
  v_history int;
  v_dupes int;
begin
  new.updated_at := now();

  -- native form (any authenticated client): identity comes from the JWT and
  -- every submission starts unreviewed so the rules always run
  if auth.uid() is not null then
    new.submitted_by := auth.uid();
    new.status := 'needs_review';
  end if;

  v_norm := public.normalize_vendor_name(new.vendor_name_raw);

  -- resolve vendor via alias; auto-create the vendor for a new name
  select v.* into v_vendor
  from public.vendor_aliases a join public.vendors v on v.id = a.vendor_id
  where a.alias = v_norm;

  if v_vendor.id is null then
    insert into public.vendors (name) values (trim(new.vendor_name_raw))
    on conflict (name) do update set updated_at = now()
    returning * into v_vendor;
    insert into public.vendor_aliases (alias, vendor_id) values (v_norm, v_vendor.id)
    on conflict (alias) do nothing;
    if new.status not in ('imported_legacy') then
      v_reasons := array_append(v_reasons, 'New vendor — first invoice from "' || trim(new.vendor_name_raw) || '"');
    end if;
  end if;

  new.vendor_id := v_vendor.id;
  if new.category_id is null then
    new.category_id := v_vendor.default_category_id;
  end if;

  -- legacy imports keep their given status; no rules
  if new.status = 'imported_legacy' or new.status in ('approved', 'declined') then
    return new;
  end if;

  -- rule 3: possible duplicate (highest severity)
  select count(*) into v_dupes
  from public.invoices i
  where i.vendor_id = new.vendor_id
    and (
      (i.amount = new.amount
       and abs(i.invoice_date - new.invoice_date) <= public.invoice_cfg('duplicate_window_days'))
      or (new.invoice_number is not null and i.invoice_number = new.invoice_number)
    );
  if v_dupes > 0 then
    v_reasons := array_append(v_reasons,
      'Possible duplicate — same vendor with matching amount within ' ||
      public.invoice_cfg('duplicate_window_days')::int || ' days or same invoice #');
  end if;

  -- rule 2: vendor baseline (median, not mean; $ floor; needs history)
  select count(*), percentile_cont(0.5) within group (order by i.amount)
    into v_history, v_median
  from public.invoices i
  where i.vendor_id = new.vendor_id
    and i.status in ('auto_approved', 'approved', 'imported_legacy')
    and i.invoice_date >= new.invoice_date - (public.invoice_cfg('baseline_lookback_days')::int);
  if v_history >= public.invoice_cfg('baseline_min_history')
     and new.amount >= public.invoice_cfg('baseline_min_amount')
     and v_median > 0
     and new.amount > v_median * public.invoice_cfg('baseline_multiplier') then
    v_reasons := array_append(v_reasons,
      'Amount $' || to_char(new.amount, 'FM999,999,990.00') || ' is ' ||
      round(new.amount / v_median, 1) || '× this vendor''s ' ||
      public.invoice_cfg('baseline_lookback_days')::int || '-day median ($' ||
      to_char(v_median, 'FM999,999,990.00') || ')');
  end if;

  -- rule 4: recurring variance
  if v_vendor.is_recurring and v_vendor.expected_amount is not null and v_vendor.expected_amount > 0 then
    if abs(new.amount - v_vendor.expected_amount) / v_vendor.expected_amount * 100
       > public.invoice_cfg('recurring_variance_pct') then
      v_reasons := array_append(v_reasons,
        'Recurring bill off by ' ||
        round(abs(new.amount - v_vendor.expected_amount) / v_vendor.expected_amount * 100) ||
        '% (expected $' || to_char(v_vendor.expected_amount, 'FM999,999,990.00') || ')');
    end if;
  end if;

  if array_length(v_reasons, 1) is null then
    new.status := 'auto_approved';
    new.flag_reasons := null;
  else
    new.status := 'needs_review';
    new.flag_reasons := v_reasons;
    insert into public.exception_flags
      (location_id, occurred_at, server_name, rule_tripped, amount, severity, status, source, notes)
    values
      (new.location_id, new.submitted_at, v_vendor.name,
       'Invoice flagged: ' || array_to_string(v_reasons, ' · '),
       new.amount,
       (case when v_dupes > 0 then 'high' else 'med' end)::exception_severity,
       'open'::exception_status, 'rule',
       'Invoice ' || coalesce(new.invoice_number, '(no number)') || ' · submission ' || new.submission_id);
  end if;

  return new;
end $$;

-- ---------- RLS: let location users submit ----------
-- WITH CHECK runs on the row AFTER the BEFORE trigger, which has already
-- stamped submitted_by = auth.uid(), so the identity check can't fail for an
-- honest client and can't be spoofed by a dishonest one.
drop policy if exists inv_insert on public.invoices;
create policy inv_insert on public.invoices for insert to authenticated
  with check (public.can_access_location(location_id) and submitted_by = auth.uid());

-- ---------- storage: invoice photos / PDFs ----------
-- Public bucket (same trust model as the Fillout file URLs already stored on
-- 1,200+ rows). Authenticated users can upload; nobody can overwrite or
-- delete from the client (no update/delete policies).
insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', true)
on conflict (id) do nothing;

drop policy if exists "invoice uploads" on storage.objects;
create policy "invoice uploads" on storage.objects for insert to authenticated
  with check (bucket_id = 'invoices');
