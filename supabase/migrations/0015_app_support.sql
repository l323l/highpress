-- 앱을 위한 서버 변경 (A1-5 · A1-6, APP-PRD 8.2): 방문 출처(웹 · 앱) 나눠 세기, 가입자 상한 100명, 네이버 로그인 빈도 제한.
-- 0001 ~ 0014 를 실행한 프로젝트에 이어서 한 번 실행한다. 여러 번 실행해도 같은 결과가 되게 썼다.
-- 지금 웹의 count_visit() 호출(인자 없음)은 그대로 동작한다 (출처를 'web' 으로 센다).

-- ── 날짜별 숫자에 출처 칸을 더한다 ───────────────────────────────────────
-- visitors 는 그대로 합계다. web · app 은 이 파일을 넣은 날부터 센다 (그 앞의 날은 0 이지만 세지 않은 것이다).
alter table public.daily_active add column if not exists web integer not null default 0 check (web >= 0);
alter table public.daily_active add column if not exists app integer not null default 0 check (app >= 0);

-- ── 방문 세기: 출처를 받는다 ─────────────────────────────────────────────
-- 0013 의 count_visit() 를 지우고 인자 하나(기본값 'web')짜리로 바꾼다. 둘을 함께 두면 인자 없는 호출이 어느 것인지 몰라 오류가 난다.
-- 웹은 지금처럼 인자 없이(또는 'web'), 앱은 'app' 으로 부른다. 그 밖의 값은 bad_source.
drop function if exists public.count_visit();
create or replace function public.count_visit(p_source text default 'web') returns date
language plpgsql volatile security definer set search_path = '' as $$
declare
  src text := coalesce(p_source, 'web');
  counted date;
begin
  if src not in ('web', 'app') then
    raise exception 'bad_source' using errcode = 'P0001';
  end if;
  insert into public.daily_active as a (day, visitors, web, app)
  values ((now() at time zone 'Asia/Seoul')::date, 1, (src = 'web')::int, (src = 'app')::int)
  on conflict (day) do update
    set visitors = a.visitors + 1,
        web = a.web + excluded.web,
        app = a.app + excluded.app
  returning a.day into counted;
  return counted;
end;
$$;
revoke execute on function public.count_visit(text) from public;
grant execute on function public.count_visit(text) to anon, authenticated;

-- ── 운영자용 조회 (0013 의 함수를 고친다) ────────────────────────────────
-- 날짜마다 visitors(합계) · users(로그인한 사람) 에 web · app 을 더한다. 기존 칸은 그대로다.
-- sources_since: 출처를 나눠 처음 센 날. 그 앞의 날은 web · app 이 0 이어도 세지 않은 것이다.
create or replace function public.admin_daily_active(p_days integer default 14) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Asia/Seoul')::date;
  n integer := least(greatest(coalesce(p_days, 14), 1), 90);
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'today', today,
    'since', (select min(a.day) from public.daily_active a where a.users > 0),
    'visitors_since', (select min(a.day) from public.daily_active a where a.visitors > 0),
    'sources_since', (select min(a.day) from public.daily_active a where a.web > 0 or a.app > 0),
    'days', (
      select jsonb_agg(jsonb_build_object(
        'day', today - g,
        'users', coalesce(a.users, 0),
        'visitors', coalesce(a.visitors, 0),
        'web', coalesce(a.web, 0),
        'app', coalesce(a.app, 0)
      ) order by g)
      from generate_series(0, n - 1) g
      left join public.daily_active a on a.day = today - g
    )
  );
end;
$$;
revoke execute on function public.admin_daily_active(integer) from public, anon;
grant execute on function public.admin_daily_active(integer) to authenticated;

-- ── 가입자 상한 50 → 100명 (D12) ─────────────────────────────────────────
-- 운영자가 이미 100명 넘게 올려 두었으면 줄이지 않는다.
update public.app_config set value = '100'
where key = 'max_users' and coalesce((value #>> '{}')::int, 0) < 100;

-- ── 서버 함수의 빈도 제한 (서버 전용) ────────────────────────────────────
-- 키(예: 'naver-login:<IP 해시>')마다 정해진 시간 창 안의 횟수를 센다. IP 자체는 적지 않는다 (함수가 해시로 바꿔 보낸다).
-- 사용자는 이 표와 함수에 닿지 못한다. 서버 함수(service_role)만 부른다.
create table if not exists public.rate_limits (
  key text primary key check (char_length(key) between 1 and 200),
  window_start timestamptz not null default now(),
  hits integer not null default 0 check (hits >= 0)
);
alter table public.rate_limits enable row level security;
create index if not exists rate_limits_window on public.rate_limits (window_start);
revoke all on public.rate_limits from public, anon, authenticated;

-- 한도 안이면 1 올리고 true, 넘었으면 false. 창(p_window_seconds)이 지나면 다시 1부터 센다.
-- 하루 넘게 쓰지 않은 키는 부를 때마다 조금씩 치운다 (따로 예약 작업을 두지 않는다).
create or replace function public.bump_rate(p_key text, p_limit int, p_window_seconds int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  span interval := make_interval(secs => greatest(coalesce(p_window_seconds, 60), 1));
  counted int;
begin
  if p_key is null or p_key = '' or coalesce(p_limit, 0) < 1 then
    return false;
  end if;
  insert into public.rate_limits as r (key, window_start, hits) values (p_key, now(), 1)
  on conflict (key) do update
    set window_start = case when r.window_start <= now() - span then now() else r.window_start end,
        hits = case when r.window_start <= now() - span then 1 else least(r.hits + 1, p_limit + 1) end
  returning hits into counted;
  delete from public.rate_limits
  where key in (select x.key from public.rate_limits x where x.window_start < now() - interval '1 day' limit 50);
  return counted <= p_limit;
end;
$$;
revoke execute on function public.bump_rate(text, int, int) from public, anon, authenticated;
grant execute on function public.bump_rate(text, int, int) to service_role;
