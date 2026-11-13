-- 대표 사진 (M16): 피드에 올리는 글에 사진을 한 장 붙일 수 있다.
-- 0001 ~ 0007 을 실행한 프로젝트에 이어서 한 번 실행한다. 여러 번 실행해도 같은 결과가 되게 썼다.
-- 원칙은 그대로다: 가입자끼리만 본다. 로그인하지 않은 사람에게는 사진도 보이지 않는다.

-- ── 글의 대표 사진 칸 ────────────────────────────────────────────────────
-- 사진 파일은 보관함(Storage)에 있고, 여기에는 그 위치만 적는다. 위치는 "<내 id>/<칼럼 id>" 하나로 정해져 있다.
-- 남의 사진 위치를 내 글에 적을 수 없다.
alter table public.posts add column if not exists cover text;
alter table public.posts drop constraint if exists posts_cover_own;
alter table public.posts add constraint posts_cover_own
  check (cover is null or cover = user_id::text || '/' || column_id);
grant insert (cover) on public.posts to authenticated;
grant update (cover) on public.posts to authenticated;

-- ── 사진 보관함 ──────────────────────────────────────────────────────────
-- 공개하지 않는다(주소만으로는 열리지 않는다). 한 장에 400KB까지, webp · jpeg 만 받는다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-covers', 'post-covers', false, 409600, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 한 사람이 보관함에 둔 사진 수. 규칙 안에서 같은 표를 다시 읽으면 규칙이 끝없이 되풀이되므로 함수로 뺀다.
create or replace function public.cover_count(p_user uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select count(*) from storage.objects o
  where o.bucket_id = 'post-covers' and o.name like p_user::text || '/%';
$$;
revoke execute on function public.cover_count(uuid) from public, anon;
grant execute on function public.cover_count(uuid) to authenticated;

-- 내 사진의 위치인지: "<내 id>/<칼럼 id>" 꼴만 맞다.
create or replace function public.is_own_cover(p_name text) returns boolean
language sql stable set search_path = '' as $$
  select p_name ~ ('^' || (select auth.uid())::text || '/[A-Za-z0-9_-]{1,64}$');
$$;
revoke execute on function public.is_own_cover(text) from public, anon;
grant execute on function public.is_own_cover(text) to authenticated;

drop policy if exists "post-covers: 가입자 조회" on storage.objects;
drop policy if exists "post-covers: 본인만 올리기" on storage.objects;
drop policy if exists "post-covers: 본인만 바꾸기" on storage.objects;
drop policy if exists "post-covers: 본인 또는 운영자 삭제" on storage.objects;
create policy "post-covers: 가입자 조회" on storage.objects for select to authenticated
  using (bucket_id = 'post-covers' and public.is_member());
-- 글은 20편까지이므로 사진도 20장까지만 둘 수 있다 (글 없이 사진만 쌓아 보관함을 채우지 못하게).
create policy "post-covers: 본인만 올리기" on storage.objects for insert to authenticated
  with check (bucket_id = 'post-covers' and public.is_member() and public.is_own_cover(name)
              and public.cover_count((select auth.uid())) < 20);
create policy "post-covers: 본인만 바꾸기" on storage.objects for update to authenticated
  using (bucket_id = 'post-covers' and public.is_own_cover(name))
  with check (bucket_id = 'post-covers' and public.is_member() and public.is_own_cover(name));
create policy "post-covers: 본인 또는 운영자 삭제" on storage.objects for delete to authenticated
  using (bucket_id = 'post-covers' and (public.is_own_cover(name) or public.is_admin()));

-- ── 피드 한 쪽: 대표 사진의 위치도 함께 돌려준다 ─────────────────────────
-- 돌려주는 칸이 늘어서 예전 함수를 지우고 다시 만든다. 받는 값은 0007 과 같다.
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
