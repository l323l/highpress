-- 사용자 콘텐츠 안전 (A1, APP-PRD 8.1 · APP-PLAN 4.5): 신고 · 차단 · 자동 숨김 · 금칙어 · 이용 정지 · 운영자 처리.
-- 0001 ~ 0013 을 실행한 프로젝트에 이어서 한 번 실행한다. 여러 번 실행해도 같은 결과가 되게 썼다.
-- 같은 서버를 웹과 앱이 함께 쓴다. 이 파일을 넣으면 웹에도 바로 적용된다.
-- 화면과의 규약(함수 이름 · 인자 · 돌려주는 칸 · 오류 메시지)은 src/features/moderation/api.ts 와 APP-PLAN 4.5 가 원본이다.
--
-- 오류 메시지(raise exception, errcode P0001)
--   not_member · suspended · self_report · already_reported · report_quota · bad_report
--   self_block · block_quota · blocked · banned_word · body_too_complex · not_admin · bad_action · not_found · bad_word · bad_request
--
-- 예전 판의 0014 를 이미 넣은 프로젝트에 다시 실행해도 된다 (금칙어 검사 규칙 · 정지 해시 표의 칸을 새 판에 맞춘다).

-- 정지 해시(HMAC)와 pepper 에 쓴다. Supabase 는 extensions 스키마에 이미 켜져 있다 (그때는 아무 일도 없다).
create extension if not exists pgcrypto with schema extensions;
--
-- 자동 숨김 남용 완화 (A1 보안 점검 M6, 메인 결정)
--   · 가입한 지 72시간이 안 된 사람의 신고는 기록하지만 자동 숨김 수에는 넣지 않는다.
--   · 운영자가 restore 한 대상(restored_at)은 다시 자동으로 숨지 않는다. 운영자만 숨길 수 있다.
--     글쓴이가 그 뒤 글 · 프로필을 고치면 restored_at 이 풀려 다시 자동 숨김 대상이 된다.
--   · 운영자 계정의 글 · 댓글 · 프로필은 자동 숨김에서 뺀다.

-- ── 숨김 · 정지 칸 ───────────────────────────────────────────────────────
-- hidden_at: 서로 다른 3명이 신고했거나 운영자가 숨긴 시각. 숨긴 것은 글쓴이(와 운영자)만 본다.
-- restored_at: 운영자가 restore 한 시각. 있으면 자동 숨김을 건너뛴다.
-- profiles.hidden_at: 사용자가 신고로 숨겨지면 남에게 프로필 사진 · 소개만 감춘다 (닉네임 · 글은 그대로).
-- profiles.suspended_at: 이용 정지. 글 · 댓글 · 좋아요 · 팔로우 · 신고 · 닉네임 · 소개 · 사진 올리기가 막힌다.
-- 쓰기: 사용자에게 이 칸들의 insert · update 권한을 주지 않는다. 아래 함수 · 트리거만 쓴다.
-- 읽기: posts · post_comments 는 표 단위 select 권한이 있어서, 그 행을 볼 수 있는 사람(글쓴이 · 운영자)은 hidden_at · restored_at 도 읽는다.
--       profiles 는 칸 단위 권한이라 이 칸들을 읽지 못한다 (본인 정지 여부는 my_profile() 로 읽는다).
alter table public.posts add column if not exists hidden_at timestamptz;
alter table public.posts add column if not exists restored_at timestamptz;
alter table public.post_comments add column if not exists hidden_at timestamptz;
alter table public.post_comments add column if not exists restored_at timestamptz;
alter table public.profiles add column if not exists hidden_at timestamptz;
alter table public.profiles add column if not exists restored_at timestamptz;
alter table public.profiles add column if not exists suspended_at timestamptz;

-- ── L1: 소개 · 프로필 사진 칸을 표에서 직접 읽지 못하게 한다 ─────────────
-- 숨겨진 사용자의 소개 · 사진이 표를 직접 읽어 새지 않게 한다. 남의 것은 profile_summary() 등 함수가 숨김을 반영해 주고,
-- 본인 것은 my_profile() 로 읽는다. (고치기 권한 update (bio, avatar) 는 그대로다)
revoke select (bio, avatar) on public.profiles from authenticated, anon;

-- ── 신고 ─────────────────────────────────────────────────────────────────
-- 대표 사진은 글(post), 프로필 사진은 사용자(user)로 신고하고 part 로 구분한다.
-- 한 사람은 같은 대상을 한 번만 신고한다. 신고한 사람이 탈퇴하면 그 신고도 지워진다.
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid not null default auth.uid() references public.profiles (user_id) on delete cascade,
  target_kind text not null check (target_kind in ('post', 'comment', 'user')),
  target_id uuid not null,
  part text check (part is null or part in ('cover', 'avatar')),
  reason text not null check (reason in ('spam', 'abuse', 'hate', 'sexual', 'illegal', 'other')),
  detail text check (detail is null or char_length(detail) <= 300),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text check (resolution is null or resolution in ('restore', 'delete', 'suspend', 'dismiss')),
  unique (reporter, target_kind, target_id)
);
alter table public.reports enable row level security;
create index if not exists reports_target on public.reports (target_kind, target_id);
create index if not exists reports_reporter on public.reports (reporter, created_at);
create index if not exists reports_open on public.reports (created_at desc) where resolved_at is null;

-- 본인 신고만 읽는다. 쓰기는 report_content() 로만 한다.
drop policy if exists "reports: 본인만 조회" on public.reports;
create policy "reports: 본인만 조회" on public.reports for select to authenticated using ((select auth.uid()) = reporter);
revoke all on public.reports from public, anon, authenticated;
grant select on public.reports to authenticated;

-- ── 차단 ─────────────────────────────────────────────────────────────────
-- 차단한 사람에게 차단된 사람의 글 · 댓글 · 프로필이 보이지 않는다. 차단된 사람은 차단한 사람의 글에 댓글을 달거나 팔로우하지 못한다.
create table if not exists public.blocks (
  blocker uuid not null default auth.uid() references public.profiles (user_id) on delete cascade,
  blocked uuid not null references public.profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
alter table public.blocks enable row level security;
create index if not exists blocks_blocked on public.blocks (blocked);

-- 본인 것만 읽는다. 쓰기는 block_user() · unblock_user() 로만 한다.
drop policy if exists "blocks: 본인만 조회" on public.blocks;
create policy "blocks: 본인만 조회" on public.blocks for select to authenticated using ((select auth.uid()) = blocker);
revoke all on public.blocks from public, anon, authenticated;
grant select on public.blocks to authenticated;

-- ── 금칙어 ───────────────────────────────────────────────────────────────
-- 비교할 꼴(moderation_text() 를 거친 값)로 적는다. 운영자만 읽고 쓴다.
-- ᄀ-ᇿ(U+1100~11FF)는 NFKC 가 호환 자모(ㅅ, ㅂ …)를 바꿔 놓는 조합용 자모다.
create table if not exists public.banned_words (
  word text primary key check (word ~ '^[0-9a-z가-힣ᄀ-ᇿㄱ-ㅣ]{1,30}$'),
  created_at timestamptz not null default now()
);
alter table public.banned_words enable row level security;

drop policy if exists "banned_words: 운영자만 조회" on public.banned_words;
drop policy if exists "banned_words: 운영자만 추가" on public.banned_words;
drop policy if exists "banned_words: 운영자만 삭제" on public.banned_words;
create policy "banned_words: 운영자만 조회" on public.banned_words for select to authenticated using (public.is_admin());
create policy "banned_words: 운영자만 추가" on public.banned_words for insert to authenticated with check (public.is_admin());
create policy "banned_words: 운영자만 삭제" on public.banned_words for delete to authenticated using (public.is_admin());
revoke all on public.banned_words from public, anon, authenticated;
grant select, insert, delete on public.banned_words to authenticated;

-- 비교할 꼴: 먼저 NFKC 로 모양을 맞추고(전각 ＦＵＣＫ → FUCK, ⓕ → f, 호환 자모 → 조합용 자모),
-- 소문자로 바꾼 뒤 숫자 · 영문 소문자 · 한글(완성형과 자모) 말고는 모두 뺀다.
-- 그래서 "개 새.끼" 와 "개새끼" 가 같아진다. 띄어쓰기를 빼므로 두 낱말에 걸쳐 맞는 경우도 있다 (기본 목록은 그런 오탐이 적은 말만 넣는다).
create or replace function public.moderation_text(p_text text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(lower(normalize(coalesce(p_text, ''), NFKC)), '[^0-9a-z가-힣ᄀ-ᇿㄱ-ㅣ]', '', 'g');
$$;
revoke execute on function public.moderation_text(text) from public, anon;
grant execute on function public.moderation_text(text) to authenticated;

-- 글자에 금칙어가 들어 있는지. 긴 본문도 비교할 꼴로 한 번만 바꾼다.
create or replace function public.has_banned_word(p_text text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  clean text := public.moderation_text(p_text);
begin
  if clean = '' then
    return false;
  end if;
  return exists (select 1 from public.banned_words w where position(w.word in clean) > 0);
end;
$$;
revoke execute on function public.has_banned_word(text) from public, anon, authenticated;

-- 글 본문(Tiptap JSON)에서 사람이 읽는 글자를 문서 차례대로 모은다.
--   · 모든 text 칸
--   · attrs 아래의 문자열 값 전부 (스탯 표의 snapshot 처럼 깊이 들어 있는 것도). 단 아래 키는 글자가 아니므로 뺀다:
--     type · mediaId · src · href · id · poster · projectId · target · rel · class
-- 64단계보다 깊은 곳은 보지 않는다 (본문 크기는 300KB 로 막혀 있다).
create or replace function public.doc_strings(p_node jsonb, p_key text, p_attrs boolean, p_depth int) returns text
language plpgsql immutable set search_path = '' as $$
declare
  parts text[] := '{}';
  part text;
  k text;
  v jsonb;
begin
  if p_node is null or p_depth > 64 then
    return '';
  end if;
  case jsonb_typeof(p_node)
    when 'string' then
      if p_key = 'text'
         or (p_attrs and coalesce(p_key, '') not in ('type', 'mediaId', 'src', 'href', 'id', 'poster', 'projectId', 'target', 'rel', 'class')) then
        return p_node #>> '{}';
      end if;
      return '';
    when 'array' then
      for v in select e.value from jsonb_array_elements(p_node) with ordinality e(value, n) order by e.n loop
        part := public.doc_strings(v, p_key, p_attrs, p_depth + 1);
        if part <> '' then
          parts := parts || part;
        end if;
      end loop;
    when 'object' then
      for k, v in select e.key, e.value from jsonb_each(p_node) e loop
        part := public.doc_strings(v, k, p_attrs or k = 'attrs', p_depth + 1);
        if part <> '' then
          parts := parts || part;
        end if;
      end loop;
    else
      return '';
  end case;
  return array_to_string(parts, ' ');
end;
$$;
revoke execute on function public.doc_strings(jsonb, text, boolean, int) from public, anon, authenticated;

-- 본문의 값(객체 · 배열 · 글자 · 숫자 하나하나)이 20,000 개를 넘으면 검사하지 않고 body_too_complex 로 거절한다 (N4).
-- 금칙어 검사가 아주 잘게 쪼갠 본문 때문에 오래 걸리지 않게 한다. 보통 칼럼은 수천 개 안쪽이다.
create or replace function public.doc_text(p_doc jsonb) returns text
language plpgsql immutable set search_path = '' as $$
begin
  if p_doc is null then
    return '';
  end if;
  if (select count(*) from jsonb_path_query(p_doc, 'strict $.**')) > 20000 then
    raise exception 'body_too_complex' using errcode = 'P0001';
  end if;
  return public.doc_strings(p_doc, null, false, 0);
end;
$$;
revoke execute on function public.doc_text(jsonb) from public, anon, authenticated;

-- 검사 규칙을 새 판으로 다시 건다 (예전 판의 규칙에는 조합용 자모 ᄀ-ᇿ 가 없어 아래 기본 금칙어가 들어가지 않는다).
-- 먼저 규칙을 떼고, 이미 들어 있던 금칙어를 비교할 꼴로 맞춘 뒤(N5. 예전 규칙으로 적힌 값, SQL 로 바로 넣은 값), 새 규칙을 붙인다.
-- 바꾸면 비거나 30자를 넘거나 이미 있는 값과 겹치는 것은 지운다.
alter table public.banned_words drop constraint if exists banned_words_word_check;
delete from public.banned_words w
where w.word <> public.moderation_text(w.word)
  and (public.moderation_text(w.word) = ''
       or char_length(public.moderation_text(w.word)) > 30
       or exists (select 1 from public.banned_words x where x.word = public.moderation_text(w.word))
       or exists (select 1 from public.banned_words y
                  where y.word <> public.moderation_text(y.word) and y.word < w.word
                    and public.moderation_text(y.word) = public.moderation_text(w.word)));
update public.banned_words set word = public.moderation_text(word) where word <> public.moderation_text(word);
alter table public.banned_words add constraint banned_words_word_check check (word ~ '^[0-9a-z가-힣ᄀ-ᇿㄱ-ㅣ]{1,30}$');

-- 기본 금칙어. 띄어쓰기를 빼고 비교하므로, 정상어 안에 들어가거나 두 낱말에 걸쳐 쉽게 생기는 짧은 말
-- ("시발점"의 시발, "병신년"의 병신, "솜씨 발휘"의 씨발, "3개년"의 개년, "보지 않"의 보지 등)은 넣지 않았다.
-- 더 넣거나 빼려면 운영 화면(금칙어) 또는 admin_add_banned_word() · admin_remove_banned_word() 를 쓴다.
-- 비교할 꼴로 바꿔 넣는다 (ㅅㅂ · ㅄ 같은 호환 자모는 NFKC 뒤의 조합용 자모로 들어간다).
insert into public.banned_words (word)
select distinct public.moderation_text(w)
from unnest(array[
  '씨발놈', '씨발년', '씨발새끼', '시발놈', '시발년', '시발새끼',
  '씹새끼', '씹년', '좆', '개새끼', '개새기', '개색기',
  '개지랄', '지랄하', '미친놈', '미친년', '븅신', 'ㅅㅂ', 'ㅄ',
  '엠창', '느금마', '니애미', '애미뒤진', '애비뒤진', '호로새끼', '후레자식',
  '썅년', '썅놈', '걸레년', '뒈져',
  '김치녀', '한남충', '보슬아치', '맘충', '틀딱', '짱깨', '쪽바리', '조센징',
  '똥남아', '깜둥이', '똥꼬충', '전라디언',
  'fuck', 'nigger', 'faggot'
]) w
on conflict (word) do nothing;

-- ── 보는 사람 기준의 도우미 (아래 피드 함수들 안에서만 쓴다) ──────────────
-- 지금 사용자가 이 사람을 차단했는지. 로그인하지 않았으면 false.
create or replace function public.is_blocked(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.blocks b where b.blocker = auth.uid() and b.blocked = p_user);
$$;
revoke execute on function public.is_blocked(uuid) from public, anon, authenticated;

-- 이 사용자가 이용 정지 상태인지.
create or replace function public.is_suspended(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.user_id = p_user and p.suspended_at is not null);
$$;
revoke execute on function public.is_suspended(uuid) from public, anon, authenticated;

-- 지금 로그인한 사람이 이용 정지 상태인지 (보관함 규칙에서 쓴다, M4).
create or replace function public.me_suspended() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.is_suspended(auth.uid()), false);
$$;
revoke execute on function public.me_suspended() from public, anon;
grant execute on function public.me_suspended() to authenticated;

-- 이 사용자가 운영자 계정인지 (운영자 목록 admin_emails 에 이메일이 있다). 자동 숨김에서 뺄 때 쓴다 (M6).
create or replace function public.is_admin_user(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select c.value ? lower(coalesce(u.email, ''))
    from auth.users u, public.app_config c
    where u.id = p_user and c.key = 'admin_emails'
  ), false);
$$;
revoke execute on function public.is_admin_user(uuid) from public, anon, authenticated;

-- 본인 프로필 (L1): 소개 · 사진 칸은 표에서 직접 읽지 못하므로 본인 것은 이 함수로 읽는다. 가입 전이면 빈 결과.
create or replace function public.my_profile()
returns table (
  nickname text,
  avatar text,
  bio text,
  club text,
  suspended boolean
)
language sql stable security definer set search_path = '' as $$
  select pr.nickname, pr.avatar, pr.bio, pr.club, pr.suspended_at is not null
  from public.profiles pr
  where pr.user_id = auth.uid();
$$;
revoke execute on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;

-- 대표 사진 파일을 읽어도 되는지 (M3): 숨기지 않은 글이 가리키는 사진이거나, 내 폴더의 사진이거나, 운영자다.
-- 차단 여부는 보지 않는다 (사진 위치를 이미 아는 사람에게 숨길 이유가 적고, 보관함 규칙을 가볍게 둔다).
create or replace function public.cover_visible(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(split_part(p_name, '/', 1) = auth.uid()::text, false)
      or exists (select 1 from public.posts p where p.cover = p_name and p.hidden_at is null)
      or public.is_admin();
$$;
revoke execute on function public.cover_visible(text) from public;
grant execute on function public.cover_visible(text) to anon, authenticated;

-- ── 정지 이어 가기 (M7 · N2): 정지된 사람이 탈퇴하고 같은 계정으로 다시 가입해도 정지가 이어진다 ──
-- 로그인 수단의 식별자(이메일, 그리고 제공자 + 제공자 쪽 id)를 서버만 아는 pepper 로 HMAC-SHA256 한 값만 둔다.
-- 네이버 가입자는 이메일이 네이버 식별자로 정해지므로(naver-login 의 accountEmail) 이메일 해시로 이어진다.
-- 보관 상한: 탈퇴한 시각(left_at)에서 1년. 그 뒤에는 쓰지 않고, 가입 검사가 돌 때와 매일 정기 정리(pg_cron)에서 지운다.
--   정지된 시각이 오래됐어도 탈퇴 직후 다시 가입하면 이어진다. 다시 가입해 정지를 이어 받으면 left_at 을 비운다.

-- pepper: private 스키마의 한 줄. 어느 역할에도(service_role 포함) 권한을 주지 않고 RLS 도 켠다 (PostgREST 에도 드러나지 않는다).
-- 아래 security definer 함수(소유자 권한)만 읽는다. 처음 한 번만 만든다 (pgcrypto 의 gen_random_bytes(32)).
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.identity_pepper (
  id int primary key default 1 check (id = 1),
  pepper bytea not null check (octet_length(pepper) >= 30),
  created_at timestamptz not null default now()
);
alter table private.identity_pepper enable row level security;
revoke all on private.identity_pepper from public, anon, authenticated, service_role;
insert into private.identity_pepper (id, pepper)
select 1, extensions.gen_random_bytes(32)
where not exists (select 1 from private.identity_pepper);

-- user_id: 그 해시를 적을 때의 사용자 (탈퇴 여부를 보려고 둔다. 계정과 묶지 않아 탈퇴해도 남는다).
-- left_at: 그 사용자가 탈퇴한 시각 (프로필이 지워질 때 트리거가 적는다). 보관 상한의 기준이다.
create table if not exists public.banned_identities (
  hash text primary key check (hash ~ '^[0-9a-f]{64}$'),
  user_id uuid,
  created_at timestamptz not null default now(),
  left_at timestamptz
);
alter table public.banned_identities enable row level security;
revoke all on public.banned_identities from public, anon, authenticated;

-- 예전 판 보정: 칸을 새 판에 맞추고, 형식이 다른 예전 해시(64자리 16진수가 아닌 것)를 지운다.
-- 사용자 칸이 비어 있는 행(사용자 칸이 없던 때 적은 것)은 지우지 않고, 적은 시각을 탈퇴 시각으로 보아 보관 상한을 건다.
-- 지금 정지 중인 계정의 해시는 아래 함수들을 만든 뒤 다시 적는다.
alter table public.banned_identities add column if not exists user_id uuid;
alter table public.banned_identities add column if not exists left_at timestamptz;
delete from public.banned_identities where hash !~ '^[0-9a-f]{64}$';
update public.banned_identities set left_at = coalesce(left_at, created_at) where user_id is null;
alter table public.banned_identities drop constraint if exists banned_identities_hash_check;
alter table public.banned_identities add constraint banned_identities_hash_check check (hash ~ '^[0-9a-f]{64}$');

-- HMAC-SHA256(pepper, '<종류>:<값 소문자>'). pgcrypto 의 hmac 을 쓴다.
create or replace function public.identity_hash(p_kind text, p_value text) returns text
language sql stable security definer set search_path = '' as $$
  select encode(extensions.hmac(convert_to(p_kind || ':' || lower(p_value), 'UTF8'), k.pepper, 'sha256'), 'hex')
  from private.identity_pepper k where k.id = 1;
$$;
revoke execute on function public.identity_hash(text, text) from public, anon, authenticated;

-- 이 사용자의 로그인 수단 해시들: 이메일, 그리고 이메일 방식이 아닌 제공자(google · apple …)의 제공자 쪽 id.
create or replace function public.identity_hashes(p_user uuid) returns setof text
language sql stable security definer set search_path = '' as $$
  select public.identity_hash('email', u.email) from auth.users u where u.id = p_user and coalesce(u.email, '') <> ''
  union
  select public.identity_hash(i.provider, i.provider_id) from auth.identities i
  where i.user_id = p_user and i.provider <> 'email' and coalesce(i.provider_id, '') <> '';
$$;
revoke execute on function public.identity_hashes(uuid) from public, anon, authenticated;

-- 정지가 걸리면 해시를 적고, 풀리면 지운다. 운영자 함수로 하든 SQL 로 바로 고치든 같다.
-- 풀 때는 지금 로그인 수단의 해시와, 이 사용자에게 묶인 해시 전부(예전 계정에서 이어 받은 다른 로그인 수단 해시 포함)를 지운다.
create or replace function public.track_suspension() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.suspended_at is not null and old.suspended_at is null then
    insert into public.banned_identities (hash, user_id) select h, new.user_id from public.identity_hashes(new.user_id) h
    on conflict (hash) do update set user_id = excluded.user_id, created_at = now(), left_at = null;
  elsif new.suspended_at is null and old.suspended_at is not null then
    delete from public.banned_identities
    where hash in (select h from public.identity_hashes(new.user_id) h) or user_id = new.user_id;
  end if;
  return null;
end;
$$;
revoke execute on function public.track_suspension() from public, anon, authenticated;

drop trigger if exists profiles_track_suspension on public.profiles;
create trigger profiles_track_suspension after update of suspended_at on public.profiles
for each row execute function public.track_suspension();

-- 탈퇴(프로필이 지워짐)하면 그 사용자의 해시에 탈퇴 시각을 적는다. auth.users 를 지워 프로필이 함께 지워질 때도 돈다.
create or replace function public.mark_identity_left() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.banned_identities set left_at = now() where user_id = old.user_id;
  return null;
end;
$$;
revoke execute on function public.mark_identity_left() from public, anon, authenticated;

drop trigger if exists profiles_mark_identity_left on public.profiles;
create trigger profiles_mark_identity_left after delete on public.profiles
for each row execute function public.mark_identity_left();

-- 다시 가입할 때(프로필을 만들 때) 같은 해시가 살아 있으면 정지 상태로 만들고, 해시를 새 계정에 다시 묶는다 (left_at 은 비운다).
-- 맞은 해시뿐 아니라 그 해시가 묶여 있던 예전 계정의 해시 전부(다른 로그인 수단 해시)를 함께 옮긴다.
-- 그래야 정지를 풀거나(track_suspension) 운영자가 지울 때(admin_forget_identity) 한 사람의 해시가 한꺼번에 지워진다.
-- 먼저 보관 상한이 지난 해시(탈퇴한 지 1년이 지남)를 지운다.
create or replace function public.carry_suspension() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.banned_identities b
  where b.left_at is not null and b.left_at < now() - interval '1 year';
  if exists (select 1 from public.banned_identities b where b.hash in (select h from public.identity_hashes(new.user_id) h)) then
    new.suspended_at := now();
    update public.banned_identities set user_id = new.user_id, left_at = null
    where hash in (select h from public.identity_hashes(new.user_id) h)
       or user_id in (select m.user_id from public.banned_identities m
                      where m.hash in (select h from public.identity_hashes(new.user_id) h) and m.user_id is not null);
  end if;
  return new;
end;
$$;
revoke execute on function public.carry_suspension() from public, anon, authenticated;

drop trigger if exists profiles_carry_suspension on public.profiles;
create trigger profiles_carry_suspension before insert on public.profiles
for each row execute function public.carry_suspension();

-- 예전 판 보정 (이어서): 지금 정지 중인 계정의 해시를 새 형식으로 다시 적는다.
-- 사용자가 이미 탈퇴했는데 left_at 이 비어 있는 행(예전 판에서 적은 것)은 적은 시각을 탈퇴 시각으로 본다 (예전 보관 기준과 같다).
insert into public.banned_identities (hash, user_id)
select h, p.user_id from public.profiles p, public.identity_hashes(p.user_id) h
where p.suspended_at is not null
on conflict (hash) do update set user_id = excluded.user_id, left_at = null;
update public.banned_identities b set left_at = b.created_at
where b.left_at is null and not exists (select 1 from public.profiles pr where pr.user_id = b.user_id);

-- 운영자: 정지 이어 가기 기록을 지운다 (탈퇴한 사람이 지워 달라고 요청했을 때 등). 지금 정지 중인 계정의 정지 자체는 풀지 않는다 (admin_unsuspend 를 쓴다).
--   p_email: 그 이메일의 해시. 네이버 가입자는 이메일이 n<해시>@naver.high-press.workers.dev 꼴이므로 Auth 대시보드에 보이는 주소를 쓴다.
--   p_hash: 해시 값(64자리 16진수) 그대로. 계정이 이미 없어 이메일을 모를 때 banned_identities 의 값을 쓴다.
-- 둘 중 하나는 있어야 한다 (둘 다 없거나 해시 꼴이 틀리면 bad_request). 고른 해시와 같은 사용자(user_id)에게 묶인 해시 전부,
-- 그 이메일로 가입한 계정이 지금 있으면 그 계정의 로그인 수단 해시와 그 계정에 묶인 해시도 함께 지운다.
drop function if exists public.admin_forget_identity(text);
create or replace function public.admin_forget_identity(p_email text default null, p_hash text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := nullif(btrim(coalesce(p_email, '')), '');
  v_hash text := lower(nullif(btrim(coalesce(p_hash, '')), ''));
  picked text[];
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  if (v_email is null and v_hash is null) or (v_hash is not null and v_hash !~ '^[0-9a-f]{64}$') then
    raise exception 'bad_request' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(x.h), '{}') into picked
  from (
    select v_hash as h where v_hash is not null
    union
    select public.identity_hash('email', v_email) where v_email is not null
    union
    select h from auth.users u, public.identity_hashes(u.id) h where v_email is not null and lower(u.email) = lower(v_email)
  ) x;
  delete from public.banned_identities b
  where b.hash = any (picked)
     or b.user_id in (select s.user_id from public.banned_identities s where s.hash = any (picked) and s.user_id is not null)
     or b.user_id in (select u.id from auth.users u where v_email is not null and lower(u.email) = lower(v_email));
end;
$$;
revoke execute on function public.admin_forget_identity(text, text) from public, anon;
grant execute on function public.admin_forget_identity(text, text) to authenticated;

-- ── 정기 정리에 더한다 (0001 의 football-column-cleanup) ────────────────
-- 탈퇴한 지 1년이 지난 정지 해시를 매일 지운다. 같은 이름으로 다시 예약하면 예전 작업을 덮어쓴다 (0001 의 네 줄은 그대로 둔다).
-- pg_cron 이 없는 환경에서는 건너뛴다 (그때는 가입 검사가 돌 때 지워지고, README 의 수동 정리 문장을 쓴다).
do $$
begin
  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'football-column-cleanup',
      '17 3 * * *',
      $job$
        delete from public.drafts where updated_at < now() - interval '7 days';
        delete from public.user_usage where day < current_date - 30;
        delete from public.api_budget where day < current_date - 30;
        delete from public.stat_cache where key like 'current-%' and saved_at < now() - interval '30 days';
        delete from public.banned_identities where left_at is not null and left_at < now() - interval '1 year';
      $job$
    );
  else
    raise notice 'pg_cron 이 없어 정기 정리에 정지 해시 정리를 더하지 못했습니다.';
  end if;
exception when others then
  raise notice 'pg_cron 정기 정리를 고치지 못했습니다: %', sqlerrm;
end;
$$;

-- 글이 지금 사용자에게 보이는지: 숨기지 않았거나 자기 글이고, 차단한 사람의 글이 아니다.
create or replace function public.post_shown(p_user uuid, p_hidden_at timestamptz) returns boolean
language sql stable security definer set search_path = '' as $$
  select (p_hidden_at is null or coalesce(p_user = auth.uid(), false)) and not public.is_blocked(p_user);
$$;
revoke execute on function public.post_shown(uuid, timestamptz) from public, anon, authenticated;

-- 댓글이 지금 사용자에게 내용째 보이는지: 지우지 않았고, 숨기지 않았거나 자기 댓글이고, 차단한 사람의 댓글이 아니다.
create or replace function public.comment_shown(p_user uuid, p_hidden_at timestamptz, p_deleted_at timestamptz) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_deleted_at is null
     and (p_hidden_at is null or coalesce(p_user = auth.uid(), false))
     and not public.is_blocked(p_user);
$$;
revoke execute on function public.comment_shown(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- 댓글이 목록에 자리로라도 나오는지: 내용째 보이거나, 지워진 자리이거나, 답글이 달려 있다 (답글이 떠 있지 않게 자리만 남긴다).
create or replace function public.comment_listed(p_id uuid, p_user uuid, p_hidden_at timestamptz, p_deleted_at timestamptz) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_deleted_at is not null
      or public.comment_shown(p_user, p_hidden_at, p_deleted_at)
      or exists (select 1 from public.post_comments r where r.parent_id = p_id);
$$;
revoke execute on function public.comment_listed(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- ── 표 직접 읽기: 숨긴 글 · 댓글은 글쓴이와 운영자만 본다 ─────────────────
drop policy if exists "posts: 가입자 조회" on public.posts;
create policy "posts: 가입자 조회" on public.posts for select to authenticated
  using (public.is_member() and (hidden_at is null or (select auth.uid()) = user_id or public.is_admin()));

-- 댓글은 부모 글이 보일 때만 보인다 (L2). 안쪽의 posts 읽기에도 posts 규칙이 걸리므로 숨긴 글의 댓글은 남에게 나오지 않는다.
drop policy if exists "post_comments: 가입자 조회" on public.post_comments;
create policy "post_comments: 가입자 조회" on public.post_comments for select to authenticated
  using (public.is_member()
         and (hidden_at is null or (select auth.uid()) = user_id or public.is_admin())
         and exists (select 1 from public.posts p where p.id = post_id));

-- ── 보관함 규칙 (0008 · 0009 · 0011 을 고친다) ───────────────────────────
-- post-covers 는 비공개 보관함이다(0008, public = false). 그래서 아래 읽기 규칙이 곧 파일을 받을 수 있는지다 (M3).
--   웹 · 앱은 download(<글쓴이>/<칼럼>) 로 받는다. 숨기지 않은 글의 사진은 지금처럼 누구나 받고, 숨긴 글의 사진은 글쓴이 · 운영자만 받는다.
--   목록(list)도 같은 규칙을 거치므로 남의 폴더를 열면 보이는 글의 사진 이름만 나온다 (그 이름은 피드에 이미 공개돼 있다).
-- 올리기 · 바꾸기에는 정지 여부를 더한다 (M4). avatars 는 공개 보관함이라(0011) 주소를 아는 사람은 누구나 읽는다.
drop policy if exists "post-covers: 누구나 조회" on storage.objects;
drop policy if exists "post-covers: 보이는 글의 사진 조회" on storage.objects;
create policy "post-covers: 보이는 글의 사진 조회" on storage.objects for select to anon, authenticated
  using (bucket_id = 'post-covers' and public.cover_visible(name));

drop policy if exists "post-covers: 본인만 올리기" on storage.objects;
create policy "post-covers: 본인만 올리기" on storage.objects for insert to authenticated
  with check (bucket_id = 'post-covers' and public.is_member() and public.is_own_cover(name)
              and not public.me_suspended()
              and public.cover_count((select auth.uid())) < 20);
drop policy if exists "post-covers: 본인만 바꾸기" on storage.objects;
create policy "post-covers: 본인만 바꾸기" on storage.objects for update to authenticated
  using (bucket_id = 'post-covers' and public.is_own_cover(name))
  with check (bucket_id = 'post-covers' and public.is_member() and public.is_own_cover(name) and not public.me_suspended());

drop policy if exists "avatars: 본인만 올리기" on storage.objects;
create policy "avatars: 본인만 올리기" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and public.is_member()
              and (storage.foldername(name))[1] = (select auth.uid())::text
              and not public.me_suspended()
              and public.avatar_count((select auth.uid())) < 3);

-- ── 쓰기 검사: 정지 · 차단 · 금칙어 ──────────────────────────────────────
-- 글: 정지된 계정은 올리거나 고치지 못한다. 제목 · 요약 · 본문 글자에 금칙어가 있으면 받지 않는다 (바뀐 칸만 본다).
create or replace function public.moderate_post() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.is_suspended(new.user_id) then
    raise exception 'suspended' using errcode = 'P0001';
  end if;
  if (tg_op = 'INSERT' or new.title is distinct from old.title) and public.has_banned_word(new.title)
     or (tg_op = 'INSERT' or new.excerpt is distinct from old.excerpt) and public.has_banned_word(new.excerpt)
     or (tg_op = 'INSERT' or new.body is distinct from old.body) and public.has_banned_word(public.doc_text(new.body)) then
    raise exception 'banned_word' using errcode = 'P0001';
  end if;
  -- 운영자가 restore 한 글을 글쓴이가 고치면 다시 자동 숨김 대상이 된다 (M6).
  if tg_op = 'UPDATE' and (new.title is distinct from old.title or new.excerpt is distinct from old.excerpt
                           or new.body is distinct from old.body or new.cover is distinct from old.cover) then
    new.restored_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists posts_moderate on public.posts;
create trigger posts_moderate before insert or update of title, excerpt, body, club, cover, column_id on public.posts
for each row execute function public.moderate_post();

-- 댓글: 정지된 계정, 글쓴이(답글이면 윗댓글 쓴이)에게 차단된 사람, 금칙어가 든 댓글을 받지 않는다.
-- 댓글은 고칠 수 없으므로(0003) 새로 쓸 때만 본다. 운영자 · 본인이 지우는 것(delete_comment)은 막지 않는다.
create or replace function public.moderate_comment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.is_suspended(new.user_id) then
    raise exception 'suspended' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.blocks b
    where b.blocked = new.user_id
      and (b.blocker = (select p.user_id from public.posts p where p.id = new.post_id)
           or (new.parent_id is not null and b.blocker = (select c.user_id from public.post_comments c where c.id = new.parent_id)))
  ) then
    raise exception 'blocked' using errcode = 'P0001';
  end if;
  if public.has_banned_word(new.body) then
    raise exception 'banned_word' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists post_comments_moderate on public.post_comments;
create trigger post_comments_moderate before insert on public.post_comments
for each row execute function public.moderate_comment();

-- 팔로우: 정지된 계정은 못 하고, 둘 중 한쪽이 다른 쪽을 차단했으면 못 한다.
create or replace function public.moderate_follow() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.is_suspended(new.follower_id) then
    raise exception 'suspended' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.blocks b
    where (b.blocker = new.followee_id and b.blocked = new.follower_id)
       or (b.blocker = new.follower_id and b.blocked = new.followee_id)
  ) then
    raise exception 'blocked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists follows_moderate on public.follows;
create trigger follows_moderate before insert on public.follows
for each row execute function public.moderate_follow();

-- 프로필: 정지된 계정은 닉네임 · 소개를 바꾸거나 새 프로필 사진을 넣지 못한다 (사진 빼기는 된다).
-- 운영자가 함수로 소개 · 사진을 지울 때(본인이 아님)는 막지 않는다. 닉네임 · 소개에 금칙어가 있으면 받지 않는다 (바뀐 칸만 본다).
create or replace function public.moderate_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.suspended_at is not null and coalesce(new.user_id = auth.uid(), false)
     and (new.nickname is distinct from old.nickname
          or new.bio is distinct from old.bio
          or (new.avatar is distinct from old.avatar and new.avatar is not null)) then
    raise exception 'suspended' using errcode = 'P0001';
  end if;
  if (tg_op = 'INSERT' or new.nickname is distinct from old.nickname) and public.has_banned_word(new.nickname)
     or (tg_op = 'INSERT' or new.bio is distinct from old.bio) and public.has_banned_word(new.bio) then
    raise exception 'banned_word' using errcode = 'P0001';
  end if;
  -- 운영자가 restore 한 사용자가 본인 소개 · 사진을 바꾸면 다시 자동 숨김 대상이 된다 (M6).
  if tg_op = 'UPDATE' and coalesce(new.user_id = auth.uid(), false)
     and (new.bio is distinct from old.bio or new.avatar is distinct from old.avatar or new.nickname is distinct from old.nickname) then
    new.restored_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_moderate on public.profiles;
create trigger profiles_moderate before insert or update of nickname, bio, avatar on public.profiles
for each row execute function public.moderate_profile();

-- 좋아요 (L9): 정지된 계정은 누르지 못하고(suspended), 글쓴이 · 댓글 쓴이에게 차단된 사람은 그 글 · 댓글에 누르지 못한다(blocked).
create or replace function public.moderate_post_like() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.is_suspended(new.user_id) then
    raise exception 'suspended' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.blocks b join public.posts p on p.user_id = b.blocker
    where p.id = new.post_id and b.blocked = new.user_id
  ) then
    raise exception 'blocked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists post_likes_moderate on public.post_likes;
create trigger post_likes_moderate before insert on public.post_likes
for each row execute function public.moderate_post_like();

create or replace function public.moderate_comment_like() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.is_suspended(new.user_id) then
    raise exception 'suspended' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.blocks b join public.post_comments c on c.user_id = b.blocker
    where c.id = new.comment_id and b.blocked = new.user_id
  ) then
    raise exception 'blocked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists comment_likes_moderate on public.comment_likes;
create trigger comment_likes_moderate before insert on public.comment_likes
for each row execute function public.moderate_comment_like();

-- ── 예전 탈퇴 함수 (L4) ──────────────────────────────────────────────────
-- 탈퇴는 서버 함수 account-delete 가 사진 → 계정 순서로 한곳에서 한다. 사진을 남기는 예전 경로는 닫는다.
revoke execute on function public.delete_my_account() from public, anon, authenticated;

-- ── restore 면제가 아직 유효한지 (M6 · N1) ───────────────────────────────
-- 운영자가 restore 한 뒤 대상이 바뀌지 않았을 때만 자동 숨김을 건너뛴다.
--   글: restored_at 이 있고, 대표 사진 파일(post-covers 의 posts.cover)이 그 뒤에 올라가거나 바뀌지 않았다.
--       (글 칸을 고치면 moderate_post 가 restored_at 을 지운다. 같은 위치에 사진만 다시 올리는 경우를 여기서 잡는다.)
--   댓글: restored_at 이 있다 (댓글은 고칠 수 없다).
--   사용자: restored_at 이 있고, 프로필 사진 파일(avatars 의 profiles.avatar)이 그 뒤에 올라가거나 바뀌지 않았다.
--       (닉네임 · 소개 · 사진 칸을 고치면 moderate_profile 이 restored_at 을 지운다. 같은 이름으로 파일만 바꾸는 경우를 여기서 잡는다.)
create or replace function public.restore_holds(p_kind text, p_target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_kind
    when 'post' then exists (
      select 1 from public.posts p
      where p.id = p_target and p.restored_at is not null
        and not exists (select 1 from storage.objects o
                        where o.bucket_id = 'post-covers' and o.name = p.cover
                          and greatest(o.created_at, o.updated_at) > p.restored_at))
    when 'comment' then exists (
      select 1 from public.post_comments c where c.id = p_target and c.restored_at is not null)
    when 'user' then exists (
      select 1 from public.profiles pr
      where pr.user_id = p_target and pr.restored_at is not null
        and not exists (select 1 from storage.objects o
                        where o.bucket_id = 'avatars' and o.name = pr.avatar
                          and greatest(o.created_at, o.updated_at) > pr.restored_at))
    else false
  end;
$$;
revoke execute on function public.restore_holds(text, uuid) from public, anon, authenticated;

-- ── 신고하기 ─────────────────────────────────────────────────────────────
-- 서로 다른 3명의 열린 신고가 모이면 그 자리에서 숨긴다 (D10). 운영자가 처리해 닫힌 신고는 세지 않는다.
-- 세는 규칙은 파일 맨 위의 "자동 숨김 남용 완화" (가입 72시간, restore, 운영자 계정).
create or replace function public.report_content(
  p_kind text,
  p_target uuid,
  p_reason text,
  p_detail text default null,
  p_part text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  author uuid;
  note text := nullif(btrim(coalesce(p_detail, '')), '');
begin
  if me is null or not public.is_member() then
    raise exception 'not_member' using errcode = 'P0001';
  end if;
  if public.is_suspended(me) then
    raise exception 'suspended' using errcode = 'P0001';
  end if;
  if p_kind is null or p_kind not in ('post', 'comment', 'user')
     or p_target is null
     or p_reason is null or p_reason not in ('spam', 'abuse', 'hate', 'sexual', 'illegal', 'other')
     or (p_part is not null and not ((p_kind = 'post' and p_part = 'cover') or (p_kind = 'user' and p_part = 'avatar')))
     or char_length(coalesce(note, '')) > 300 then
    raise exception 'bad_report' using errcode = 'P0001';
  end if;

  if p_kind = 'post' then
    select p.user_id into author from public.posts p where p.id = p_target;
  elsif p_kind = 'comment' then
    select c.user_id into author from public.post_comments c where c.id = p_target and c.deleted_at is null;
  else
    select pr.user_id into author from public.profiles pr where pr.user_id = p_target;
  end if;
  if author is null then
    raise exception 'bad_report' using errcode = 'P0001';
  end if;
  if author = me then
    raise exception 'self_report' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.reports r where r.reporter = me and r.target_kind = p_kind and r.target_id = p_target) then
    raise exception 'already_reported' using errcode = 'P0001';
  end if;
  if (select count(*) from public.reports r where r.reporter = me and r.created_at > now() - interval '1 day') >= 30 then
    raise exception 'report_quota' using errcode = 'P0001';
  end if;
  if public.db_full() then
    raise exception 'server_full' using errcode = 'P0001';
  end if;

  insert into public.reports (reporter, target_kind, target_id, part, reason, detail)
  values (me, p_kind, p_target, p_part, p_reason, note);

  -- 자동 숨김 (M6): 운영자 계정의 것은 빼고, 운영자가 restore 한 것도 뺀다.
  -- 가입한 지 72시간이 넘은 서로 다른 신고자의 열린 신고만 센다.
  if public.is_admin_user(author) then
    return;
  end if;
  if public.restore_holds(p_kind, p_target) then
    return;
  end if;
  if (select count(distinct r.reporter) from public.reports r
      join public.profiles who on who.user_id = r.reporter
      where r.target_kind = p_kind and r.target_id = p_target and r.resolved_at is null
        and who.created_at <= now() - interval '72 hours') >= 3 then
    if p_kind = 'post' then
      update public.posts set hidden_at = coalesce(hidden_at, now()) where id = p_target;
    elsif p_kind = 'comment' then
      update public.post_comments set hidden_at = coalesce(hidden_at, now()) where id = p_target;
    else
      update public.profiles set hidden_at = coalesce(hidden_at, now()) where user_id = p_target;
    end if;
  end if;
end;
$$;
revoke execute on function public.report_content(text, uuid, text, text, text) from public, anon;
grant execute on function public.report_content(text, uuid, text, text, text) to authenticated;

-- ── 차단하기 · 풀기 · 목록 ───────────────────────────────────────────────
-- 차단하면 서로의 팔로우가 풀린다. 한 사람이 차단할 수 있는 수는 500명까지. 이미 차단했으면 아무 일도 없다.
create or replace function public.block_user(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null or not public.is_member() then
    raise exception 'not_member' using errcode = 'P0001';
  end if;
  if p_user is null or p_user = me then
    raise exception 'self_block' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles pr where pr.user_id = p_user) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.blocks b where b.blocker = me and b.blocked = p_user)
     and (select count(*) from public.blocks b where b.blocker = me) >= 500 then
    raise exception 'block_quota' using errcode = 'P0001';
  end if;
  insert into public.blocks (blocker, blocked) values (me, p_user) on conflict do nothing;
  delete from public.follows f
  where (f.follower_id = me and f.followee_id = p_user) or (f.follower_id = p_user and f.followee_id = me);
end;
$$;
revoke execute on function public.block_user(uuid) from public, anon;
grant execute on function public.block_user(uuid) to authenticated;

create or replace function public.unblock_user(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null or not public.is_member() then
    raise exception 'not_member' using errcode = 'P0001';
  end if;
  if p_user is null or p_user = me then
    raise exception 'self_block' using errcode = 'P0001';
  end if;
  delete from public.blocks b where b.blocker = me and b.blocked = p_user;
end;
$$;
revoke execute on function public.unblock_user(uuid) from public, anon;
grant execute on function public.unblock_user(uuid) to authenticated;

-- 내가 차단한 사람들. 최근에 차단한 사람부터. 신고로 숨겨진 사용자의 사진은 비워서 준다.
create or replace function public.my_blocks()
returns table (
  user_id uuid,
  nickname text,
  avatar text,
  blocked_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select pr.user_id, pr.nickname, case when pr.hidden_at is null then pr.avatar end, b.created_at
  from public.blocks b
  join public.profiles pr on pr.user_id = b.blocked
  where b.blocker = auth.uid()
  order by b.created_at desc
  limit 500;
$$;
revoke execute on function public.my_blocks() from public, anon;
grant execute on function public.my_blocks() to authenticated;

-- ── 운영자: 신고 목록 ────────────────────────────────────────────────────
-- 같은 대상에 대한 신고를 하나로 묶는다. open: 아직 처리하지 않은 신고, closed: 처리한 신고 (최근 것부터 200묶음).
-- 대상이 이미 지워졌으면 preview · author 칸이 비어 온다 (dismiss 로 닫는다).
-- details: 그 묶음의 신고 내용(detail) 가운데 비어 있지 않은 것, 최근 것부터 3개까지. 운영자가 처리하려고 본다.
drop function if exists public.admin_reports(text);
create function public.admin_reports(p_status text default 'open')
returns table (
  kind text,
  target_id uuid,
  parts text[],
  reasons jsonb,
  report_count bigint,
  first_at timestamptz,
  last_at timestamptz,
  hidden boolean,
  preview text,
  author_id uuid,
  author_nickname text,
  author_suspended boolean,
  post_id uuid,
  details text[]
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  return query
  with picked as (
    select r.target_kind as t_kind, r.target_id as t_id, r.part as t_part, r.reason as t_reason, r.created_at as t_at,
           nullif(btrim(coalesce(r.detail, '')), '') as t_detail
    from public.reports r
    where case when p_status = 'closed' then r.resolved_at is not null else r.resolved_at is null end
  ),
  grouped as (
    select g.t_kind, g.t_id,
           coalesce(array_agg(distinct g.t_part) filter (where g.t_part is not null), '{}'::text[]) as g_parts,
           count(*) as g_count, min(g.t_at) as g_first, max(g.t_at) as g_last
    from picked g
    group by g.t_kind, g.t_id
  ),
  why as (
    select x.t_kind, x.t_id, jsonb_object_agg(x.t_reason, x.n) as g_reasons
    from (select q.t_kind, q.t_id, q.t_reason, count(*) as n from picked q group by q.t_kind, q.t_id, q.t_reason) x
    group by x.t_kind, x.t_id
  )
  select
    g.t_kind,
    g.t_id,
    g.g_parts,
    coalesce(w.g_reasons, '{}'::jsonb),
    g.g_count,
    g.g_first,
    g.g_last,
    coalesce(case g.t_kind
      when 'post' then p.hidden_at is not null
      when 'comment' then c.hidden_at is not null
      else u.hidden_at is not null end, false),
    left(coalesce(case g.t_kind
      when 'post' then p.title
      when 'comment' then case when c.deleted_at is null then c.body else '' end
      else u.nickname || case when coalesce(u.bio, '') <> '' then ' · ' || u.bio else '' end end, ''), 120),
    u.user_id,
    coalesce(u.nickname, ''),
    coalesce(u.suspended_at is not null, false),
    case when g.t_kind = 'post' then p.id end,
    coalesce((
      select array_agg(d.t_detail order by d.t_at desc)
      from (select q.t_detail, q.t_at from picked q
            where q.t_kind = g.t_kind and q.t_id = g.t_id and q.t_detail is not null
            order by q.t_at desc limit 3) d
    ), '{}'::text[])
  from grouped g
  left join why w on w.t_kind = g.t_kind and w.t_id = g.t_id
  left join public.posts p on g.t_kind = 'post' and p.id = g.t_id
  left join public.post_comments c on g.t_kind = 'comment' and c.id = g.t_id
  left join public.profiles u on u.user_id = case g.t_kind when 'post' then p.user_id when 'comment' then c.user_id else g.t_id end
  order by g.g_last desc
  limit 200;
end;
$$;
revoke execute on function public.admin_reports(text) from public, anon;
grant execute on function public.admin_reports(text) to authenticated;

-- ── 운영자: 신고 처리 ────────────────────────────────────────────────────
-- restore: 다시 보이게(그 뒤로 자동 숨김 안 함), delete: 지우기, suspend: 글쓴이 이용 정지 + 대상 숨김, dismiss: 보이는 상태는 그대로 두고 신고만 닫기.
-- 어느 것이든 그 대상의 열린 신고를 모두 닫는다.
-- delete 는 행만 지운다. 보관함의 사진 파일(post-covers/<글쓴이>/<칼럼>, avatars/<사용자>/…)은 화면이 Storage API 로 지운다
-- (Supabase 는 SQL 로 보관함 파일을 지우는 것을 막는다). 사용자 delete 는 소개와 프로필 사진 칸을 비우고 숨김을 푼다.
create or replace function public.admin_resolve_report(p_kind text, p_target uuid, p_action text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  author uuid;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  if p_action is null or p_action not in ('restore', 'delete', 'suspend', 'dismiss') then
    raise exception 'bad_action' using errcode = 'P0001';
  end if;
  if p_kind is null or p_kind not in ('post', 'comment', 'user') or p_target is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  if p_kind = 'post' then
    select p.user_id into author from public.posts p where p.id = p_target;
  elsif p_kind = 'comment' then
    select c.user_id into author from public.post_comments c where c.id = p_target;
  else
    select pr.user_id into author from public.profiles pr where pr.user_id = p_target;
  end if;
  if author is null and (p_action <> 'dismiss'
     or not exists (select 1 from public.reports r where r.target_kind = p_kind and r.target_id = p_target)) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  if p_action = 'restore' then
    -- restored_at: 운영자가 괜찮다고 본 대상이다. 다시 자동으로 숨지 않는다 (M6). 글쓴이가 고치면 풀린다.
    if p_kind = 'post' then
      update public.posts set hidden_at = null, restored_at = now() where id = p_target;
    elsif p_kind = 'comment' then
      update public.post_comments set hidden_at = null, restored_at = now() where id = p_target;
    else
      update public.profiles set hidden_at = null, restored_at = now() where user_id = p_target;
    end if;
  elsif p_action = 'delete' then
    if p_kind = 'post' then
      delete from public.posts where id = p_target;
    elsif p_kind = 'comment' then
      -- 답글이 달려 있으면 자리만 남기는 규칙(0010)을 그대로 쓴다.
      perform public.delete_comment(p_target);
    else
      update public.profiles set bio = '', avatar = null, hidden_at = null where user_id = p_target;
    end if;
  elsif p_action = 'suspend' then
    update public.profiles set suspended_at = coalesce(suspended_at, now()) where user_id = author;
    if p_kind = 'post' then
      update public.posts set hidden_at = coalesce(hidden_at, now()) where id = p_target;
    elsif p_kind = 'comment' then
      update public.post_comments set hidden_at = coalesce(hidden_at, now()) where id = p_target;
    else
      update public.profiles set hidden_at = coalesce(hidden_at, now()) where user_id = p_target;
    end if;
  end if;

  update public.reports set resolved_at = now(), resolution = p_action
  where target_kind = p_kind and target_id = p_target and resolved_at is null;
end;
$$;
revoke execute on function public.admin_resolve_report(text, uuid, text) from public, anon;
grant execute on function public.admin_resolve_report(text, uuid, text) to authenticated;

-- ── 운영자: 정지 풀기 ────────────────────────────────────────────────────
create or replace function public.admin_unsuspend(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  update public.profiles set suspended_at = null where user_id = p_user;
end;
$$;
revoke execute on function public.admin_unsuspend(uuid) from public, anon;
grant execute on function public.admin_unsuspend(uuid) to authenticated;

-- ── 운영자: 금칙어 ───────────────────────────────────────────────────────
create or replace function public.admin_banned_words() returns setof text
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  return query select w.word from public.banned_words w order by w.word;
end;
$$;
revoke execute on function public.admin_banned_words() from public, anon;
grant execute on function public.admin_banned_words() to authenticated;

-- 비교할 꼴(moderation_text)로 바꿔 넣는다. 남는 글자가 없거나 30자를 넘으면 bad_word. 이미 있으면 아무 일도 없다.
create or replace function public.admin_add_banned_word(p_word text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  clean text := public.moderation_text(p_word);
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  if char_length(clean) not between 1 and 30 then
    raise exception 'bad_word' using errcode = 'P0001';
  end if;
  insert into public.banned_words (word) values (clean) on conflict (word) do nothing;
end;
$$;
revoke execute on function public.admin_add_banned_word(text) from public, anon;
grant execute on function public.admin_add_banned_word(text) to authenticated;

create or replace function public.admin_remove_banned_word(p_word text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  delete from public.banned_words where word = p_word or word = public.moderation_text(p_word);
end;
$$;
revoke execute on function public.admin_remove_banned_word(text) from public, anon;
grant execute on function public.admin_remove_banned_word(text) to authenticated;

-- ── 피드 함수에 숨김 · 차단 반영 (0011 의 정의를 고친다) ──────────────────
-- 차단한 사람의 글 · 댓글 · 프로필은 차단한 사람에게 나오지 않는다. 숨긴 글 · 댓글은 글쓴이에게만 나오고, 그때 hidden 이 true 다.
-- 신고로 숨겨진 사용자의 프로필 사진 · 소개는 남에게 비워서 준다 (본인에게는 그대로).
-- 돌려주는 칸이 늘어난 feed_page · post_comment_list 는 지우고 다시 만든다. 받는 값은 0011 과 같다.

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
  avatar text,
  hidden boolean
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
    (select count(*) from public.post_comments c where c.post_id = p.id and public.comment_listed(c.id, c.user_id, c.hidden_at, c.deleted_at)),
    exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    p.club,
    p.cover,
    case when pr.hidden_at is null or pr.user_id = auth.uid() then pr.avatar end,
    p.hidden_at is not null
  from public.posts p
  join public.profiles pr on pr.user_id = p.user_id
  where public.post_shown(p.user_id, p.hidden_at)
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
revoke execute on function public.feed_page(timestamptz, uuid, int, text, boolean, text, text[], text, int) from public;
grant execute on function public.feed_page(timestamptz, uuid, int, text, boolean, text, text[], text, int) to anon, authenticated;

-- 인기 칼럼리스트: 차단한 사람은 빼고, 숨긴 글은 세지 않는다.
create or replace function public.popular_columnists(p_limit int default 10)
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
    case when pr.hidden_at is null or pr.user_id = auth.uid() then pr.avatar end
  from public.profiles pr
  join public.posts p on p.user_id = pr.user_id and p.hidden_at is null
  where not public.is_blocked(pr.user_id)
  group by pr.user_id
  order by like_count desc, max(p.created_at) desc
  limit least(greatest(coalesce(p_limit, 10), 1), 30);
$$;
revoke execute on function public.popular_columnists(int) from public;
grant execute on function public.popular_columnists(int) to anon, authenticated;

-- 프로필 한 장: 차단한 사람이면 없는 것처럼 아무것도 돌려주지 않는다. 숨겨진 사용자의 소개 · 사진은 본인과 운영자에게만 준다.
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
  fresh boolean,
  avatar text
)
language sql stable security definer set search_path = '' as $$
  select
    pr.user_id,
    pr.nickname,
    case when pr.hidden_at is null or pr.user_id = auth.uid() or public.is_admin() then pr.bio else '' end,
    pr.club,
    case when auth.uid() is null then null else pr.last_seen_at end,
    (select count(*) from public.posts p where p.user_id = pr.user_id and (p.hidden_at is null or p.user_id = auth.uid())),
    (select count(*) from public.follows f where f.followee_id = pr.user_id),
    (select count(*) from public.follows f where f.follower_id = pr.user_id),
    (select count(*) from public.post_likes l join public.posts p on p.id = l.post_id where p.user_id = pr.user_id),
    exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = pr.user_id),
    exists (select 1 from public.posts p where p.user_id = pr.user_id and p.created_at > now() - interval '7 days'
            and (p.hidden_at is null or p.user_id = auth.uid())),
    case when pr.hidden_at is null or pr.user_id = auth.uid() or public.is_admin() then pr.avatar end
  from public.profiles pr
  where pr.user_id = p_user
    and not public.is_blocked(pr.user_id);
$$;
revoke execute on function public.profile_summary(uuid) from public;
grant execute on function public.profile_summary(uuid) to anon, authenticated;

-- 칼럼리스트 찾기: 차단한 사람은 빼고, 숨긴 글은 세지 않는다.
create or replace function public.search_columnists(p_query text, p_limit int default 8)
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
    (select count(*) from public.posts p where p.user_id = pr.user_id and (p.hidden_at is null or p.user_id = auth.uid())) as post_count,
    exists (select 1 from public.posts p where p.user_id = pr.user_id and p.created_at > now() - interval '7 days'
            and (p.hidden_at is null or p.user_id = auth.uid())),
    case when pr.hidden_at is null or pr.user_id = auth.uid() then pr.avatar end
  from public.profiles pr
  where public.search_pattern(p_query) is not null
    and pr.nickname ilike public.search_pattern(p_query)
    and not public.is_blocked(pr.user_id)
  order by case when auth.uid() is null then null else pr.last_seen_at end desc nulls last, post_count desc, pr.nickname
  limit least(greatest(coalesce(p_limit, 8), 1), 20);
$$;
revoke execute on function public.search_columnists(text, int) from public;
grant execute on function public.search_columnists(text, int) to anon, authenticated;

-- 글 한 편의 본문: 숨긴 글은 글쓴이와 운영자에게만, 차단한 사람의 글은 null.
-- 돌려주는 꼴(jsonb 본문)은 그대로 둔다. 글이 숨겨졌는지는 feed_page 의 hidden 으로 안다.
create or replace function public.post_body(p_post uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select p.body from public.posts p
  where p.id = p_post
    and (public.post_shown(p.user_id, p.hidden_at) or public.is_admin());
$$;
revoke execute on function public.post_body(uuid) from public;
grant execute on function public.post_body(uuid) to anon, authenticated;

-- 글 한 편의 댓글: 글이 보이지 않으면 빈 목록. 숨긴 댓글 · 차단한 사람의 댓글은 빼고,
-- 거기에 답글이 달려 있으면 지워진 자리(deleted, 글쓴이 · 내용 · 사진 없음)로 남긴다. 자기 댓글이 숨겨졌으면 hidden 이 true.
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
  avatar text,
  hidden boolean
)
language sql stable security definer set search_path = '' as $$
  select
    v.id,
    case when v.shown then v.user_id end,
    case when v.shown then v.nickname else '' end,
    case when v.shown then v.body else '' end,
    v.created_at,
    v.parent_id,
    case when v.shown then (select count(*) from public.comment_likes l where l.comment_id = v.id) else 0 end,
    v.shown and exists (select 1 from public.comment_likes l where l.comment_id = v.id and l.user_id = auth.uid()),
    not v.shown,
    case when v.shown and (v.profile_hidden_at is null or v.user_id = auth.uid()) then v.avatar end,
    v.shown and v.hidden_at is not null
  from (
    select
      c.id, c.user_id, pr.nickname, c.body, c.created_at, c.parent_id, c.hidden_at,
      pr.avatar, pr.hidden_at as profile_hidden_at,
      coalesce(public.comment_shown(c.user_id, c.hidden_at, c.deleted_at), false) as shown
    from public.post_comments c
    join public.profiles pr on pr.user_id = c.user_id
    where c.post_id = p_post
      and public.comment_listed(c.id, c.user_id, c.hidden_at, c.deleted_at)
      and exists (select 1 from public.posts p where p.id = p_post and (public.post_shown(p.user_id, p.hidden_at) or public.is_admin()))
  ) v
  order by v.created_at
  limit 200;
$$;
revoke execute on function public.post_comment_list(uuid) from public;
grant execute on function public.post_comment_list(uuid) to anon, authenticated;
