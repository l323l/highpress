-- 운영 준비 (M9): 운영자 지정, 사용량 조회, 무료 한도 80% 도달 시 자동 제한 (A-6, A-7, SB-10)
-- 0001_init.sql 을 실행한 프로젝트에 이어서 한 번 실행한다. 여러 번 실행해도 같은 결과가 되게 썼다.

-- ── 운영 설정값 ──────────────────────────────────────────────────────────
-- admin_emails: 운영자 화면을 볼 수 있는 Google 계정 이메일 목록 (소문자).
--   지정: update public.app_config set value = '["me@example.com"]' where key = 'admin_emails';
-- db_limit_mb: DB가 이 크기에 닿으면 신규 가입과 새 초안 올리기를 멈춘다 (무료 500MB의 80%).
-- edge_month_limit: 서버 함수 호출이 한 달에 이만큼 되면 스탯을 캐시 전용으로 바꾼다 (무료 50만 회의 80%).
insert into public.app_config (key, value) values
  ('admin_emails', '[]'),
  ('db_limit_mb', '400'),
  ('edge_month_limit', '400000')
on conflict (key) do nothing;

create or replace function public.config_int(p_key text) returns bigint
language sql stable security definer set search_path = '' as $$
  select (value #>> '{}')::bigint from public.app_config where key = p_key;
$$;
revoke execute on function public.config_int(text) from public, anon, authenticated;

-- 로그인한 사용자의 이메일이 운영자 목록에 있는지. 이메일은 Google이 확인해 준 값이다.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select value ? lower(coalesce(auth.jwt() ->> 'email', '')) from public.app_config where key = 'admin_emails'),
    false
  );
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.db_full() returns boolean
language sql stable security definer set search_path = '' as $$
  select pg_database_size(current_database()) >= coalesce(public.config_int('db_limit_mb'), 400) * 1024 * 1024;
$$;
revoke execute on function public.db_full() from public, anon, authenticated;

-- ── 한도에 닿으면 새로 받는 것만 멈춘다 (SB-10) ──────────────────────────
-- 이미 가입한 사용자의 글쓰기와 기존 초안 고치기는 계속된다.
create or replace function public.enforce_user_cap() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  cap bigint := public.config_int('max_users');
begin
  if public.db_full() or (cap is not null and (select count(*) from public.profiles) >= cap) then
    raise exception 'signup_closed' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_draft_quota() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- 이미 있는 초안을 덮어쓰는 경우(upsert)는 막지 않는다.
  if exists (select 1 from public.drafts where user_id = new.user_id and id = new.id) then
    return new;
  end if;
  if public.db_full() then
    raise exception 'server_full' using errcode = 'P0001';
  end if;
  if (select count(*) from public.drafts where user_id = new.user_id) >= 3 then
    raise exception 'draft_quota' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- ── 서버 함수 월간 호출 수 ───────────────────────────────────────────────
-- api_budget 에 provider 'edge', day = 그달 1일 로 한 줄을 둔다.
-- 한도 안이면 1 올리고 true, 넘었으면 false (이때 스탯 서버는 캐시된 데이터만 준다).
create or replace function public.bump_edge_month(p_limit int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  month_start date := date_trunc('month', now() at time zone 'utc')::date;
  bumped int;
begin
  insert into public.api_budget (provider, day, used) values ('edge', month_start, 0) on conflict do nothing;
  update public.api_budget set used = used + 1 where provider = 'edge' and day = month_start and used < p_limit returning used into bumped;
  return bumped is not null;
end;
$$;
revoke execute on function public.bump_edge_month(int) from public, anon, authenticated;
grant execute on function public.bump_edge_month(int) to service_role;

-- ── 운영자용 사용량 (A-6) ────────────────────────────────────────────────
-- 숫자만 돌려준다. 사용자의 글이나 이메일은 포함하지 않는다.
create or replace function public.admin_usage() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'utc')::date;
  month_start date := date_trunc('month', now() at time zone 'utc')::date;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'max_users', public.config_int('max_users'),
    'drafts', (select count(*) from public.drafts),
    'db_bytes', pg_database_size(current_database()),
    'db_limit_bytes', coalesce(public.config_int('db_limit_mb'), 400) * 1024 * 1024,
    'edge_calls_month', coalesce((select used from public.api_budget where provider = 'edge' and day = month_start), 0),
    'edge_month_limit', coalesce(public.config_int('edge_month_limit'), 400000),
    'past_api_today', coalesce((select used from public.api_budget where provider = 'api-football' and day = today), 0),
    'stat_calls_today', coalesce((select sum(stat_calls) from public.user_usage where day = today), 0),
    'cache_rows', (select count(*) from public.stat_cache)
  );
end;
$$;
revoke execute on function public.admin_usage() from public, anon;
grant execute on function public.admin_usage() to authenticated;
