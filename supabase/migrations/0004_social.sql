-- 구단 태그 · 프로필 · 팔로우 (M12)
-- 0001 ~ 0003 을 실행한 프로젝트에 이어서 한 번 실행한다. 여러 번 실행해도 같은 결과가 되게 썼다.
-- 원칙은 그대로다: 가입자끼리만 본다. 로그인하지 않은 사람에게는 아무것도 보이지 않는다.

-- ── 글의 구단 태그 ───────────────────────────────────────────────────────
-- 값은 앱의 구단 목록(src/lib/clubs.ts)의 id. 목록이 바뀌어도 서버를 고치지 않도록 모양만 검사한다.
alter table public.posts add column if not exists club text check (club is null or club ~ '^[a-z0-9]{2,8}$');
create index if not exists posts_club on public.posts (club, created_at desc);
create index if not exists posts_user on public.posts (user_id, created_at desc);

grant insert (club) on public.posts to authenticated;
grant update (club) on public.posts to authenticated;

-- ── 프로필: 한 줄 소개와 응원 구단 ───────────────────────────────────────
alter table public.profiles add column if not exists bio text not null default '' check (char_length(bio) <= 80);
alter table public.profiles add column if not exists club text check (club is null or club ~ '^[a-z0-9]{2,8}$');

grant select (bio, club) on public.profiles to authenticated;
grant update (bio, club) on public.profiles to authenticated;

-- ── 팔로우 ───────────────────────────────────────────────────────────────
-- 누가 누구를 팔로우하는지는 본인 것만 보인다. 수는 profile_summary() 가 세어 준다.
create table if not exists public.follows (
  follower_id uuid not null default auth.uid() references public.profiles (user_id) on delete cascade,
  followee_id uuid not null references public.profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
alter table public.follows enable row level security;
create index if not exists follows_followee on public.follows (followee_id);

drop policy if exists "follows: 본인만 조회" on public.follows;
drop policy if exists "follows: 본인만 생성" on public.follows;
drop policy if exists "follows: 본인만 삭제" on public.follows;
create policy "follows: 본인만 조회" on public.follows for select to authenticated using ((select auth.uid()) = follower_id);
create policy "follows: 본인만 생성" on public.follows for insert to authenticated with check ((select auth.uid()) = follower_id and public.is_member());
create policy "follows: 본인만 삭제" on public.follows for delete to authenticated using ((select auth.uid()) = follower_id);

revoke insert, update on public.follows from authenticated, anon;
grant insert (followee_id) on public.follows to authenticated;

-- 한 사람이 팔로우할 수 있는 수는 200명까지. 서버가 한도에 닿으면 새 팔로우를 받지 않는다.
create or replace function public.enforce_follow_quota() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.db_full() then
    raise exception 'server_full' using errcode = 'P0001';
  end if;
  if (select count(*) from public.follows where follower_id = new.follower_id) >= 200 then
    raise exception 'follow_quota' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists follows_quota on public.follows;
create trigger follows_quota before insert on public.follows
for each row execute function public.enforce_follow_quota();

-- ── 피드 한 쪽: 구단과 팔로잉으로 거를 수 있다 ───────────────────────────
-- 돌려주는 칸이 늘어서 예전 함수를 지우고 다시 만든다.
drop function if exists public.feed_page(timestamptz, uuid, int);
drop function if exists public.feed_page(timestamptz, uuid, int, text, boolean);
create function public.feed_page(
  p_before timestamptz default null,
  p_author uuid default null,
  p_limit int default 20,
  p_club text default null,
  p_following boolean default false
)
returns table (
  id uuid,
  user_id uuid,
  nickname text,
  column_id text,
  title text,
  excerpt text,
  created_at timestamptz,
  like_count bigint,
  comment_count bigint,
  liked boolean,
  club text
)
language sql stable security definer set search_path = '' as $$
  select
    p.id,
    p.user_id,
    pr.nickname,
    p.column_id,
    p.title,
    p.excerpt,
    p.created_at,
    (select count(*) from public.post_likes l where l.post_id = p.id),
    (select count(*) from public.post_comments c where c.post_id = p.id),
    exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    p.club
  from public.posts p
  join public.profiles pr on pr.user_id = p.user_id
  where public.is_member()
    and (p_before is null or p.created_at < p_before)
    and (p_author is null or p.user_id = p_author)
    and (p_club is null or p.club = p_club)
    and (not coalesce(p_following, false)
         or exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p.user_id))
  order by p.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;
revoke execute on function public.feed_page(timestamptz, uuid, int, text, boolean) from public, anon;
grant execute on function public.feed_page(timestamptz, uuid, int, text, boolean) to authenticated;

-- ── 인기 칼럼리스트 ──────────────────────────────────────────────────────
-- 글을 올린 사람을 최근 30일 동안 받은 좋아요 순으로. fresh: 최근 7일 안에 새 글을 올렸다.
create or replace function public.popular_columnists(p_limit int default 10)
returns table (
  user_id uuid,
  nickname text,
  club text,
  last_seen_at timestamptz,
  like_count bigint,
  post_count bigint,
  fresh boolean
)
language sql stable security definer set search_path = '' as $$
  select
    pr.user_id,
    pr.nickname,
    pr.club,
    pr.last_seen_at,
    (select count(*) from public.post_likes l join public.posts lp on lp.id = l.post_id
      where lp.user_id = pr.user_id and l.created_at > now() - interval '30 days') as like_count,
    count(p.id) as post_count,
    max(p.created_at) > now() - interval '7 days' as fresh
  from public.profiles pr
  join public.posts p on p.user_id = pr.user_id
  where public.is_member()
  group by pr.user_id
  order by like_count desc, max(p.created_at) desc
  limit least(greatest(coalesce(p_limit, 10), 1), 30);
$$;
revoke execute on function public.popular_columnists(int) from public, anon;
grant execute on function public.popular_columnists(int) to authenticated;

-- ── 프로필 한 장 ─────────────────────────────────────────────────────────
create or replace function public.profile_summary(p_user uuid)
returns table (
  user_id uuid,
  nickname text,
  bio text,
  club text,
  last_seen_at timestamptz,
  post_count bigint,
  follower_count bigint,
  following_count bigint,
  like_count bigint,
  following boolean,
  fresh boolean
)
language sql stable security definer set search_path = '' as $$
  select
    pr.user_id,
    pr.nickname,
    pr.bio,
    pr.club,
    pr.last_seen_at,
    (select count(*) from public.posts p where p.user_id = pr.user_id),
    (select count(*) from public.follows f where f.followee_id = pr.user_id),
    (select count(*) from public.follows f where f.follower_id = pr.user_id),
    (select count(*) from public.post_likes l join public.posts p on p.id = l.post_id where p.user_id = pr.user_id),
    exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = pr.user_id),
    exists (select 1 from public.posts p where p.user_id = pr.user_id and p.created_at > now() - interval '7 days')
  from public.profiles pr
  where public.is_member() and pr.user_id = p_user;
$$;
revoke execute on function public.profile_summary(uuid) from public, anon;
grant execute on function public.profile_summary(uuid) to authenticated;
