-- 01_extensions_enums.sql
-- Extensions + enum types. Idempotent.

create extension if not exists pgcrypto;   -- gen_random_uuid()

do $$ begin
  create type app_role as enum ('owner','admin','general_manager','manager');
exception when duplicate_object then null; end $$;

do $$ begin
  create type location_status as enum ('active','coming_soon','inactive');
exception when duplicate_object then null; end $$;

do $$ begin
  create type snapshot_scope as enum ('org','location');
exception when duplicate_object then null; end $$;

do $$ begin
  create type kpi_metric as enum
    ('void_pct','discount_pct','food_pct','labor_pct','liquor_pct');
exception when duplicate_object then null; end $$;

do $$ begin
  create type chargeback_stage as enum ('in_progress','won','lost');
exception when duplicate_object then null; end $$;

do $$ begin
  create type exception_severity as enum ('high','med','low');
exception when duplicate_object then null; end $$;

do $$ begin
  create type exception_status as enum ('open','cleared');
exception when duplicate_object then null; end $$;

do $$ begin
  create type exception_source as enum ('manual','csv','rule');
exception when duplicate_object then null; end $$;
