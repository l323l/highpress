-- 하루 이용 인원 (A-6 보탬): 날짜(한국 시간)마다 앱을 연 로그인 사용자 수를 운영 현황에 보여 준다.
-- 0001 ~ 0011 을 실행한 프로젝트에 이어서 한 번 실행한다. 여러 번 실행해도 같은 결과가 되게 썼다.
-- 누가 접속했는지는 남기지 않는다. 그날 처음 접속 시각이 찍힐 때 그날의 숫자만 1 올린다.
-- 로그인하지 않은 방문자는 세지 않는다 (서버에 아무것도 보내지 않기 때문이다).

-- ── 날짜별 인원 ──────────────────────────────────────────────────────────
-- 아래 함수들만 읽고 쓴다. 사용자는 이 표를 직접 읽지 못한다.
create table if not exists public.daily_active (
  day date primary key,
  users integer not null default 0 check (users >= 0)
);
alter table public.daily_active enable row level security;
revoke all on public.daily_active from public, anon, authenticated;

-- ── 접속 시각 (0003_feed.sql 의 함수를 고친다) ───────────────────────────
-- 앱을 열어 둔 동안 몇 분마다 부른다. 직전 접속이 오늘(한국 시간)보다 앞이면 오늘의 인원을 1 올린다.
-- 같은 사람이 동시에 불러도 두 번 세지 않도록 프로필 행을 잠그고 직전 값을 읽는다.
create or replace function public.touch_presence() returns void
language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Asia/Seoul')::date;
  prev timestamptz;
begin
  select last_seen_at into prev from public.profiles where user_id = auth.uid() for update;
  if not found then
    return;
  end if;
  update public.profiles set last_seen_at = now() where user_id = auth.uid();
  if prev is null or (prev at time zone 'Asia/Seoul')::date < today then
    insert into public.daily_active (day, users) values (today, 1)
    on conflict (day) do update set users = public.daily_active.users + 1;
  end if;
end;
$$;
revoke execute on function public.touch_presence() from public, anon;
grant execute on function public.touch_presence() to authenticated;

-- ── 운영자용 조회 ────────────────────────────────────────────────────────
-- 오늘부터 거슬러 p_days 일(1 ~ 90)의 인원을 최근 날짜부터 돌려준다. 숫자만 있다.
-- since: 처음 센 날. 그 앞의 날은 세지 않은 것이지 0명이 아니다.
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
    'since', (select min(a.day) from public.daily_active a),
    'days', (
      select jsonb_agg(jsonb_build_object('day', today - g, 'users', coalesce(a.users, 0)) order by g)
      from generate_series(0, n - 1) g
      left join public.daily_active a on a.day = today - g
    )
  );
end;
$$;
revoke execute on function public.admin_daily_active(integer) from public, anon;
grant execute on function public.admin_daily_active(integer) to authenticated;
