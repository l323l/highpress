-- 칼럼 피드 (M11): 가입자끼리 올린 칼럼을 보고, 좋아요와 댓글을 남긴다.
-- 0001_init.sql, 0002_ops.sql 을 실행한 프로젝트에 이어서 한 번 실행한다. 여러 번 실행해도 같은 결과가 되게 썼다.
-- 원칙은 그대로다: 기기가 원본이고, 서버에는 사용자가 "피드에 올리기"를 누른 글만 온다. 사진·영상·GIF는 올리지 않는다.
-- 피드는 약관에 동의한 가입자만 본다. 로그인하지 않은 사람에게는 아무것도 보이지 않는다.

-- ── 가입자 확인 ──────────────────────────────────────────────────────────
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where user_id = auth.uid());
$$;
revoke execute on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated;

-- ── 프로필: 닉네임과 마지막 접속 시각을 가입자끼리 본다 ──────────────────
alter table public.profiles add column if not exists last_seen_at timestamptz;

drop policy if exists "profiles: 본인만 조회" on public.profiles;
drop policy if exists "profiles: 본인과 가입자 조회" on public.profiles;
create policy "profiles: 본인과 가입자 조회" on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id or public.is_member());

-- 동의 시각과 가입일은 남에게 보이지 않는다. 이메일은 이 테이블에 없다.
revoke select on public.profiles from authenticated, anon;
grant select (user_id, nickname, last_seen_at) on public.profiles to authenticated;

-- 앱을 열어 둔 동안 몇 분마다 부른다. 피드 위쪽의 "접속 중" 표시에 쓴다.
create or replace function public.touch_presence() returns void
language sql security definer set search_path = '' as $$
  update public.profiles set last_seen_at = now() where user_id = auth.uid();
$$;
revoke execute on function public.touch_presence() from public, anon;
grant execute on function public.touch_presence() to authenticated;

-- ── 게시글 ───────────────────────────────────────────────────────────────
-- column_id 는 기기의 칼럼 id. 같은 칼럼을 다시 올리면 새 글이 아니라 내용이 바뀐다.
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (user_id) on delete cascade,
  column_id text not null check (column_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  excerpt text not null default '' check (char_length(excerpt) <= 300),
  -- 글과 스탯 표만 담는다. 한 편에 300KB까지.
  body jsonb not null check (octet_length(body::text) <= 307200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, column_id)
);
alter table public.posts enable row level security;
create index if not exists posts_created_at on public.posts (created_at desc);

drop policy if exists "posts: 가입자 조회" on public.posts;
drop policy if exists "posts: 본인만 생성" on public.posts;
drop policy if exists "posts: 본인만 수정" on public.posts;
drop policy if exists "posts: 본인 또는 운영자 삭제" on public.posts;
create policy "posts: 가입자 조회" on public.posts for select to authenticated using (public.is_member());
create policy "posts: 본인만 생성" on public.posts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "posts: 본인만 수정" on public.posts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "posts: 본인 또는 운영자 삭제" on public.posts for delete to authenticated using ((select auth.uid()) = user_id or public.is_admin());

-- 글쓴이와 올린 시각은 서버가 정한다.
revoke insert, update on public.posts from authenticated, anon;
grant insert (column_id, title, excerpt, body) on public.posts to authenticated;
grant update (column_id, title, excerpt, body) on public.posts to authenticated;

-- 한 사람이 올릴 수 있는 글은 20편까지. 서버가 한도에 닿으면 새 글을 받지 않는다 (고치기는 계속된다).
create or replace function public.enforce_post_quota() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.db_full() then
    raise exception 'server_full' using errcode = 'P0001';
  end if;
  if (select count(*) from public.posts where user_id = new.user_id) >= 20 then
    raise exception 'post_quota' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists posts_quota on public.posts;
create trigger posts_quota before insert on public.posts
for each row execute function public.enforce_post_quota();

create or replace function public.touch_post() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists posts_touch on public.posts;
create trigger posts_touch before update on public.posts
for each row execute function public.touch_post();

-- ── 좋아요 ───────────────────────────────────────────────────────────────
-- 누가 눌렀는지는 본인 것만 보인다. 개수는 feed_page() 가 세어 준다.
create table if not exists public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.post_likes enable row level security;

drop policy if exists "post_likes: 본인만 조회" on public.post_likes;
drop policy if exists "post_likes: 본인만 생성" on public.post_likes;
drop policy if exists "post_likes: 본인만 삭제" on public.post_likes;
create policy "post_likes: 본인만 조회" on public.post_likes for select to authenticated using ((select auth.uid()) = user_id);
create policy "post_likes: 본인만 생성" on public.post_likes for insert to authenticated with check ((select auth.uid()) = user_id and public.is_member());
create policy "post_likes: 본인만 삭제" on public.post_likes for delete to authenticated using ((select auth.uid()) = user_id);

revoke insert, update on public.post_likes from authenticated, anon;
grant insert (post_id) on public.post_likes to authenticated;

-- ── 댓글 ─────────────────────────────────────────────────────────────────
create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (user_id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
alter table public.post_comments enable row level security;
create index if not exists post_comments_post on public.post_comments (post_id, created_at);
create index if not exists post_comments_user on public.post_comments (user_id, created_at);

drop policy if exists "post_comments: 가입자 조회" on public.post_comments;
drop policy if exists "post_comments: 본인만 생성" on public.post_comments;
drop policy if exists "post_comments: 본인 또는 운영자 삭제" on public.post_comments;
create policy "post_comments: 가입자 조회" on public.post_comments for select to authenticated using (public.is_member());
create policy "post_comments: 본인만 생성" on public.post_comments for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "post_comments: 본인 또는 운영자 삭제" on public.post_comments for delete to authenticated using ((select auth.uid()) = user_id or public.is_admin());

-- 댓글은 고칠 수 없다 (지우고 다시 쓴다).
revoke insert, update on public.post_comments from authenticated, anon;
grant insert (post_id, body) on public.post_comments to authenticated;

-- 한 사람이 하루에 쓸 수 있는 댓글은 100개까지.
create or replace function public.enforce_comment_quota() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.db_full() then
    raise exception 'server_full' using errcode = 'P0001';
  end if;
  if (select count(*) from public.post_comments where user_id = new.user_id and created_at > now() - interval '1 day') >= 100 then
    raise exception 'comment_quota' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists post_comments_quota on public.post_comments;
create trigger post_comments_quota before insert on public.post_comments
for each row execute function public.enforce_comment_quota();

-- ── 피드 한 쪽 ───────────────────────────────────────────────────────────
-- 본문은 빼고 준다 (글을 펼칠 때 posts 에서 따로 읽는다). 가입자가 아니면 빈 결과.
create or replace function public.feed_page(p_before timestamptz default null, p_author uuid default null, p_limit int default 20)
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
  liked boolean
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
    exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = auth.uid())
  from public.posts p
  join public.profiles pr on pr.user_id = p.user_id
  where public.is_member()
    and (p_before is null or p.created_at < p_before)
    and (p_author is null or p.user_id = p_author)
  order by p.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;
revoke execute on function public.feed_page(timestamptz, uuid, int) from public, anon;
grant execute on function public.feed_page(timestamptz, uuid, int) to authenticated;
