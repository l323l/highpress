-- 피드 정렬 (M15): 최신순에 더해 좋아요가 많은 순으로도 본다.
-- 0001 ~ 0006 을 실행한 프로젝트에 이어서 한 번 실행한다. 여러 번 실행해도 같은 결과가 되게 썼다.
-- 원칙은 그대로다: 가입자끼리만 본다. 로그인하지 않은 사람에게는 아무것도 보이지 않는다.

-- 받는 값이 늘어서 예전 함수를 지우고 다시 만든다.
-- p_sort: 'top' 이면 좋아요가 많은 순(같으면 최근 순), 그 밖의 값이면 최근 순.
-- p_offset: 좋아요순에서 다음 쪽을 읽을 때 건너뛸 글 수. 좋아요 수는 계속 바뀌어 시각(p_before)으로 이어 읽을 수 없다.
drop function if exists public.feed_page(timestamptz, uuid, int, text, boolean, text, text[]);
drop function if exists public.feed_page(timestamptz, uuid, int, text, boolean, text, text[], text, int);
create function public.feed_page(
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
  order by
    case when p_sort = 'top' then (select count(*) from public.post_likes l where l.post_id = p.id) else 0 end desc,
    p.created_at desc,
    p.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset least(greatest(coalesce(p_offset, 0), 0), 2000);
$$;
revoke execute on function public.feed_page(timestamptz, uuid, int, text, boolean, text, text[], text, int) from public, anon;
grant execute on function public.feed_page(timestamptz, uuid, int, text, boolean, text, text[], text, int) to authenticated;
