-- 피드를 로그인 없이 읽기 (M17): 피드의 글, 인기 칼럼리스트, 프로필, 검색, 본문, 댓글, 대표 사진을 로그인하지 않은 사람도 읽는다.
-- 0001 ~ 0008 을 실행한 프로젝트에 이어서 한 번 실행한다. 여러 번 실행해도 같은 결과가 되게 썼다.
-- 열리는 것은 "읽기"뿐이다. 글 올리기 · 좋아요 · 댓글 · 팔로우 · 피드백은 그대로 약관에 동의한 가입자만 한다.
-- 테이블은 열지 않는다. 로그인하지 않은 사람은 아래 함수들이 돌려주는 칸만 읽는다.
-- 로그인하지 않은 사람에게는 마지막 접속 시각(접속 중 표시)을 주지 않는다.

-- ── 피드 한 쪽: 가입자 조건을 뺀다 ───────────────────────────────────────
-- 받는 값과 돌려주는 칸은 0008 과 같다. 로그인하지 않으면 liked 는 늘 false 이고, 팔로잉으로 거르면 아무것도 나오지 않는다.
create or replace function public.feed_page(
  p_before timestamptz default null,
  p_author uuid default null,
  p_limit int default 20,
  p_club text default null,
  p_following boolean default false,
  p_query text default null,
  p_clubs text[] default null,
  p_sort text default 'new',
  p_offset int default 0
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
  club text,
  cover text
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
    p.club,
    p.cover
  from public.posts p
  join public.profiles pr on pr.user_id = p.user_id
  where (p_before is null or p.created_at < p_before)
    and (p_author is null or p.user_id = p_author)
    and (p_club is null or p.club = p_club)
    and (p_clubs is null or cardinality(p_clubs) = 0 or p.club = any (p_clubs))
    and (not coalesce(p_following, false)
         or exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p.user_id))
    and (public.search_pattern(p_query) is null
         or p.title ilike public.search_pattern(p_query)
         or p.excerpt ilike public.search_pattern(p_query)
         or pr.nickname ilike public.search_pattern(p_query))
  order by
    case when p_sort = 'top' then (select count(*) from public.post_likes l where l.post_id = p.id) else 0 end desc,
    p.created_at desc,
    p.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset least(greatest(coalesce(p_offset, 0), 0), 2000);
$$;
revoke execute on function public.feed_page(timestamptz, uuid, int, text, boolean, text, text[], text, int) from public;
grant execute on function public.feed_page(timestamptz, uuid, int, text, boolean, text, text[], text, int) to anon, authenticated;

-- ── 인기 칼럼리스트 ──────────────────────────────────────────────────────
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
    case when auth.uid() is null then null else pr.last_seen_at end,
    (select count(*) from public.post_likes l join public.posts lp on lp.id = l.post_id
      where lp.user_id = pr.user_id and l.created_at > now() - interval '30 days') as like_count,
    count(p.id) as post_count,
    max(p.created_at) > now() - interval '7 days' as fresh
  from public.profiles pr
  join public.posts p on p.user_id = pr.user_id
  group by pr.user_id
  order by like_count desc, max(p.created_at) desc
  limit least(greatest(coalesce(p_limit, 10), 1), 30);
$$;
revoke execute on function public.popular_columnists(int) from public;
grant execute on function public.popular_columnists(int) to anon, authenticated;

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
    case when auth.uid() is null then null else pr.last_seen_at end,
    (select count(*) from public.posts p where p.user_id = pr.user_id),
    (select count(*) from public.follows f where f.followee_id = pr.user_id),
    (select count(*) from public.follows f where f.follower_id = pr.user_id),
    (select count(*) from public.post_likes l join public.posts p on p.id = l.post_id where p.user_id = pr.user_id),
    exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = pr.user_id),
    exists (select 1 from public.posts p where p.user_id = pr.user_id and p.created_at > now() - interval '7 days')
  from public.profiles pr
  where pr.user_id = p_user;
$$;
revoke execute on function public.profile_summary(uuid) from public;
grant execute on function public.profile_summary(uuid) to anon, authenticated;

-- ── 칼럼리스트 찾기 ──────────────────────────────────────────────────────
-- 로그인하지 않은 사람에게는 접속 시각을 주지 않으므로, 그때는 글이 많은 사람부터 늘어놓는다 (순서로 접속 시각이 새지 않게).
create or replace function public.search_columnists(p_query text, p_limit int default 8)
returns table (
  user_id uuid,
  nickname text,
  club text,
  last_seen_at timestamptz,
  post_count bigint,
  fresh boolean
)
language sql stable security definer set search_path = '' as $$
  select
    pr.user_id,
    pr.nickname,
    pr.club,
    case when auth.uid() is null then null else pr.last_seen_at end,
    (select count(*) from public.posts p where p.user_id = pr.user_id) as post_count,
    exists (select 1 from public.posts p where p.user_id = pr.user_id and p.created_at > now() - interval '7 days')
  from public.profiles pr
  where public.search_pattern(p_query) is not null
    and pr.nickname ilike public.search_pattern(p_query)
  order by case when auth.uid() is null then null else pr.last_seen_at end desc nulls last, post_count desc, pr.nickname
  limit least(greatest(coalesce(p_limit, 8), 1), 20);
$$;
revoke execute on function public.search_columnists(text, int) from public;
grant execute on function public.search_columnists(text, int) to anon, authenticated;

-- ── 글 한 편의 본문 ──────────────────────────────────────────────────────
-- 없는 글이면 null. 테이블을 열지 않고 본문 한 칸만 돌려준다.
create or replace function public.post_body(p_post uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select p.body from public.posts p where p.id = p_post;
$$;
revoke execute on function public.post_body(uuid) from public;
grant execute on function public.post_body(uuid) to anon, authenticated;

-- ── 글 한 편의 댓글 ──────────────────────────────────────────────────────
-- 오래된 것부터 200개까지.
create or replace function public.post_comment_list(p_post uuid)
returns table (
  id uuid,
  user_id uuid,
  nickname text,
  body text,
  created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.user_id, pr.nickname, c.body, c.created_at
  from public.post_comments c
  join public.profiles pr on pr.user_id = c.user_id
  where c.post_id = p_post
  order by c.created_at
  limit 200;
$$;
revoke execute on function public.post_comment_list(uuid) from public;
grant execute on function public.post_comment_list(uuid) to anon, authenticated;

-- ── 대표 사진: 누구나 받는다 ─────────────────────────────────────────────
-- 올리기 · 바꾸기 · 지우기는 0008 그대로 본인(가입자)만 한다. 보관함은 비공개로 두고 읽기 정책만 연다.
drop policy if exists "post-covers: 가입자 조회" on storage.objects;
drop policy if exists "post-covers: 누구나 조회" on storage.objects;
create policy "post-covers: 누구나 조회" on storage.objects for select to anon, authenticated
  using (bucket_id = 'post-covers');
