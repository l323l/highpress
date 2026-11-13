-- 하루 방문자 (A-6 보탬): 로그인하지 않은 사람까지, 그날(한국 시간) 앱을 연 브라우저 수를 운영 현황에 보여 준다.
-- 0012_daily_active.sql 을 실행한 프로젝트에 이어서 한 번 실행한다. 여러 번 실행해도 같은 결과가 되게 썼다.
-- 서버에는 날짜별 숫자만 있다. 앱은 방문자를 알아볼 값을 보내지 않고, 브라우저에 "오늘 셌다"는 날짜만 적어 두어
-- 같은 브라우저를 하루에 한 번만 센다. 그래서 브라우저를 바꾸거나 저장 공간을 지우면 다시 세고, 일부러 여러 번 부르면 숫자가 부풀 수 있다.

-- ── 날짜별 숫자에 방문자 칸을 더한다 ─────────────────────────────────────
-- 0012 가 만든 표. 혹시 빠졌어도 이 파일만으로 돌도록 다시 적어 둔다 (이미 있으면 그대로 둔다).
create table if not exists public.daily_active (
  day date primary key,
  users integer not null default 0 check (users >= 0)
);
alter table public.daily_active enable row level security;
revoke all on public.daily_active from public, anon, authenticated;
alter table public.daily_active add column if not exists visitors integer not null default 0 check (visitors >= 0);

-- ── 방문 세기 ────────────────────────────────────────────────────────────
-- 누구나(로그인하지 않아도) 부른다. 오늘의 방문자를 1 올리고 센 날짜를 돌려준다.
-- 앱은 돌려받은 날짜를 적어 두고, 날짜가 바뀌기 전에는 다시 부르지 않는다.
create or replace function public.count_visit() returns date
language sql volatile security definer set search_path = '' as $$
  insert into public.daily_active as a (day, visitors) values ((now() at time zone 'Asia/Seoul')::date, 1)
  on conflict (day) do update set visitors = a.visitors + 1
  returning a.day;
$$;
revoke execute on function public.count_visit() from public;
grant execute on function public.count_visit() to anon, authenticated;

-- ── 운영자용 조회 (0012 의 함수를 고친다) ────────────────────────────────
-- 날짜마다 방문자(visitors)와 그중 로그인한 사람(users)을 돌려준다.
-- since: 로그인한 사람을 처음 센 날, visitors_since: 방문자를 처음 센 날. 그 앞의 날은 세지 않은 것이지 0명이 아니다.
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
    'days', (
      select jsonb_agg(jsonb_build_object('day', today - g, 'users', coalesce(a.users, 0), 'visitors', coalesce(a.visitors, 0)) order by g)
      from generate_series(0, n - 1) g
      left join public.daily_active a on a.day = today - g
    )
  );
end;
$$;
revoke execute on function public.admin_daily_active(integer) from public, anon;
grant execute on function public.admin_daily_active(integer) to authenticated;
