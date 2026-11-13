-- 답글과 댓글 좋아요 (M18): 댓글에 답글을 달고, 댓글에 좋아요를 누른다.
-- 0001 ~ 0009 를 실행한 프로젝트에 이어서 한 번 실행한다. 여러 번 실행해도 같은 결과가 되게 썼다.
-- 읽기는 누구나 하고(0009), 답글 · 댓글 좋아요 · 댓글 지우기는 그대로 약관에 동의한 가입자만 한다.
-- 답글이 달린 댓글을 지우면 내용과 이름만 지우고 자리는 남긴다. 달려 있던 답글은 그대로 보인다.

-- ── 댓글: 어느 댓글의 답글인지, 몇 단계인지, 지워진 자리인지 ────────────
alter table public.post_comments add column if not exists parent_id uuid references public.post_comments (id) on delete cascade;
alter table public.post_comments add column if not exists depth smallint not null default 0;
alter table public.post_comments add column if not exists deleted_at timestamptz;
create index if not exists post_comments_parent on public.post_comments (parent_id);

-- 답글을 쓸 때 고를 수 있는 것은 "어느 댓글에 다는지"뿐이다. 단계와 지워진 표시는 서버가 정한다.
grant insert (parent_id) on public.post_comments to authenticated;

-- 답글은 같은 글의 댓글에만 달린다. 단계는 4단계까지이고, 그보다 깊이 달면 같은 단계의 답글로 붙는다.
create or replace function public.place_comment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  parent public.post_comments%rowtype;
begin
  new.deleted_at := null;
  if new.parent_id is null then
    new.depth := 0;
    return new;
  end if;
  select * into parent from public.post_comments where id = new.parent_id;
  if not found or parent.post_id <> new.post_id then
    raise exception 'comment_parent' using errcode = 'P0001';
  end if;
  if parent.depth >= 4 then
    new.parent_id := parent.parent_id;
    new.depth := parent.depth;
  else
    new.depth := parent.depth + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists post_comments_place on public.post_comments;
create trigger post_comments_place before insert on public.post_comments
for each row execute function public.place_comment();

-- ── 댓글 좋아요 ──────────────────────────────────────────────────────────
-- 누가 눌렀는지는 본인 것만 보인다. 개수는 post_comment_list() 가 세어 준다.
create table if not exists public.comment_likes (
  comment_id uuid not null references public.post_comments (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
alter table public.comment_likes enable row level security;

drop policy if exists "comment_likes: 본인만 조회" on public.comment_likes;
drop policy if exists "comment_likes: 본인만 생성" on public.comment_likes;
drop policy if exists "comment_likes: 본인만 삭제" on public.comment_likes;
create policy "comment_likes: 본인만 조회" on public.comment_likes for select to authenticated using ((select auth.uid()) = user_id);
create policy "comment_likes: 본인만 생성" on public.comment_likes for insert to authenticated with check ((select auth.uid()) = user_id and public.is_member());
create policy "comment_likes: 본인만 삭제" on public.comment_likes for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.comment_likes from anon;
revoke insert, update on public.comment_likes from authenticated;
grant select, delete on public.comment_likes to authenticated;
grant insert (comment_id) on public.comment_likes to authenticated;

-- 지워진 자리에는 좋아요를 누를 수 없다. 서버가 한도에 닿았으면 새 좋아요를 받지 않는다.
create or replace function public.check_comment_like() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.db_full() then
    raise exception 'server_full' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.post_comments c where c.id = new.comment_id and c.deleted_at is not null) then
    raise exception 'comment_deleted' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists comment_likes_check on public.comment_likes;
create trigger comment_likes_check before insert on public.comment_likes
for each row execute function public.check_comment_like();

-- ── 글 한 편의 댓글 ──────────────────────────────────────────────────────
-- 돌려주는 칸이 늘어서 예전 함수를 지우고 다시 만든다. 먼저 쓴 것부터 200개까지.
-- 지워진 자리는 글쓴이와 내용을 비워서 준다.
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
  deleted boolean
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
    c.deleted_at is not null
  from public.post_comments c
  join public.profiles pr on pr.user_id = c.user_id
  where c.post_id = p_post
  order by c.created_at
  limit 200;
$$;
revoke execute on function public.post_comment_list(uuid) from public;
grant execute on function public.post_comment_list(uuid) to anon, authenticated;

-- ── 댓글 지우기 ──────────────────────────────────────────────────────────
-- 본인이나 운영자만 지운다. 답글이 달려 있으면 자리만 남기고(false), 없으면 완전히 지운다(true).
-- 자리만 남은 댓글의 마지막 답글이 지워지면 그 자리도 함께 치운다.
create or replace function public.delete_comment(p_comment uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  target public.post_comments%rowtype;
  up uuid;
begin
  select * into target from public.post_comments where id = p_comment;
  if not found or target.deleted_at is not null then
    return false;
  end if;
  if auth.uid() is null or (target.user_id <> auth.uid() and not public.is_admin()) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if exists (select 1 from public.post_comments c where c.parent_id = p_comment) then
    update public.post_comments set body = '-', deleted_at = now() where id = p_comment;
    delete from public.comment_likes where comment_id = p_comment;
    return false;
  end if;
  up := target.parent_id;
  delete from public.post_comments where id = p_comment;
  -- 위로 올라가며, 지워진 자리이고 답글이 하나도 남지 않은 댓글을 치운다.
  while up is not null loop
    select * into target from public.post_comments where id = up;
    exit when not found or target.deleted_at is null or exists (select 1 from public.post_comments c where c.parent_id = up);
    delete from public.post_comments where id = up;
    up := target.parent_id;
  end loop;
  return true;
end;
$$;
revoke execute on function public.delete_comment(uuid) from public, anon;
grant execute on function public.delete_comment(uuid) to authenticated;
