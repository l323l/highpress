-- 축구 칼럼 앱 서버 구조 (M6·M7)
-- 원칙: 기기 저장소가 원본이고 서버에는 작성 중 초안의 글 사본만 둔다. 사진·영상·GIF는 올리지 않는다 (SB-5).
-- 모든 테이블에 RLS를 켠다 (SEC-1). 정책이 없는 테이블은 서버 함수(service_role)만 읽고 쓴다 (SEC-4).

-- ── 운영 설정 ────────────────────────────────────────────────────────────
create table public.app_config (
  key text primary key,
  value jsonb not null
);
alter table public.app_config enable row level security;

-- 누구나 가입할 수 있되, 무료 한도를 넘지 않도록 가입자 수에 상한을 둔다 (A-7).
-- 늘리려면: update public.app_config set value = '100' where key = 'max_users';
insert into public.app_config (key, value) values ('max_users', '50');

-- ── 프로필 ───────────────────────────────────────────────────────────────
-- 약관에 동의한 사용자만 행이 생긴다 (A-5). 수집 정보는 닉네임뿐이다 (SEC-10).
create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  nickname text not null default '' check (char_length(nickname) <= 30),
  agreed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profiles: 본인만 조회" on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "profiles: 본인만 생성" on public.profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "profiles: 본인만 수정" on public.profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- 동의 시각과 가입일은 서버가 정한다. 사용자는 닉네임만 고칠 수 있다.
revoke insert, update on public.profiles from authenticated;
grant insert (nickname) on public.profiles to authenticated;
grant update (nickname) on public.profiles to authenticated;

create function public.enforce_user_cap() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  cap int;
  total int;
begin
  select (value #>> '{}')::int into cap from public.app_config where key = 'max_users';
  select count(*) into total from public.profiles;
  if cap is not null and total >= cap then
    raise exception 'signup_closed' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger profiles_user_cap before insert on public.profiles
for each row execute function public.enforce_user_cap();

-- ── 초안 ─────────────────────────────────────────────────────────────────
-- id는 기기의 칼럼 id와 같다. 본문은 Tiptap JSON이고 사진 자리는 mediaId만 남는다.
create table public.drafts (
  user_id uuid not null default auth.uid() references public.profiles (user_id) on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  title text not null default '' check (char_length(title) <= 200),
  -- 초안 하나의 본문은 1MB까지 (SB-6)
  body jsonb not null check (octet_length(body::text) <= 1048576),
  -- 기기에서 마지막으로 고친 시각(ms). 어느 쪽이 최신인지 가릴 때 쓴다.
  client_updated_at bigint not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.drafts enable row level security;

create policy "drafts: 본인만 조회" on public.drafts for select to authenticated using ((select auth.uid()) = user_id);
create policy "drafts: 본인만 생성" on public.drafts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "drafts: 본인만 수정" on public.drafts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "drafts: 본인만 삭제" on public.drafts for delete to authenticated using ((select auth.uid()) = user_id);

-- 사용자당 초안 3개까지 (SB-6). 앱 화면이 아니라 여기서 강제한다 (SEC-5).
create function public.enforce_draft_quota() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- 이미 있는 초안을 덮어쓰는 경우(upsert)는 세지 않는다.
  if (select count(*) from public.drafts where user_id = new.user_id and id <> new.id) >= 3 then
    raise exception 'draft_quota' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger drafts_quota before insert on public.drafts
for each row execute function public.enforce_draft_quota();

create function public.touch_draft() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger drafts_touch before update on public.drafts
for each row execute function public.touch_draft();

-- ── 스탯 캐시·예산·사용량 (서버 함수 전용) ───────────────────────────────
create table public.stat_cache (
  key text primary key,
  body jsonb not null,
  saved_at timestamptz not null default now()
);
alter table public.stat_cache enable row level security;

create table public.api_budget (
  provider text not null,
  day date not null,
  used int not null default 0,
  primary key (provider, day)
);
alter table public.api_budget enable row level security;

create table public.user_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  stat_calls int not null default 0,
  primary key (user_id, day)
);
alter table public.user_usage enable row level security;

-- 사용자는 자신의 오늘 사용량만 볼 수 있다 (A-4). 쓰기는 서버 함수만 한다.
create policy "user_usage: 본인만 조회" on public.user_usage for select to authenticated using ((select auth.uid()) = user_id);

-- 한도 안이면 1 올리고 true, 넘었으면 그대로 두고 false. 동시에 여러 요청이 와도 한도를 넘지 않는다.
create function public.bump_api_budget(p_provider text, p_limit int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'utc')::date;
  bumped int;
begin
  insert into public.api_budget (provider, day, used) values (p_provider, today, 0) on conflict do nothing;
  update public.api_budget set used = used + 1 where provider = p_provider and day = today and used < p_limit returning used into bumped;
  return bumped is not null;
end;
$$;

create function public.bump_user_usage(p_user uuid, p_limit int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'utc')::date;
  bumped int;
begin
  insert into public.user_usage (user_id, day, stat_calls) values (p_user, today, 0) on conflict do nothing;
  update public.user_usage set stat_calls = stat_calls + 1 where user_id = p_user and day = today and stat_calls < p_limit returning stat_calls into bumped;
  return bumped is not null;
end;
$$;

revoke execute on function public.bump_api_budget(text, int) from public, anon, authenticated;
revoke execute on function public.bump_user_usage(uuid, int) from public, anon, authenticated;
grant execute on function public.bump_api_budget(text, int) to service_role;
grant execute on function public.bump_user_usage(uuid, int) to service_role;

-- ── 회원 탈퇴 (A-3) ──────────────────────────────────────────────────────
-- 계정을 지우면 프로필·초안·사용량이 함께 지워진다 (on delete cascade).
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ── 정기 정리 (SB-4, SB-7) ───────────────────────────────────────────────
-- 7일간 고치지 않은 초안의 서버 사본, 오래된 사용량·예산 기록, 30일 넘은 이번 시즌 캐시를 지운다.
-- pg_cron을 켤 수 없는 환경에서는 이 블록만 건너뛴다 (그때는 README의 수동 정리 문장을 쓴다).
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule(
    'football-column-cleanup',
    '17 3 * * *',
    $job$
      delete from public.drafts where updated_at < now() - interval '7 days';
      delete from public.user_usage where day < current_date - 30;
      delete from public.api_budget where day < current_date - 30;
      delete from public.stat_cache where key like 'current-%' and saved_at < now() - interval '30 days';
    $job$
  );
exception when others then
  raise notice 'pg_cron을 설정하지 못했습니다: %', sqlerrm;
end;
$$;
