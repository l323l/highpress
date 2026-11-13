-- 프로필 사진 (M19): 가입자가 프로필에 사진 한 장을 넣는다.
-- 0001 ~ 0010 을 실행한 프로젝트에 이어서 한 번 실행한다. 여러 번 실행해도 같은 결과가 되게 썼다.
-- 사진은 작게 줄인 사본(256px, 200KB 까지)만 올라온다. 닉네임처럼 누구에게나 보인다.
-- 글 옆에 여러 장이 한꺼번에 뜨므로 주소로 바로 열리는 공개 보관함에 둔다 (주소를 아는 사람은 누구나 볼 수 있다).

-- ── 프로필: 사진의 위치 ──────────────────────────────────────────────────
-- 값은 "<내 id>/<올린 시각>.webp" 꼴이다. 남의 폴더를 가리키게 적을 수 없다.
alter table public.profiles add column if not exists avatar text;
alter table public.profiles drop constraint if exists profiles_avatar_own;
alter table public.profiles add constraint profiles_avatar_own
  check (avatar is null or avatar ~ ('^' || user_id::text || '/[0-9]{10,16}\.(webp|jpg)$'));

grant select (avatar) on public.profiles to authenticated;
grant update (avatar) on public.profiles to authenticated;

-- ── 사진 보관함 ──────────────────────────────────────────────────────────
-- 공개한다(읽기는 주소만으로 된다). 한 장에 200KB까지, webp · jpeg 만 받는다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 204800, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 한 사람이 보관함에 둔 프로필 사진 수. 규칙 안에서 같은 표를 다시 읽으면 규칙이 끝없이 되풀이되므로 함수로 뺀다.
create or replace function public.avatar_count(p_user uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select count(*) from storage.objects o where o.bucket_id = 'avatars' and (storage.foldername(o.name))[1] = p_user::text;
$$;
revoke execute on function public.avatar_count(uuid) from public, anon;
grant execute on function public.avatar_count(uuid) to authenticated;

drop policy if exists "avatars: 본인 것 조회" on storage.objects;
drop policy if exists "avatars: 본인만 올리기" on storage.objects;
drop policy if exists "avatars: 본인 또는 운영자 삭제" on storage.objects;
-- 목록 조회와 지우기에 필요하다. 사진 자체는 공개 주소로 읽으므로 이 규칙과 무관하다.
create policy "avatars: 본인 것 조회" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin()));
-- 새 사진을 올리고 예전 것을 지우는 사이에 두 장이 겹치므로 세 장까지 둘 수 있게 한다.
create policy "avatars: 본인만 올리기" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and public.is_member()
              and (storage.foldername(name))[1] = (select auth.uid())::text
              and public.avatar_count((select auth.uid())) < 3);
create policy "avatars: 본인 또는 운영자 삭제" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin()));

-- ── 아래 함수들은 글쓴이의 프로필 사진 위치(avatar)를 함께 돌려준다 ──────
-- 돌려주는 칸이 늘어서 예전 함수를 지우고 다시 만든다. 그 밖의 내용은 0009 · 0010 과 같다.

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
  cover text,
  avatar text
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
    p.cover,
    pr.avatar
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

drop function if exists public.popular_columnists(int);
create function public.popular_columnists(p_limit int default 10)
returns table (
  user_id uuid,
  nickname text,
  club text,
  last_seen_at timestamptz,
  like_count bigint,
  post_count bigint,
  fresh boolean,
  avatar text
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
    max(p.created_at) > now() - interval '7 days' as fresh,
    pr.avatar
  from public.profiles pr
  join public.posts p on p.user_id = pr.user_id
  group by pr.user_id
  order by like_count desc, max(p.created_at) desc
  limit least(greatest(coalesce(p_limit, 10), 1), 30);
$$;
revoke execute on function public.popular_columnists(int) from public;
grant execute on function public.popular_columnists(int) to anon, authenticated;

drop function if exists public.profile_summary(uuid);
create function public.profile_summary(p_user uuid)
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
  fresh boolean,
  avatar text
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
    exists (select 1 from public.posts p where p.user_id = pr.user_id and p.created_at > now() - interval '7 days'),
    pr.avatar
  from public.profiles pr
  where pr.user_id = p_user;
$$;
revoke execute on function public.profile_summary(uuid) from public;
grant execute on function public.profile_summary(uuid) to anon, authenticated;

drop function if exists public.search_columnists(text, int);
create function public.search_columnists(p_query text, p_limit int default 8)
returns table (
  user_id uuid,
  nickname text,
  club text,
  last_seen_at timestamptz,
  post_count bigint,
  fresh boolean,
  avatar text
)
language sql stable security definer set search_path = '' as $$
  select
    pr.user_id,
    pr.nickname,
    pr.club,
    case when auth.uid() is null then null else pr.last_seen_at end,
    (select count(*) from public.posts p where p.user_id = pr.user_id) as post_count,
    exists (select 1 from public.posts p where p.user_id = pr.user_id and p.created_at > now() - interval '7 days'),
    pr.avatar
  from public.profiles pr
  where public.search_pattern(p_query) is not null
    and pr.nickname ilike public.search_pattern(p_query)
  order by case when auth.uid() is null then null else pr.last_seen_at end desc nulls last, post_count desc, pr.nickname
  limit least(greatest(coalesce(p_limit, 8), 1), 20);
$$;
revoke execute on function public.search_columnists(text, int) from public;
grant execute on function public.search_columnists(text, int) to anon, authenticated;

-- 지워진 자리는 글쓴이 · 내용과 함께 사진도 비워서 준다.
drop function if exists public.post_comment_list(uuid);
create function public.post_comment_list(p_post uuid)
returns table (
  id uuid,
  user_id uuid,
  nickname text,
  body text,
  created_at timestamptz,
  parent_id uuid,
  like_count bigint,
  liked boolean,
  deleted boolean,
  avatar text
)
language sql stable security definer set search_path = '' as $$
  select
    c.id,
    case when c.deleted_at is null then c.user_id end,
    case when c.deleted_at is null then pr.nickname else '' end,
    case when c.deleted_at is null then c.body else '' end,
    c.created_at,
    c.parent_id,
    (select count(*) from public.comment_likes l where l.comment_id = c.id),
    exists (select 1 from public.comment_likes l where l.comment_id = c.id and l.user_id = auth.uid()),
    c.deleted_at is not null,
    case when c.deleted_at is null then pr.avatar end
  from public.post_comments c
  join public.profiles pr on pr.user_id = c.user_id
  where c.post_id = p_post
  order by c.created_at
  limit 200;
$$;
revoke execute on function public.post_comment_list(uuid) from public;
grant execute on function public.post_comment_list(uuid) to anon, authenticated;
