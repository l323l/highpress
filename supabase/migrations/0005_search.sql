-- 검색과 리그 필터 (M13): 피드의 글(제목·앞부분·글쓴이)과 칼럼리스트(닉네임)를 찾고, 리그 단위로 글을 거른다.
-- 0001 ~ 0004 를 실행한 프로젝트에 이어서 한 번 실행한다. 여러 번 실행해도 같은 결과가 되게 썼다.
-- 원칙은 그대로다: 가입자끼리만 본다. 로그인하지 않은 사람에게는 아무것도 보이지 않는다.

-- 검색어를 "그 말이 들어 있는지" 찾는 꼴로 바꾼다. 빈 말이면 null (거르지 않는다는 뜻).
-- %, _ 같은 특수 문자는 글자 그대로 찾도록 막는다. 길이는 50자까지만 본다.
create or replace function public.search_pattern(p_query text) returns text
language sql immutable set search_path = '' as $$
  select case
    when nullif(btrim(coalesce(p_query, '')), '') is null then null
    else '%' || replace(replace(replace(left(btrim(p_query), 50), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  end;
$$;
revoke execute on function public.search_pattern(text) from public, anon;
grant execute on function public.search_pattern(text) to authenticated;

-- ── 피드 한 쪽: 검색어와 리그(구단 여러 개)로도 거를 수 있다 ─────────────
-- 받는 값이 늘어서 예전 함수를 지우고 다시 만든다.
-- p_clubs: 이 구단들 가운데 하나인 글만. 리그를 골랐을 때 앱이 그 리그의 구단들을 보낸다.
drop function if exists public.feed_page(timestamptz, uuid, int, text, boolean);
drop function if exists public.feed_page(timestamptz, uuid, int, text, boolean, text);
drop function if exists public.feed_page(timestamptz, uuid, int, text, boolean, text, text[]);
create function public.feed_page(
  p_before timestamptz default null,
  p_author uuid default null,
  p_limit int default 20,
  p_club text default null,
  p_following boolean default false,
  p_query text default null,
  p_clubs text[] default null
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
    and (p_clubs is null or cardinality(p_clubs) = 0 or p.club = any (p_clubs))
    and (not coalesce(p_following, false)
         or exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p.user_id))
    and (public.search_pattern(p_query) is null
         or p.title ilike public.search_pattern(p_query)
         or p.excerpt ilike public.search_pattern(p_query)
         or pr.nickname ilike public.search_pattern(p_query))
  order by p.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;
revoke execute on function public.feed_page(timestamptz, uuid, int, text, boolean, text, text[]) from public, anon;
grant execute on function public.feed_page(timestamptz, uuid, int, text, boolean, text, text[]) to authenticated;

-- ── 칼럼리스트 찾기 ──────────────────────────────────────────────────────
-- 닉네임에 검색어가 들어 있는 가입자. 글을 올린 적이 없어도 나온다. 검색어가 비면 아무도 돌려주지 않는다.
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
    pr.last_seen_at,
    (select count(*) from public.posts p where p.user_id = pr.user_id),
    exists (select 1 from public.posts p where p.user_id = pr.user_id and p.created_at > now() - interval '7 days')
  from public.profiles pr
  where public.is_member()
    and public.search_pattern(p_query) is not null
    and pr.nickname ilike public.search_pattern(p_query)
  order by pr.last_seen_at desc nulls last
  limit least(greatest(coalesce(p_limit, 8), 1), 20);
$$;
revoke execute on function public.search_columnists(text, int) from public, anon;
grant execute on function public.search_columnists(text, int) to authenticated;
