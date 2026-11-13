-- 배포 전 점검 (SEC-12): 한 계정이 다른 계정의 데이터에 닿을 수 없는지 확인한다.
-- Supabase SQL Editor 에 전체를 붙여 넣고 Run 한다. 결과 표의 result 가 전부 PASS 여야 한다.
-- 가짜 사용자(A, B, D, E, F, 점검용 운영자 Z, 정지 이어 가기용 G · H 와 그 재가입 계정)를 만들어 시험한 뒤 모두 지운다(딸린 프로필·초안·신고·차단도 함께 지워진다). 실제 사용자의 데이터는 건드리지 않는다.
-- 점검 동안만 운영자 목록(admin_emails)에 rls-admin@example.invalid 를 더했다가 끝에서 뺀다.
-- 중간에 오류가 나면 전체가 취소되어 아무것도 남지 않는다. 혹시 가짜 데이터가 남았더라도 다음 실행이 시작할 때 먼저 치운다.
-- (가입자 상한에 여섯 자리가 남아 있지 않으면 가짜 사용자를 만들지 못해 오류가 난다. 그때는 max_users 를 잠시 올리고 다시 한다.)
-- 0014_moderation.sql · 0015_app_support.sql 을 넣기 전에 돌리면 오류가 난다 (71 ~ 137번 항목이 그 둘을 시험한다).
-- 0016_naver_app.sql 도 먼저 넣는다 (138 ~ 143번: 앱 네이버 로그인의 받아 둔 로그인 표는 서버 함수만 쓴다).

begin;

-- 마이그레이션을 다 넣었는지 먼저 본다. 빠졌으면 알아보기 쉬운 문구로 멈춘다.
do $$
begin
  if to_regclass('public.banned_words') is null or to_regclass('public.reports') is null then
    raise exception '0014_moderation.sql 이 아직 반영되지 않았습니다. SQL Editor 에서 0014 → 0015 를 먼저 실행한 뒤 이 점검을 돌리세요 (supabase/README.md).';
  end if;
  if to_regprocedure('public.count_visit(text)') is null then
    raise exception '0015_app_support.sql 이 아직 반영되지 않았습니다. 0015 를 먼저 실행한 뒤 이 점검을 돌리세요.';
  end if;
  if to_regclass('public.naver_app_pending') is null then
    raise exception '0016_naver_app.sql 이 아직 반영되지 않았습니다. 0016 을 먼저 실행한 뒤 이 점검을 돌리세요.';
  end if;
end $$;

-- 앞선 점검이 중간에 끊겨 가짜 데이터가 남았을 수 있다. 시작 전에 점검용 것만 치운다 (실제 사용자와 무관한 고정 id · .invalid 주소).
delete from auth.users where id in ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000d',
  '00000000-0000-4000-8000-00000000000e', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-00000000000f',
  '00000000-0000-4000-8000-0000000000ad', '00000000-0000-4000-8000-000000000071', '00000000-0000-4000-8000-000000000072',
  '00000000-0000-4000-8000-000000000081', '00000000-0000-4000-8000-000000000082');
delete from public.banned_words where word = public.moderation_text('rls금칙어시험');
delete from public.banned_identities where hash in (public.identity_hash('email', 'rls-e@example.invalid'),
  public.identity_hash('email', 'rls-g@example.invalid'), public.identity_hash('google', 'rls-g-google-sub'),
  public.identity_hash('email', 'rls-h@example.invalid'), public.identity_hash('google', 'rls-h-google-sub'));
update public.app_config set value = value - 'rls-admin@example.invalid' where key = 'admin_emails';

drop table if exists check_result;
create temp table check_result (step int, name text, result text);
grant all on check_result to authenticated, anon;
-- rls_note: 바꾸기 전의 상태를 적어 두는 점검용 표 (129 · 131 · 132 · 135 · 137). check_result 처럼 여기서 만든다.
-- (on commit drop 으로 만들면 SQL Editor 가 문장마다 따로 커밋할 때 바로 지워져 "rls_note does not exist" 가 난다.)
drop table if exists rls_note;
create temp table rls_note (step int, hash text, n bigint);
grant select on rls_note to authenticated;

-- 가짜 사용자 A, B (0014 부터 신고 · 차단 시험용 D, E 도 만든다. 가입자 상한에 네 자리가 비어 있어야 한다)
insert into auth.users (id, aud, role, email, instance_id)
values
  ('00000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'rls-a@example.invalid', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-00000000000b', 'authenticated', 'authenticated', 'rls-b@example.invalid', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-00000000000d', 'authenticated', 'authenticated', 'rls-d@example.invalid', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-00000000000e', 'authenticated', 'authenticated', 'rls-e@example.invalid', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-00000000000f', 'authenticated', 'authenticated', 'rls-f@example.invalid', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-0000000000ad', 'authenticated', 'authenticated', 'rls-admin@example.invalid', '00000000-0000-0000-0000-000000000000');

-- 0014 부터: 시험용 금칙어 하나 (실제 목록과 무관하게 시험이 돌도록)와 점검용 운영자. 뒷정리에서 지운다.
insert into public.banned_words (word) values (public.moderation_text('rls금칙어시험')) on conflict do nothing;
update public.app_config set value = value || '["rls-admin@example.invalid"]'::jsonb where key = 'admin_emails';

-- A로 로그인한 것처럼: 프로필과 초안을 만든다.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated","email":"rls-a@example.invalid"}', true);
insert into public.profiles (nickname) values ('A');
insert into public.drafts (id, title, body, client_updated_at) values ('rls-a-draft', 'A의 글', '{"type":"doc"}', 1);
insert into check_result select 1, 'A는 자기 초안을 본다', case when (select count(*) from public.drafts) = 1 then 'PASS' else 'FAIL' end;

-- B로 바꾼다.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated","email":"rls-b@example.invalid"}', true);
insert into public.profiles (nickname) values ('B');
insert into check_result select 2, 'B는 A의 초안을 보지 못한다', case when (select count(*) from public.drafts) = 0 then 'PASS' else 'FAIL' end;
-- 0003_feed.sql 부터: 가입자끼리는 닉네임을 본다. 동의 시각 같은 나머지 칸은 읽지 못한다.
insert into check_result select 3, 'B는 가입자의 닉네임을 본다', case when (select count(*) from public.profiles) >= 2 then 'PASS' else 'FAIL' end;
do $$
begin
  perform agreed_at from public.profiles limit 1;
  insert into check_result values (31, 'B는 프로필의 동의 시각을 읽지 못한다', 'FAIL');
exception when others then
  insert into check_result values (31, 'B는 프로필의 동의 시각을 읽지 못한다', 'PASS');
end;
$$;

with changed as (update public.drafts set title = '가로챔' where id = 'rls-a-draft' returning 1)
insert into check_result select 4, 'B는 A의 초안을 고치지 못한다', case when (select count(*) from changed) = 0 then 'PASS' else 'FAIL' end;

with gone as (delete from public.drafts where id = 'rls-a-draft' returning 1)
insert into check_result select 5, 'B는 A의 초안을 지우지 못한다', case when (select count(*) from gone) = 0 then 'PASS' else 'FAIL' end;

-- B가 A의 이름으로 초안을 만들 수 없다.
do $$
begin
  insert into public.drafts (user_id, id, title, body, client_updated_at) values ('00000000-0000-4000-8000-00000000000a', 'rls-forged', '위조', '{"type":"doc"}', 1);
  insert into check_result values (6, 'B는 A의 이름으로 초안을 만들지 못한다', 'FAIL');
exception when others then
  insert into check_result values (6, 'B는 A의 이름으로 초안을 만들지 못한다', 'PASS');
end;
$$;

-- 서버 전용 테이블과 함수에 닿지 못한다.
insert into check_result select 7, 'B는 스탯 캐시를 보지 못한다', case when (select count(*) from public.stat_cache) = 0 then 'PASS' else 'FAIL' end;
insert into check_result select 8, 'B는 운영 설정을 보지 못한다', case when (select count(*) from public.app_config) = 0 then 'PASS' else 'FAIL' end;

do $$
begin
  perform public.bump_api_budget('x', 1);
  insert into check_result values (9, 'B는 예산 함수를 부르지 못한다', 'FAIL');
exception when others then
  insert into check_result values (9, 'B는 예산 함수를 부르지 못한다', 'PASS');
end;
$$;

-- 할당량: 초안은 3편까지
insert into public.drafts (id, title, body, client_updated_at) values ('rls-b-1', '1', '{"type":"doc"}', 1), ('rls-b-2', '2', '{"type":"doc"}', 1), ('rls-b-3', '3', '{"type":"doc"}', 1);
do $$
begin
  insert into public.drafts (id, title, body, client_updated_at) values ('rls-b-4', '4', '{"type":"doc"}', 1);
  insert into check_result values (10, '초안은 3편까지만 올라간다', 'FAIL');
exception when others then
  insert into check_result values (10, '초안은 3편까지만 올라간다', 'PASS');
end;
$$;

-- ── 피드 (0003_feed.sql) ─────────────────────────────────────────────────
-- A가 글을 올리고 좋아요와 댓글을 남긴다.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated","email":"rls-a@example.invalid"}', true);
insert into public.posts (column_id, title, excerpt, body) values ('rls-a-post', 'A의 공개 글', '앞부분', '{"type":"doc"}');
insert into public.post_likes (post_id) select id from public.posts where column_id = 'rls-a-post';
insert into public.post_comments (post_id, body) select id, 'A의 댓글' from public.posts where column_id = 'rls-a-post';

-- B로 바꾼다.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated","email":"rls-b@example.invalid"}', true);
insert into check_result select 12, 'B는 A가 올린 글을 본다', case when (select count(*) from public.posts where column_id = 'rls-a-post') = 1 then 'PASS' else 'FAIL' end;
insert into check_result select 13, 'B는 A의 좋아요 기록을 보지 못한다', case when (select count(*) from public.post_likes) = 0 then 'PASS' else 'FAIL' end;
insert into check_result select 14, '피드는 좋아요 개수만 알려 준다', case when (select like_count = 1 and not liked from public.feed_page() where column_id = 'rls-a-post') then 'PASS' else 'FAIL' end;

with changed as (update public.posts set title = '가로챔' where column_id = 'rls-a-post' returning 1)
insert into check_result select 15, 'B는 A의 글을 고치지 못한다', case when (select count(*) from changed) = 0 then 'PASS' else 'FAIL' end;

with gone as (delete from public.posts where column_id = 'rls-a-post' returning 1)
insert into check_result select 16, 'B는 A의 글을 내리지 못한다', case when (select count(*) from gone) = 0 then 'PASS' else 'FAIL' end;

with gone as (delete from public.post_comments where body = 'A의 댓글' returning 1)
insert into check_result select 17, 'B는 A의 댓글을 지우지 못한다', case when (select count(*) from gone) = 0 then 'PASS' else 'FAIL' end;

do $$
begin
  insert into public.post_comments (post_id, user_id, body) select id, '00000000-0000-4000-8000-00000000000a', '위조' from public.posts where column_id = 'rls-a-post';
  insert into check_result values (18, 'B는 A의 이름으로 댓글을 쓰지 못한다', 'FAIL');
exception when others then
  insert into check_result values (18, 'B는 A의 이름으로 댓글을 쓰지 못한다', 'PASS');
end;
$$;

do $$
begin
  insert into public.post_comments (post_id, body) select id, repeat('가', 501) from public.posts where column_id = 'rls-a-post';
  insert into check_result values (19, '댓글은 500자까지만 받는다', 'FAIL');
exception when others then
  insert into check_result values (19, '댓글은 500자까지만 받는다', 'PASS');
end;
$$;

-- B도 좋아요와 댓글을 남길 수 있다.
insert into public.post_likes (post_id) select id from public.posts where column_id = 'rls-a-post';
insert into public.post_comments (post_id, body) select id, 'B의 댓글' from public.posts where column_id = 'rls-a-post';
insert into check_result select 20, 'B의 좋아요와 댓글이 반영된다', case when (select like_count = 2 and comment_count = 2 and liked from public.feed_page() where column_id = 'rls-a-post') then 'PASS' else 'FAIL' end;

-- ── 구단 태그 · 프로필 · 팔로우 (0004_social.sql) ───────────────────────
-- 지금은 B. A를 팔로우한다.
insert into public.follows (followee_id) values ('00000000-0000-4000-8000-00000000000a');
insert into check_result select 23, 'B는 자기 팔로우를 본다', case when (select count(*) from public.follows) = 1 then 'PASS' else 'FAIL' end;
insert into check_result select 24, '프로필은 팔로워 수와 내 팔로우 여부를 알려 준다', case when (select follower_count = 1 and following and post_count = 1 from public.profile_summary('00000000-0000-4000-8000-00000000000a')) then 'PASS' else 'FAIL' end;
insert into check_result select 25, '팔로잉 피드에는 팔로우한 사람의 글만 나온다', case when (select count(*) from public.feed_page(null, null, 20, null, true)) = 1 then 'PASS' else 'FAIL' end;

do $$
begin
  insert into public.follows (follower_id, followee_id) values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b');
  insert into check_result values (26, 'B는 A의 이름으로 팔로우하지 못한다', 'FAIL');
exception when others then
  insert into check_result values (26, 'B는 A의 이름으로 팔로우하지 못한다', 'PASS');
end;
$$;

do $$
begin
  insert into public.follows (followee_id) values ('00000000-0000-4000-8000-00000000000b');
  insert into check_result values (27, '자기 자신은 팔로우하지 못한다', 'FAIL');
exception when others then
  insert into check_result values (27, '자기 자신은 팔로우하지 못한다', 'PASS');
end;
$$;

with changed as (update public.profiles set bio = '가로챔' where user_id = '00000000-0000-4000-8000-00000000000a' returning 1)
insert into check_result select 28, 'B는 A의 소개를 고치지 못한다', case when (select count(*) from changed) = 0 then 'PASS' else 'FAIL' end;

update public.profiles set bio = 'B의 소개', club = 'ars' where user_id = '00000000-0000-4000-8000-00000000000b';
insert into check_result select 29, 'B는 자기 소개와 응원 구단을 고친다', case when (select bio = 'B의 소개' and club = 'ars' from public.profile_summary('00000000-0000-4000-8000-00000000000b')) then 'PASS' else 'FAIL' end;

do $$
begin
  update public.profiles set bio = repeat('가', 81) where user_id = '00000000-0000-4000-8000-00000000000b';
  insert into check_result values (30, '소개는 80자까지만 받는다', 'FAIL');
exception when others then
  insert into check_result values (30, '소개는 80자까지만 받는다', 'PASS');
end;
$$;

insert into public.posts (column_id, title, excerpt, body, club) values ('rls-b-post', 'B의 글', '', '{"type":"doc"}', 'liv');
insert into check_result select 32, '구단으로 거르면 그 구단의 글만 나온다', case when (select count(*) from public.feed_page(null, null, 20, 'liv', false)) = 1 and (select count(*) from public.feed_page(null, null, 20, 'psg', false)) = 0 then 'PASS' else 'FAIL' end;
insert into check_result select 33, '인기 칼럼리스트는 글을 올린 사람만 나온다', case when (select count(*) from public.popular_columnists(10) where user_id in ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b')) = 2 then 'PASS' else 'FAIL' end;

-- ── 검색 (0005_search.sql) ──────────────────────────────────────────────
insert into check_result select 36, '검색어로 글을 찾는다', case when (select count(*) from public.feed_page(null, null, 20, null, false, '공개') where column_id = 'rls-a-post') = 1 and (select count(*) from public.feed_page(null, null, 20, null, false, '없는말xyz')) = 0 then 'PASS' else 'FAIL' end;
insert into check_result select 37, '검색어의 %와 _는 글자 그대로 찾는다', case when (select count(*) from public.feed_page(null, null, 20, null, false, '%') where column_id in ('rls-a-post', 'rls-b-post')) = 0 and (select count(*) from public.feed_page(null, null, 20, null, false, '_') where column_id in ('rls-a-post', 'rls-b-post')) = 0 then 'PASS' else 'FAIL' end;
insert into check_result select 38, '검색어로 칼럼리스트를 찾고, 빈 검색어는 아무도 돌려주지 않는다', case when (select count(*) from public.search_columnists('B', 20) where user_id = '00000000-0000-4000-8000-00000000000b') = 1 and (select count(*) from public.search_columnists('  ')) = 0 then 'PASS' else 'FAIL' end;

insert into check_result select 39, '리그(구단 여러 개)로 거르면 그 구단들의 글만 나온다', case when (select count(*) from public.feed_page(null, null, 20, null, false, null, array['liv', 'ars']) where column_id in ('rls-a-post', 'rls-b-post')) = 1 and (select count(*) from public.feed_page(null, null, 20, null, false, null, array['psg']) where column_id in ('rls-a-post', 'rls-b-post')) = 0 then 'PASS' else 'FAIL' end;

-- ── 정렬 (0007_sort.sql) ────────────────────────────────────────────────
-- 지금은 B. 글을 하나 더 올리고 먼저 올린 글에 좋아요를 누른다. B의 글만 놓고 순서를 본다 (실제 글에 흔들리지 않게).
insert into public.posts (column_id, title, excerpt, body) values ('rls-b-post-2', 'B의 둘째 글', '', '{"type":"doc"}');
insert into public.post_likes (post_id) select id from public.posts where column_id = 'rls-b-post';
insert into check_result select 45, '좋아요순은 좋아요가 많은 글부터 나온다', case when (select column_id from public.feed_page(null, '00000000-0000-4000-8000-00000000000b', 1, null, false, null, null, 'top', 0)) = 'rls-b-post' then 'PASS' else 'FAIL' end;
insert into check_result select 46, '좋아요순의 다음 쪽은 앞의 글을 건너뛴다', case when (select column_id from public.feed_page(null, '00000000-0000-4000-8000-00000000000b', 1, null, false, null, null, 'top', 1)) = 'rls-b-post-2' and (select count(*) from public.feed_page(null, '00000000-0000-4000-8000-00000000000b', 20, null, false, null, null, 'top', 2)) = 0 then 'PASS' else 'FAIL' end;
insert into check_result select 47, '정해지지 않은 순서 값은 최신순으로 본다', case when (select count(*) from public.feed_page(null, '00000000-0000-4000-8000-00000000000b', 20, null, false, null, null, 'x; drop', -5)) = 2 then 'PASS' else 'FAIL' end;

-- ── 대표 사진 (0008_cover.sql) ──────────────────────────────────────────
-- 지금은 B. 자기 글에는 자기 사진의 위치만 적을 수 있다.
update public.posts set cover = '00000000-0000-4000-8000-00000000000b/rls-b-post' where column_id = 'rls-b-post';
insert into check_result select 48, '피드는 대표 사진의 위치를 함께 돌려준다', case when (select cover from public.feed_page(null, '00000000-0000-4000-8000-00000000000b', 1, null, false, null, null, 'top', 0)) = '00000000-0000-4000-8000-00000000000b/rls-b-post' then 'PASS' else 'FAIL' end;
do $$
begin
  update public.posts set cover = '00000000-0000-4000-8000-00000000000a/rls-a-post' where column_id = 'rls-b-post';
  insert into check_result values (49, 'B는 자기 글에 A의 사진 위치를 적지 못한다', 'FAIL');
exception when others then
  insert into check_result values (49, 'B는 자기 글에 A의 사진 위치를 적지 못한다', 'PASS');
end;
$$;
insert into check_result select 50, '사진 보관함에 규칙 네 가지가 걸려 있다', case when (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'post-covers:%') = 4 then 'PASS' else 'FAIL' end;
insert into check_result select 51, '내 사진 위치만 내 것으로 본다', case when public.is_own_cover('00000000-0000-4000-8000-00000000000b/rls-b-post') and not public.is_own_cover('00000000-0000-4000-8000-00000000000a/rls-a-post') and not public.is_own_cover('00000000-0000-4000-8000-00000000000b/../x') then 'PASS' else 'FAIL' end;

-- ── 피드백 (0006_feedback.sql) ──────────────────────────────────────────
-- 지금은 B. 피드백을 보낸다.
insert into public.feedback (kind, body) values ('idea', 'B의 피드백');
insert into check_result select 40, 'B는 자기 피드백을 본다', case when (select count(*) from public.feedback where body = 'B의 피드백') = 1 then 'PASS' else 'FAIL' end;

do $$
begin
  insert into public.feedback (user_id, kind, body) values ('00000000-0000-4000-8000-00000000000a', 'idea', '위조');
  insert into check_result values (41, 'B는 A의 이름으로 피드백을 보내지 못한다', 'FAIL');
exception when others then
  insert into check_result values (41, 'B는 A의 이름으로 피드백을 보내지 못한다', 'PASS');
end;
$$;

do $$
begin
  insert into public.feedback (kind, body) values ('spam', '종류가 틀림');
  insert into check_result values (42, '정해진 종류의 피드백만 받는다', 'FAIL');
exception when others then
  insert into check_result values (42, '정해진 종류의 피드백만 받는다', 'PASS');
end;
$$;

insert into public.feedback (kind, body) values ('bug', '2'), ('bug', '3'), ('bug', '4'), ('bug', '5');
do $$
begin
  insert into public.feedback (kind, body) values ('bug', '6');
  insert into check_result values (43, '피드백은 하루 5건까지만 받는다', 'FAIL');
exception when others then
  insert into check_result values (43, '피드백은 하루 5건까지만 받는다', 'PASS');
end;
$$;

-- 고칠 권한 자체가 없어 오류가 난다. 오류가 나야 맞다.
do $$
begin
  update public.feedback set body = '고침' where body = 'B의 피드백';
  insert into check_result values (44, '보낸 피드백은 고치지 못한다', 'FAIL');
exception when others then
  insert into check_result values (44, '보낸 피드백은 고치지 못한다', 'PASS');
end;
$$;

-- A로 바꾼다: B가 누구를 팔로우하는지는 A에게 보이지 않는다.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated","email":"rls-a@example.invalid"}', true);
insert into check_result select 34, 'A는 B의 팔로우 기록을 보지 못한다', case when (select count(*) from public.follows) = 0 then 'PASS' else 'FAIL' end;
with gone as (delete from public.follows where followee_id = '00000000-0000-4000-8000-00000000000a' returning 1)
insert into check_result select 35, 'A는 B의 팔로우를 지우지 못한다', case when (select count(*) from gone) = 0 then 'PASS' else 'FAIL' end;

-- 답글과 댓글 좋아요 (0010). 지금은 A다. A가 B의 댓글에 답글을 달고 좋아요를 누른다.
insert into public.post_comments (post_id, body, parent_id) select post_id, 'A의 답글', id from public.post_comments where body = 'B의 댓글';
insert into check_result select 59, '답글은 윗댓글 아래 1단계로 달린다', case when (select count(*) from public.post_comment_list((select id from public.posts where column_id = 'rls-a-post')) r where r.body = 'A의 답글' and r.parent_id = (select id from public.post_comments where body = 'B의 댓글')) = 1 and (select depth from public.post_comments where body = 'A의 답글') = 1 then 'PASS' else 'FAIL' end;
do $$
begin
  insert into public.post_comments (post_id, body, parent_id) select (select id from public.posts where column_id = 'rls-b-post'), '다른 글의 답글', id from public.post_comments where body = 'B의 댓글';
  insert into check_result values (60, '다른 글의 댓글에는 답글을 달지 못한다', 'FAIL');
exception when others then
  insert into check_result values (60, '다른 글의 댓글에는 답글을 달지 못한다', 'PASS');
end $$;
insert into public.comment_likes (comment_id) select id from public.post_comments where body = 'B의 댓글';
insert into check_result select 61, '댓글 좋아요 수와 내가 눌렀는지를 알려 준다', case when (select like_count = 1 and liked from public.post_comment_list((select id from public.posts where column_id = 'rls-a-post')) where body = 'B의 댓글') then 'PASS' else 'FAIL' end;
do $$
begin
  perform public.delete_comment((select id from public.post_comments where body = 'B의 댓글'));
  insert into check_result values (62, 'A는 B의 댓글을 지우지 못한다', 'FAIL');
exception when others then
  insert into check_result values (62, 'A는 B의 댓글을 지우지 못한다', 'PASS');
end $$;

-- B로 바꾼다: A가 누른 댓글 좋아요 기록은 보이지 않고, 답글이 달린 자기 댓글을 지우면 자리만 남는다.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated","email":"rls-b@example.invalid"}', true);
insert into check_result select 63, 'B는 A가 누른 댓글 좋아요 기록을 보지 못한다', case when (select count(*) from public.comment_likes) = 0 and (select like_count = 1 and not liked from public.post_comment_list((select id from public.posts where column_id = 'rls-a-post')) where body = 'B의 댓글') then 'PASS' else 'FAIL' end;
-- 지우기와 확인을 한 문장에 두면 확인이 지우기 전의 모습을 본다. 그래서 둘로 나눈다.
do $$
declare
  removed boolean;
begin
  select public.delete_comment(id) into removed from public.post_comments where body = 'B의 댓글';
  insert into check_result values (64, '답글이 달린 댓글은 완전히 지워지지 않는다', case when removed is false then 'PASS' else 'FAIL' end);
end $$;
insert into check_result select 65, '지워진 자리는 글쓴이와 내용 없이 남고, 달린 답글은 그대로다', case when (select count(*) from public.post_comment_list((select id from public.posts where column_id = 'rls-a-post')) r where r.deleted and r.body = '' and r.user_id is null and r.like_count = 0) = 1 and (select count(*) from public.post_comment_list((select id from public.posts where column_id = 'rls-a-post')) r where r.body = 'A의 답글' and not r.deleted) = 1 then 'PASS' else 'FAIL' end;

-- 0012_daily_active.sql 부터: 하루 이용 인원은 숫자만 있고 운영자만 본다. (B는 운영자가 아니다)
do $$
begin
  perform count(*) from public.daily_active;
  insert into check_result values (66, '가입자는 하루 이용 인원 표를 직접 읽지 못한다', 'FAIL');
exception when others then
  insert into check_result values (66, '가입자는 하루 이용 인원 표를 직접 읽지 못한다', 'PASS');
end $$;
do $$
begin
  perform public.admin_daily_active(14);
  insert into check_result values (67, '운영자가 아니면 하루 이용 인원을 보지 못한다', 'FAIL');
exception when others then
  insert into check_result values (67, '운영자가 아니면 하루 이용 인원을 보지 못한다', case when sqlerrm = 'not_admin' then 'PASS' else 'FAIL' end);
end $$;

-- ── 신고 · 차단 · 숨김 · 금칙어 · 정지 (0014_moderation.sql) ─────────────
-- 등장: A · B(앞에서 만듦), D(글쓴이), E(막 가입한 사람), F(가입한 지 오래된 사람), Z(점검용 운영자, rls-admin@example.invalid).
-- 자동 숨김은 가입 72시간이 지난 신고자만 세므로, 점검을 위해 A · B · F · Z 의 가입 시각을 4일 전으로 돌려 둔다 (E 는 그대로 둔다).

-- D가 가입해 소개 · 사진을 적고, 대표 사진이 붙은 글 두 편과 댓글을 쓴다. 'rls-d-hide' 는 신고로 숨겨질 글이다.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000d","role":"authenticated","email":"rls-d@example.invalid"}', true);
insert into public.profiles (nickname) values ('D');
update public.profiles set bio = 'D 소개', avatar = '00000000-0000-4000-8000-00000000000d/1700000000000.webp' where user_id = '00000000-0000-4000-8000-00000000000d';
insert into public.posts (column_id, title, excerpt, body, cover) values
  ('rls-d-post', 'D의 글', '', '{"type":"doc"}', '00000000-0000-4000-8000-00000000000d/rls-d-post'),
  ('rls-d-hide', 'D의 신고될 글', '', '{"type":"doc"}', '00000000-0000-4000-8000-00000000000d/rls-d-hide');
insert into public.post_comments (post_id, body) select id, 'D의 댓글' from public.posts where column_id = 'rls-d-post';
insert into public.post_comments (post_id, body) select id, 'D가 신고될 글에 단 댓글' from public.posts where column_id = 'rls-d-hide';

-- F 와 Z 가 가입한다. Z 는 글을 하나 올린다.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000f","role":"authenticated","email":"rls-f@example.invalid"}', true);
insert into public.profiles (nickname) values ('F');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ad","role":"authenticated","email":"rls-admin@example.invalid"}', true);
insert into public.profiles (nickname) values ('Z');
insert into public.posts (column_id, title, excerpt, body) values ('rls-z-post', '운영자의 글', '', '{"type":"doc"}');

reset role;
update public.profiles set created_at = now() - interval '4 days'
where user_id in ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000f', '00000000-0000-4000-8000-0000000000ad');
set local role authenticated;

-- B가 D의 글에 댓글을 단다. (B는 0004 단계에서 A를 팔로우해 두었다)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated","email":"rls-b@example.invalid"}', true);
insert into public.post_comments (post_id, body) select id, 'B가 D의 글에 단 댓글' from public.posts where column_id = 'rls-d-post';

-- A가 B를 차단한다.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated","email":"rls-a@example.invalid"}', true);
select public.block_user('00000000-0000-4000-8000-00000000000b');
insert into check_result select 71, '차단하면 그 사람의 글 · 프로필이 피드 · 검색 · 인기 칼럼리스트 · 본문에서 사라진다', case when
  (select count(*) from public.feed_page(null, '00000000-0000-4000-8000-00000000000b')) = 0
  and (select count(*) from public.search_columnists('B', 20) where user_id = '00000000-0000-4000-8000-00000000000b') = 0
  and (select count(*) from public.popular_columnists(30) where user_id = '00000000-0000-4000-8000-00000000000b') = 0
  and (select count(*) from public.profile_summary('00000000-0000-4000-8000-00000000000b')) = 0
  and (select public.post_body(id) from public.posts where column_id = 'rls-b-post') is null
  and (select count(*) from public.feed_page(null, '00000000-0000-4000-8000-00000000000d') where column_id = 'rls-d-post') = 1
  then 'PASS' else 'FAIL' end;
insert into check_result select 72, '차단하면 그 사람의 댓글이 목록에서 사라지고 댓글 수도 맞게 준다', case when
  (select count(*) from public.post_comment_list((select id from public.posts where column_id = 'rls-d-post')) where body like 'B가%' or user_id = '00000000-0000-4000-8000-00000000000b') = 0
  and (select count(*) from public.post_comment_list((select id from public.posts where column_id = 'rls-d-post')) where body = 'D의 댓글') = 1
  and (select comment_count from public.feed_page(null, '00000000-0000-4000-8000-00000000000d') where column_id = 'rls-d-post')
      = (select count(*) from public.post_comment_list((select id from public.posts where column_id = 'rls-d-post')))
  then 'PASS' else 'FAIL' end;
insert into check_result select 73, '차단하면 서로의 팔로우가 풀린다', case when (select follower_count from public.profile_summary('00000000-0000-4000-8000-00000000000a')) = 0 then 'PASS' else 'FAIL' end;
insert into check_result select 74, '차단 목록에 차단한 사람이 나온다', case when (select count(*) from public.my_blocks() where user_id = '00000000-0000-4000-8000-00000000000b' and nickname = 'B') = 1 and (select count(*) from public.blocks) = 1 then 'PASS' else 'FAIL' end;
do $$
begin
  perform public.block_user('00000000-0000-4000-8000-00000000000a');
  insert into check_result values (75, '자기 자신은 차단하지 못한다', 'FAIL');
exception when others then
  insert into check_result values (75, '자기 자신은 차단하지 못한다', case when sqlerrm = 'self_block' then 'PASS' else 'FAIL' end);
end $$;

-- B로 바꾼다: 자기를 차단한 A에게 댓글 · 팔로우 · 좋아요를 하지 못하고, A의 차단 목록도 보지 못한다.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated","email":"rls-b@example.invalid"}', true);
do $$
begin
  insert into public.post_comments (post_id, body) select id, '차단된 사람의 댓글' from public.posts where column_id = 'rls-a-post';
  insert into check_result values (76, '차단된 사람은 차단한 사람의 글에 댓글을 달지 못한다', 'FAIL');
exception when others then
  insert into check_result values (76, '차단된 사람은 차단한 사람의 글에 댓글을 달지 못한다', case when sqlerrm = 'blocked' then 'PASS' else 'FAIL' end);
end $$;
do $$
begin
  insert into public.follows (followee_id) values ('00000000-0000-4000-8000-00000000000a');
  insert into check_result values (77, '차단된 사람은 차단한 사람을 팔로우하지 못한다', 'FAIL');
exception when others then
  insert into check_result values (77, '차단된 사람은 차단한 사람을 팔로우하지 못한다', case when sqlerrm = 'blocked' then 'PASS' else 'FAIL' end);
end $$;
insert into check_result select 78, '남의 차단 기록은 보이지 않는다', case when (select count(*) from public.blocks) = 0 then 'PASS' else 'FAIL' end;
do $$
declare
  refused int := 0;
begin
  begin
    insert into public.post_likes (post_id) select id from public.posts where column_id = 'rls-a-post';
  exception when others then
    if sqlerrm = 'blocked' then refused := refused + 1; end if;
  end;
  begin
    insert into public.comment_likes (comment_id) select id from public.post_comments where body = 'A의 댓글';
  exception when others then
    if sqlerrm = 'blocked' then refused := refused + 1; end if;
  end;
  insert into check_result values (111, '차단된 사람은 차단한 사람의 글 · 댓글에 좋아요를 누르지 못한다', case when refused = 2 then 'PASS' else 'FAIL' end);
end $$;

-- B가 D의 'rls-d-hide' 를 신고한다.
select public.report_content('post', (select id from public.posts where column_id = 'rls-d-hide'), 'spam');
insert into check_result select 79, '자기 신고는 본다', case when (select count(*) from public.reports where reporter = '00000000-0000-4000-8000-00000000000b' and reason = 'spam') = 1 then 'PASS' else 'FAIL' end;
do $$
begin
  perform public.report_content('post', (select id from public.posts where column_id = 'rls-d-hide'), 'abuse');
  insert into check_result values (80, '같은 대상을 두 번 신고하지 못한다', 'FAIL');
exception when others then
  insert into check_result values (80, '같은 대상을 두 번 신고하지 못한다', case when sqlerrm = 'already_reported' then 'PASS' else 'FAIL' end);
end $$;
do $$
begin
  perform public.report_content('post', (select id from public.posts where column_id = 'rls-b-post'), 'spam');
  insert into check_result values (81, '자기 글은 신고하지 못한다', 'FAIL');
exception when others then
  insert into check_result values (81, '자기 글은 신고하지 못한다', case when sqlerrm = 'self_report' then 'PASS' else 'FAIL' end);
end $$;
do $$
begin
  insert into public.reports (target_kind, target_id, reason) select 'post', id, 'spam' from public.posts where column_id = 'rls-a-post';
  insert into check_result values (82, '신고 표에 직접 쓰지 못한다 (함수로만)', 'FAIL');
exception when others then
  insert into check_result values (82, '신고 표에 직접 쓰지 못한다 (함수로만)', 'PASS');
end $$;
do $$
declare
  refused int := 0;
begin
  begin
    perform public.report_content('post', (select id from public.posts where column_id = 'rls-d-post'), 'nope');
  exception when others then
    if sqlerrm = 'bad_report' then refused := refused + 1; end if;
  end;
  begin
    perform public.report_content('post', (select id from public.posts where column_id = 'rls-d-post'), 'spam', null, 'avatar');
  exception when others then
    if sqlerrm = 'bad_report' then refused := refused + 1; end if;
  end;
  begin
    perform public.report_content('comment', gen_random_uuid(), 'spam');
  exception when others then
    if sqlerrm = 'bad_report' then refused := refused + 1; end if;
  end;
  insert into check_result values (107, '정해지지 않은 사유 · 부분, 없는 대상의 신고는 bad_report 로 거절한다', case when refused = 3 then 'PASS' else 'FAIL' end);
end $$;
-- B는 D의 댓글 · D(사용자) · 운영자 Z의 글도 신고한다.
select public.report_content('comment', (select id from public.post_comments where body = 'D의 댓글'), 'abuse');
select public.report_content('user', '00000000-0000-4000-8000-00000000000d', 'sexual', null, 'avatar');
select public.report_content('post', (select id from public.posts where column_id = 'rls-z-post'), 'other');

-- A도 같은 것들을 신고한다 (두 번째).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated","email":"rls-a@example.invalid"}', true);
select public.report_content('post', (select id from public.posts where column_id = 'rls-d-hide'), 'abuse', 'RLS 점검');
insert into check_result select 83, '남의 신고는 읽지 못한다 (신고 내용 detail 도)', case when (select count(*) from public.reports) = 1 and (select count(*) from public.reports where reporter = '00000000-0000-4000-8000-00000000000b') = 0 then 'PASS' else 'FAIL' end;
insert into check_result select 84, '두 명이 신고해서는 숨지 않는다', case when (select count(*) from public.feed_page(null, '00000000-0000-4000-8000-00000000000d') where column_id = 'rls-d-hide') = 1 then 'PASS' else 'FAIL' end;
select public.report_content('comment', (select id from public.post_comments where body = 'D의 댓글'), 'abuse');
select public.report_content('user', '00000000-0000-4000-8000-00000000000d', 'sexual', null, 'avatar');
select public.report_content('post', (select id from public.posts where column_id = 'rls-z-post'), 'other');

-- E가 막 가입해 세 번째로 신고한다. 가입 72시간이 안 돼 자동 숨김 수에는 들어가지 않는다.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000e","role":"authenticated","email":"rls-e@example.invalid"}', true);
insert into public.profiles (nickname) values ('E');
select public.report_content('post', (select id from public.posts where column_id = 'rls-d-hide'), 'hate');
insert into check_result select 97, '가입 72시간이 안 된 사람의 신고는 자동 숨김 수에 넣지 않는다', case when (select count(*) from public.feed_page(null, '00000000-0000-4000-8000-00000000000d') where column_id = 'rls-d-hide') = 1 and (select count(*) from public.reports) = 1 then 'PASS' else 'FAIL' end;

-- F(가입한 지 오래됨)가 신고한다. 이 자리에서 숨는다.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000f","role":"authenticated","email":"rls-f@example.invalid"}', true);
select public.report_content('post', (select id from public.posts where column_id = 'rls-d-hide'), 'hate');
-- 숨긴 글의 id 는 F 자신의 신고에서 읽는다 (표에서는 이미 보이지 않는다).
insert into check_result select 85, '오래된 가입자 세 명이 신고하면 글이 바로 숨고 남에게 보이지 않는다', case when
  (select count(*) from public.feed_page(null, '00000000-0000-4000-8000-00000000000d') where column_id = 'rls-d-hide') = 0
  and (select count(*) from public.feed_page(null, '00000000-0000-4000-8000-00000000000d') where column_id = 'rls-d-post') = 1
  and (select count(*) from public.posts where column_id = 'rls-d-hide') = 0
  and (select public.post_body(target_id) from public.reports where target_kind = 'post') is null
  and (select count(*) from public.post_comment_list((select target_id from public.reports where target_kind = 'post'))) = 0
  then 'PASS' else 'FAIL' end;
insert into check_result select 98, '숨긴 글의 댓글은 표를 직접 읽어도 남에게 보이지 않는다', case when (select count(*) from public.post_comments where body = 'D가 신고될 글에 단 댓글') = 0 and (select count(*) from public.post_comments where body = 'D의 댓글') = 1 then 'PASS' else 'FAIL' end;
insert into check_result select 99, '숨긴 글의 대표 사진은 남이 받지 못하고, 보이는 글의 사진과 자기 폴더는 받는다', case when
  not public.cover_visible('00000000-0000-4000-8000-00000000000d/rls-d-hide')
  and public.cover_visible('00000000-0000-4000-8000-00000000000d/rls-d-post')
  and public.cover_visible('00000000-0000-4000-8000-00000000000f/rls-f-post')
  and not public.cover_visible('00000000-0000-4000-8000-00000000000d/rls-d-none')
  then 'PASS' else 'FAIL' end;
-- F가 세 번째로 D의 댓글 · D(사용자) · Z의 글을 신고한다.
select public.report_content('comment', (select id from public.post_comments where body = 'D의 댓글'), 'hate');
select public.report_content('user', '00000000-0000-4000-8000-00000000000d', 'sexual', '사진이 부적절함', 'avatar');
select public.report_content('post', (select id from public.posts where column_id = 'rls-z-post'), 'other');
insert into check_result select 105, '댓글도 세 명이 신고하면 숨고, 표를 직접 읽어도 남에게 보이지 않는다', case when
  (select count(*) from public.post_comment_list((select id from public.posts where column_id = 'rls-d-post')) where body = 'D의 댓글') = 0
  and (select count(*) from public.post_comments where body = 'D의 댓글') = 0
  and (select comment_count from public.feed_page(null, '00000000-0000-4000-8000-00000000000d') where column_id = 'rls-d-post')
      = (select count(*) from public.post_comment_list((select id from public.posts where column_id = 'rls-d-post')))
  then 'PASS' else 'FAIL' end;
insert into check_result select 106, '사용자를 세 명이 신고하면 남에게 소개 · 프로필 사진이 감춰진다 (닉네임은 그대로)', case when
  (select bio = '' and avatar is null and nickname = 'D' from public.profile_summary('00000000-0000-4000-8000-00000000000d'))
  and (select avatar is null from public.feed_page(null, '00000000-0000-4000-8000-00000000000d') where column_id = 'rls-d-post')
  then 'PASS' else 'FAIL' end;
insert into check_result select 101, '운영자 계정의 글은 세 명이 신고해도 자동으로 숨지 않는다', case when (select count(*) from public.feed_page(null, '00000000-0000-4000-8000-0000000000ad') where column_id = 'rls-z-post') = 1 then 'PASS' else 'FAIL' end;
-- 하루 신고 30건: F는 지금까지 4건을 냈다. 점검용으로 26건을 서버 권한으로 채운 뒤 한 건 더 낸다.
reset role;
insert into public.reports (reporter, target_kind, target_id, reason)
select '00000000-0000-4000-8000-00000000000f', 'post', gen_random_uuid(), 'spam' from generate_series(1, 26);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000f","role":"authenticated","email":"rls-f@example.invalid"}', true);
do $$
begin
  perform public.report_content('post', (select id from public.posts where column_id = 'rls-d-post'), 'spam');
  insert into check_result values (108, '하루 신고는 30건까지만 받는다', 'FAIL');
exception when others then
  insert into check_result values (108, '하루 신고는 30건까지만 받는다', case when sqlerrm = 'report_quota' then 'PASS' else 'FAIL' end);
end $$;

-- D(글쓴이)로 바꾼다: 숨겨진 자기 글 · 댓글은 hidden 으로 보이고, 자기 소개 · 사진도 그대로 본다.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000d","role":"authenticated","email":"rls-d@example.invalid"}', true);
insert into check_result select 86, '글쓴이는 숨겨진 자기 글을 hidden 표시와 함께 본다', case when
  (select hidden from public.feed_page(null, '00000000-0000-4000-8000-00000000000d') where column_id = 'rls-d-hide') is true
  and (select hidden from public.feed_page(null, '00000000-0000-4000-8000-00000000000d') where column_id = 'rls-d-post') is false
  and (select count(*) from public.posts where column_id = 'rls-d-hide') = 1
  and (select public.post_body(id) is not null from public.posts where column_id = 'rls-d-hide')
  then 'PASS' else 'FAIL' end;
insert into check_result select 117, '쓴이는 숨겨진 자기 댓글을 hidden 으로, 숨긴 글의 대표 사진도 받는다', case when
  (select hidden and not deleted from public.post_comment_list((select id from public.posts where column_id = 'rls-d-post')) where body = 'D의 댓글')
  and public.cover_visible('00000000-0000-4000-8000-00000000000d/rls-d-hide')
  then 'PASS' else 'FAIL' end;
do $$
declare
  ok int := 0;
begin
  begin
    perform p.bio from public.profiles p where p.user_id = '00000000-0000-4000-8000-00000000000d';
  exception when others then ok := ok + 1;
  end;
  begin
    perform p.avatar from public.profiles p limit 1;
  exception when others then ok := ok + 1;
  end;
  if (select bio = 'D 소개' and avatar is not null and nickname = 'D' and not suspended from public.my_profile()) then
    ok := ok + 1;
  end if;
  insert into check_result values (109, '소개 · 프로필 사진 칸은 표에서 직접 읽지 못하고, 본인 것은 my_profile() 로 (숨겨져도) 읽는다', case when ok = 3 then 'PASS' else 'FAIL' end);
end $$;

-- 금칙어: 띄어쓰기 · 문장부호 · 대소문자 · 전각 글자를 섞어도, 본문의 서식 · 스탯 표 속성 안에 있어도 걸린다.
do $$
begin
  insert into public.post_comments (post_id, body) select id, '이건 RLS 금칙어, 시험!' from public.posts where column_id = 'rls-d-post';
  insert into check_result values (87, '금칙어가 든 댓글은 받지 않는다', 'FAIL');
exception when others then
  insert into check_result values (87, '금칙어가 든 댓글은 받지 않는다', case when sqlerrm = 'banned_word' then 'PASS' else 'FAIL' end);
end $$;
do $$
begin
  update public.profiles set bio = 'rls 금칙어 시험' where user_id = '00000000-0000-4000-8000-00000000000d';
  insert into check_result values (88, '금칙어가 든 소개는 받지 않는다', 'FAIL');
exception when others then
  insert into check_result values (88, '금칙어가 든 소개는 받지 않는다', case when sqlerrm = 'banned_word' then 'PASS' else 'FAIL' end);
end $$;
do $$
declare
  seen bigint;
begin
  select count(*) into seen from public.banned_words;
  insert into check_result values (89, '금칙어 목록은 운영자만 본다', case when seen = 0 then 'PASS' else 'FAIL' end);
exception when others then
  insert into check_result values (89, '금칙어 목록은 운영자만 본다', 'PASS');
end $$;
do $$
declare
  caught int := 0;
  clean boolean := false;
begin
  begin
    insert into public.posts (column_id, title, excerpt, body) values ('rls-d-m5a', '서식', '',
      '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"RLS금칙"},{"type":"text","marks":[{"type":"bold"}],"text":"어시험"}]}]}');
  exception when others then
    if sqlerrm = 'banned_word' then caught := caught + 1; end if;
  end;
  begin
    insert into public.posts (column_id, title, excerpt, body) values ('rls-d-m5b', '스탯', '',
      '{"type":"doc","content":[{"type":"statBlock","attrs":{"snapshot":{"title":"표","rows":[["선수","RLS 금칙어 시험"]]}}}]}');
  exception when others then
    if sqlerrm = 'banned_word' then caught := caught + 1; end if;
  end;
  begin
    insert into public.post_comments (post_id, body) select id, 'ＲＬＳ금칙어시험' from public.posts where column_id = 'rls-d-post';
  exception when others then
    if sqlerrm = 'banned_word' then caught := caught + 1; end if;
  end;
  begin
    insert into public.posts (column_id, title, excerpt, body) values ('rls-d-m5c', '사진', '',
      '{"type":"doc","content":[{"type":"image","attrs":{"src":"https://x.invalid/rls금칙어시험.png","mediaId":"rls금칙어시험"}}]}');
    clean := true;
  exception when others then
    clean := false;
  end;
  insert into check_result values (104, '본문 서식 · 스탯 표 속성 · 전각 글자의 금칙어를 잡고, 사진 주소 같은 속성은 보지 않는다', case when caught = 3 and clean then 'PASS' else 'FAIL' end);
end $$;

-- N4: 값이 20,000 개를 넘게 잘게 쪼갠 본문은 금칙어 검사 전에 거절한다.
do $$
begin
  insert into public.posts (column_id, title, excerpt, body)
  select 'rls-d-big', '큰 본문', '', jsonb_build_object('type', 'doc', 'content',
    jsonb_agg(jsonb_build_object('type', 'text', 'text', 'a'))) from generate_series(1, 7000);
  insert into check_result values (126, '값이 20,000 개를 넘는 본문은 body_too_complex 로 거절한다', 'FAIL');
exception when others then
  insert into check_result values (126, '값이 20,000 개를 넘는 본문은 body_too_complex 로 거절한다', case when sqlerrm = 'body_too_complex' then 'PASS' else 'FAIL' end);
end $$;

-- 정지되지 않은 가입자는 자기 폴더에 사진을 올린다 (점검이 파일 표를 바꾸지 않게 올린 뒤 되돌린다).
do $$
declare
  inserted boolean := false;
begin
  begin
    insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-4000-8000-00000000000d/1700000000001.webp');
    inserted := true;
    raise exception 'undo_upload';
  exception when raise_exception then
    null;
  end;
  insert into check_result values (119, '정지되지 않은 가입자는 자기 폴더에 사진을 올린다', case when inserted then 'PASS' else 'FAIL' end);
exception when others then
  insert into check_result values (119, '정지되지 않은 가입자는 자기 폴더에 사진을 올린다', 'FAIL');
end $$;

-- 운영자 Z: 신고 묶음과 신고 내용을 보고, D의 글을 restore 한다.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ad","role":"authenticated","email":"rls-admin@example.invalid"}', true);
insert into check_result select 102, '운영자는 신고 묶음 · 사유 · 신고 내용(details)을 본다', case when
  (select report_count = 4 and hidden and 'RLS 점검' = any (details) and (reasons ->> 'abuse')::int = 1 and post_id is not null
   from public.admin_reports('open') where target_id = (select id from public.posts where column_id = 'rls-d-hide'))
  and (select details @> array['사진이 부적절함'] and 'avatar' = any (parts) from public.admin_reports('open') where kind = 'user' and target_id = '00000000-0000-4000-8000-00000000000d')
  then 'PASS' else 'FAIL' end;
select public.admin_resolve_report('post', (select id from public.posts where column_id = 'rls-d-hide'), 'restore');
insert into check_result select 103, '운영자가 restore 하면 다시 보이고 그 대상의 열린 신고가 닫힌다', case when
  (select count(*) from public.feed_page(null, '00000000-0000-4000-8000-00000000000d') where column_id = 'rls-d-hide') = 1
  and (select count(*) from public.admin_reports('open') where target_id = (select id from public.posts where column_id = 'rls-d-hide')) = 0
  and (select restored_at is not null from public.posts where column_id = 'rls-d-hide')
  then 'PASS' else 'FAIL' end;
-- 닫힌 신고를 점검용으로 다시 열고 Z도 신고한다. 오래된 신고자 넷이 모여도 restore 한 글은 다시 자동으로 숨지 않는다.
reset role;
update public.reports set resolved_at = null, resolution = null where target_id = (select id from public.posts where column_id = 'rls-d-hide');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ad","role":"authenticated","email":"rls-admin@example.invalid"}', true);
-- N1: restore 뒤 글쓴이가 같은 위치에 대표 사진만 다시 올리면 restore 면제가 풀려 다시 자동으로 숨는다.
-- 사진 올리기 · 신고 · 숨김은 안쪽 블록에서 일부러 오류를 내 모두 되돌린다.
do $$
declare
  result text;
begin
  begin
    perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000d","role":"authenticated","email":"rls-d@example.invalid"}', true);
    insert into storage.objects (bucket_id, name, created_at, updated_at)
    values ('post-covers', '00000000-0000-4000-8000-00000000000d/rls-d-hide', now() + interval '1 minute', now() + interval '1 minute');
    perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ad","role":"authenticated","email":"rls-admin@example.invalid"}', true);
    perform public.report_content('post', (select id from public.posts where column_id = 'rls-d-hide'), 'other');
    result := case when (select hidden_at is not null from public.posts where column_id = 'rls-d-hide') then 'PASS' else 'FAIL' end;
    raise exception 'undo_n1';
  exception when raise_exception then
    null;
  end;
  insert into check_result values (120, 'restore 뒤 대표 사진을 다시 올리면 다시 자동으로 숨는다', coalesce(result, 'FAIL'));
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ad","role":"authenticated","email":"rls-admin@example.invalid"}', true);
select public.report_content('post', (select id from public.posts where column_id = 'rls-d-hide'), 'other');
insert into check_result select 118, 'restore 한 글은 신고가 다시 모여도 자동으로 숨지 않는다 (운영자만 숨긴다)', case when
  (select count(*) from public.feed_page(null, '00000000-0000-4000-8000-00000000000d') where column_id = 'rls-d-hide') = 1
  and (select hidden_at is null from public.posts where column_id = 'rls-d-hide')
  then 'PASS' else 'FAIL' end;

-- 정지된 계정은 이미 올린 대표 사진도 바꾸지 못한다. 올리기 · 정지 · 바꾸기는 안쪽 블록에서 모두 되돌린다.
do $$
declare
  result text;
begin
  begin
    perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000e","role":"authenticated","email":"rls-e@example.invalid"}', true);
    insert into storage.objects (bucket_id, name) values ('post-covers', '00000000-0000-4000-8000-00000000000e/rls-e-cover');
    perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ad","role":"authenticated","email":"rls-admin@example.invalid"}', true);
    perform public.admin_resolve_report('user', '00000000-0000-4000-8000-00000000000e', 'suspend');
    perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000e","role":"authenticated","email":"rls-e@example.invalid"}', true);
    begin
      update storage.objects set updated_at = now() where bucket_id = 'post-covers' and name = '00000000-0000-4000-8000-00000000000e/rls-e-cover';
      result := 'FAIL';
    exception when others then
      result := case when sqlstate = '42501' then 'PASS' else 'FAIL' end;
    end;
    raise exception 'undo_cover';
  exception when raise_exception then
    null;
  end;
  insert into check_result values (121, '정지된 계정은 대표 사진을 바꾸지 못한다', coalesce(result, 'FAIL'));
end $$;

-- 이용 정지: E를 정지한다 (점검용으로 서버 권한으로 바로 적는다. 정지 해시도 함께 적힌다).
reset role;
update public.profiles set suspended_at = now() where user_id = '00000000-0000-4000-8000-00000000000e';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000e","role":"authenticated","email":"rls-e@example.invalid"}', true);
do $$
begin
  insert into public.posts (column_id, title, excerpt, body) values ('rls-e-post', 'E의 글', '', '{"type":"doc"}');
  insert into check_result values (90, '정지된 계정은 글을 올리지 못한다', 'FAIL');
exception when others then
  insert into check_result values (90, '정지된 계정은 글을 올리지 못한다', case when sqlerrm = 'suspended' then 'PASS' else 'FAIL' end);
end $$;
do $$
declare
  stopped int := 0;
begin
  begin
    insert into public.post_comments (post_id, body) select id, '정지된 사람의 댓글' from public.posts where column_id = 'rls-d-post';
  exception when others then
    if sqlerrm = 'suspended' then stopped := stopped + 1; end if;
  end;
  begin
    insert into public.follows (followee_id) values ('00000000-0000-4000-8000-00000000000d');
  exception when others then
    if sqlerrm = 'suspended' then stopped := stopped + 1; end if;
  end;
  begin
    perform public.report_content('post', (select id from public.posts where column_id = 'rls-d-post'), 'spam');
  exception when others then
    if sqlerrm = 'suspended' then stopped := stopped + 1; end if;
  end;
  begin
    update public.profiles set bio = '정지 중 소개' where user_id = '00000000-0000-4000-8000-00000000000e';
  exception when others then
    if sqlerrm = 'suspended' then stopped := stopped + 1; end if;
  end;
  insert into check_result values (91, '정지된 계정은 댓글 · 팔로우 · 신고 · 소개 바꾸기를 하지 못한다', case when stopped = 4 then 'PASS' else 'FAIL' end);
end $$;
do $$
declare
  stopped int := 0;
begin
  begin
    insert into public.post_likes (post_id) select id from public.posts where column_id = 'rls-d-post';
  exception when others then
    if sqlerrm = 'suspended' then stopped := stopped + 1; end if;
  end;
  begin
    insert into public.comment_likes (comment_id) select id from public.post_comments where body = 'B가 D의 글에 단 댓글';
  exception when others then
    if sqlerrm = 'suspended' then stopped := stopped + 1; end if;
  end;
  insert into check_result values (110, '정지된 계정은 글 · 댓글에 좋아요를 누르지 못한다', case when stopped = 2 then 'PASS' else 'FAIL' end);
end $$;
-- 정지된 계정은 사진을 올리지 못한다. 혹시 올라가면 되돌리고 FAIL 로 적는다.
do $$
begin
  begin
    insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-4000-8000-00000000000e/1700000000000.webp');
    raise exception 'undo_upload';
  exception when raise_exception then
    insert into check_result values (112, '정지된 계정은 보관함에 사진을 올리지 못한다', 'FAIL');
    return;
  end;
exception when others then
  insert into check_result values (112, '정지된 계정은 보관함에 사진을 올리지 못한다', case when public.me_suspended() then 'PASS' else 'FAIL' end);
end $$;

-- 운영자가 아니면 운영자 함수 여섯 개가 모두 not_admin 으로 막힌다. (E는 운영자가 아니다)
do $$
declare
  refused int := 0;
begin
  begin perform public.admin_reports('open'); exception when others then if sqlerrm = 'not_admin' then refused := refused + 1; end if; end;
  begin perform public.admin_resolve_report('post', (select id from public.posts where column_id = 'rls-d-post'), 'delete'); exception when others then if sqlerrm = 'not_admin' then refused := refused + 1; end if; end;
  begin perform public.admin_unsuspend('00000000-0000-4000-8000-00000000000e'); exception when others then if sqlerrm = 'not_admin' then refused := refused + 1; end if; end;
  begin perform public.admin_banned_words(); exception when others then if sqlerrm = 'not_admin' then refused := refused + 1; end if; end;
  begin perform public.admin_add_banned_word('rls추가시험'); exception when others then if sqlerrm = 'not_admin' then refused := refused + 1; end if; end;
  begin perform public.admin_remove_banned_word('rls금칙어시험'); exception when others then if sqlerrm = 'not_admin' then refused := refused + 1; end if; end;
  insert into check_result values (92, '운영자가 아니면 신고 처리 · 정지 풀기 · 금칙어 함수를 부르지 못한다', case when refused = 6 then 'PASS' else 'FAIL' end);
end $$;

-- 서버 함수 전용인 빈도 제한 함수 · 표, 정지 해시 표, pepper 는 가입자가 부르거나 읽고 쓰지 못한다.
-- 124 · 125 는 권한 거부(42501: 표 권한 또는 스키마 USAGE 거부)로 막힐 때만 센다. 표가 없거나 다른 오류로 막히면 FAIL 이다.
do $$
begin
  perform public.bump_rate('rls-x', 1, 60);
  insert into check_result values (122, '가입자는 빈도 제한 함수 bump_rate 를 부르지 못한다', 'FAIL');
exception when others then
  insert into check_result values (122, '가입자는 빈도 제한 함수 bump_rate 를 부르지 못한다', 'PASS');
end $$;
do $$
declare
  refused int := 0;
begin
  begin perform count(*) from public.rate_limits; exception when others then if sqlstate = '42501' then refused := refused + 1; end if; end;
  begin perform count(*) from public.banned_identities; exception when others then if sqlstate = '42501' then refused := refused + 1; end if; end;
  begin perform count(*) from private.identity_pepper; exception when others then if sqlstate = '42501' then refused := refused + 1; end if; end;
  begin insert into public.rate_limits (key) values ('rls-x'); exception when others then if sqlstate = '42501' then refused := refused + 1; end if; end;
  begin insert into public.banned_identities (hash) values (repeat('0', 64)); exception when others then if sqlstate = '42501' then refused := refused + 1; end if; end;
  begin insert into private.identity_pepper (id, pepper) values (2, decode('00', 'hex')); exception when others then if sqlstate = '42501' then refused := refused + 1; end if; end;
  insert into check_result values (124, '가입자는 rate_limits · banned_identities · pepper 표를 읽거나 쓰지 못한다', case when refused = 6 then 'PASS' else 'FAIL' end);
end $$;

-- 0016 부터: 앱 네이버 로그인의 받아 둔 로그인 표와 그 두 함수는 서버 함수 전용이다. 가입자는 부르지도 읽고 쓰지도 못한다.
-- 권한 거부(42501)로 막힐 때만 센다. 표 · 함수가 없거나 다른 오류로 막히면 FAIL 이다.
do $$
declare
  refused int := 0;
begin
  begin perform public.naver_app_put(repeat('r', 43), 'rls-x', 'email'); exception when others then if sqlstate = '42501' then refused := refused + 1; end if; end;
  begin perform public.naver_app_take(repeat('r', 43)); exception when others then if sqlstate = '42501' then refused := refused + 1; end if; end;
  insert into check_result values (138, '가입자는 네이버 앱 로그인 함수 naver_app_put · naver_app_take 를 부르지 못한다', case when refused = 2 then 'PASS' else 'FAIL' end);
end $$;
do $$
declare
  refused int := 0;
begin
  begin perform count(*) from public.naver_app_pending; exception when others then if sqlstate = '42501' then refused := refused + 1; end if; end;
  begin insert into public.naver_app_pending (state, token_hash) values (repeat('r', 43), 'rls-x'); exception when others then if sqlstate = '42501' then refused := refused + 1; end if; end;
  begin delete from public.naver_app_pending; exception when others then if sqlstate = '42501' then refused := refused + 1; end if; end;
  insert into check_result values (139, '가입자는 naver_app_pending 표를 읽거나 쓰거나 지우지 못한다', case when refused = 3 then 'PASS' else 'FAIL' end);
end $$;

-- 정지 이어 가기: 정지된 E가 탈퇴하고 같은 이메일로 다시 가입하면(새 id) 정지가 이어진다.
-- 보관 기준은 탈퇴 시각이다. 점검을 위해 E의 정지 해시를 적은 시각을 2년 전으로 돌려 둔다 (정지한 지 오래돼도 탈퇴 직후면 이어져야 한다).
reset role;
update public.banned_identities set created_at = now() - interval '2 years' where user_id = '00000000-0000-4000-8000-00000000000e';
-- 탈퇴 전에는 left_at 이 비어 있어야 한다 (비어 있는 행 수, 하나라도 차 있으면 -1).
insert into rls_note select 129, null, case when bool_and(left_at is null) then count(*) else -1 end
from public.banned_identities where user_id = '00000000-0000-4000-8000-00000000000e';
delete from auth.users where id = '00000000-0000-4000-8000-00000000000e';
insert into check_result select 129, '탈퇴하면 정지 해시에 탈퇴 시각이 적힌다 (탈퇴 전에는 비어 있고, 계정을 지워 프로필이 함께 지워져도 적힌다)', case when
  (select n from rls_note where step = 129) = 1
  and (select left_at is not null and left_at > now() - interval '1 minute' and created_at < now() - interval '1 year'
   from public.banned_identities where hash = public.identity_hash('email', 'rls-e@example.invalid'))
  then 'PASS' else 'FAIL' end;
insert into auth.users (id, aud, role, email, instance_id)
values ('00000000-0000-4000-8000-0000000000e1', 'authenticated', 'authenticated', 'rls-e@example.invalid', '00000000-0000-0000-0000-000000000000');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated","email":"rls-e@example.invalid"}', true);
insert into public.profiles (nickname) values ('E2');
insert into check_result select 113, '정지된 사람이 탈퇴 뒤 같은 계정으로 다시 가입해도 정지가 이어진다', case when (select suspended from public.my_profile()) is true then 'PASS' else 'FAIL' end;
reset role;
insert into check_result select 130, '정지한 지 1년이 넘었어도 탈퇴 직후 다시 가입하면 정지가 이어지고, 해시는 새 계정에 묶여 탈퇴 시각이 비워진다', case when
  (select suspended_at is not null from public.profiles where user_id = '00000000-0000-4000-8000-0000000000e1')
  and (select user_id = '00000000-0000-4000-8000-0000000000e1' and left_at is null and created_at < now() - interval '1 year'
       from public.banned_identities where hash = public.identity_hash('email', 'rls-e@example.invalid'))
  then 'PASS' else 'FAIL' end;
set local role authenticated;
do $$
begin
  perform public.admin_forget_identity('rls-e@example.invalid');
  insert into check_result values (128, '운영자가 아니면 정지 이어 가기 기록을 지우지 못한다', 'FAIL');
exception when others then
  insert into check_result values (128, '운영자가 아니면 정지 이어 가기 기록을 지우지 못한다', case when sqlerrm = 'not_admin' then 'PASS' else 'FAIL' end);
end $$;
-- 운영자 Z가 이 이메일의 기록을 지운다. 지금 정지 중인 계정의 정지는 그대로다.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ad","role":"authenticated","email":"rls-admin@example.invalid"}', true);
select public.admin_forget_identity('rls-e@example.invalid');
reset role;
insert into check_result select 127, '운영자는 이메일로 정지 이어 가기 기록을 지운다 (지금의 정지는 그대로)', case when
  (select count(*) from public.banned_identities where hash = public.identity_hash('email', 'rls-e@example.invalid')) = 0
  and (select suspended_at is not null from public.profiles where user_id = '00000000-0000-4000-8000-0000000000e1')
  then 'PASS' else 'FAIL' end;
insert into check_result select 134, 'pepper 표는 RLS 가 켜져 있고 service_role 을 포함해 어느 역할에도 권한이 없다 (해시 함수는 그대로 읽는다)', case when
  (select relrowsecurity from pg_class where oid = 'private.identity_pepper'::regclass)
  and not has_table_privilege('service_role', 'private.identity_pepper', 'select, insert, update, delete, truncate, references, trigger')
  and not has_table_privilege('authenticated', 'private.identity_pepper', 'select, insert, update, delete, truncate, references, trigger')
  and not has_table_privilege('anon', 'private.identity_pepper', 'select, insert, update, delete, truncate, references, trigger')
  and public.identity_hash('email', 'rls-e@example.invalid') ~ '^[0-9a-f]{64}$'
  then 'PASS' else 'FAIL' end;

-- 운영자는 해시 값으로도 기록을 지운다. 점검용으로 E1 의 정지를 서버 권한으로 다시 걸어 해시를 다시 적고, 그 값을 운영자에게 넘긴다.
update public.profiles set suspended_at = null where user_id = '00000000-0000-4000-8000-0000000000e1';
update public.profiles set suspended_at = now() where user_id = '00000000-0000-4000-8000-0000000000e1';
insert into rls_note select 132, public.identity_hash('email', 'rls-e@example.invalid'), count(*) from public.banned_identities where user_id = '00000000-0000-4000-8000-0000000000e1';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ad","role":"authenticated","email":"rls-admin@example.invalid"}', true);
select public.admin_forget_identity(p_hash => (select upper(hash) from rls_note where step = 132));
do $$
declare
  refused int := 0;
begin
  begin perform public.admin_forget_identity(); exception when others then if sqlerrm = 'bad_request' then refused := refused + 1; end if; end;
  begin perform public.admin_forget_identity(' ', null); exception when others then if sqlerrm = 'bad_request' then refused := refused + 1; end if; end;
  begin perform public.admin_forget_identity(null, 'not-a-hash'); exception when others then if sqlerrm = 'bad_request' then refused := refused + 1; end if; end;
  insert into check_result values (133, '이메일 · 해시가 모두 없거나 해시 꼴이 틀리면 bad_request 로 거절한다', case when refused = 3 then 'PASS' else 'FAIL' end);
end $$;
reset role;
insert into check_result select 132, '운영자는 해시 값으로 정지 이어 가기 기록을 지운다', case when
  (select n from rls_note where step = 132) = 1
  and (select count(*) from public.banned_identities where user_id = '00000000-0000-4000-8000-0000000000e1') = 0
  then 'PASS' else 'FAIL' end;

-- 탈퇴한 지 1년이 지나면 이어지지 않는다: E1 의 정지를 다시 걸고 탈퇴시킨 뒤, 탈퇴 시각을 1년 하루 전으로 돌리고 같은 이메일로 다시 가입한다(E2).
update public.profiles set suspended_at = null where user_id = '00000000-0000-4000-8000-0000000000e1';
update public.profiles set suspended_at = now() where user_id = '00000000-0000-4000-8000-0000000000e1';
delete from auth.users where id = '00000000-0000-4000-8000-0000000000e1';
update public.banned_identities set left_at = now() - interval '1 year 1 day' where hash = public.identity_hash('email', 'rls-e@example.invalid') and left_at is not null;
insert into rls_note select 131, public.identity_hash('email', 'rls-e@example.invalid'), count(*) from public.banned_identities where hash = public.identity_hash('email', 'rls-e@example.invalid') and left_at < now() - interval '1 year';
insert into auth.users (id, aud, role, email, instance_id)
values ('00000000-0000-4000-8000-0000000000e2', 'authenticated', 'authenticated', 'rls-e@example.invalid', '00000000-0000-0000-0000-000000000000');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e2","role":"authenticated","email":"rls-e@example.invalid"}', true);
insert into public.profiles (nickname) values ('E3');
reset role;
insert into check_result select 131, '탈퇴한 지 1년이 지나면 같은 계정으로 다시 가입해도 정지가 이어지지 않고 그 해시는 지워진다', case when
  (select n from rls_note where step = 131) = 1
  and (select suspended_at is null from public.profiles where user_id = '00000000-0000-4000-8000-0000000000e2')
  and (select count(*) from public.banned_identities where hash = public.identity_hash('email', 'rls-e@example.invalid')) = 0
  then 'PASS' else 'FAIL' end;

-- 로그인 수단이 둘(이메일 + google)인 G: 정지 → 탈퇴 → 이메일로만 다시 가입(G2) 하면 정지가 이어지고, 예전 계정의 google 해시도 G2 에 묶인다.
-- 그 뒤 운영자가 정지를 풀면 두 해시가 모두 지워진다. 가입자 상한에 여섯 자리를 넘기지 않게 E2 를 먼저 지운다.
delete from auth.users where id = '00000000-0000-4000-8000-0000000000e2';
insert into auth.users (id, aud, role, email, instance_id)
values ('00000000-0000-4000-8000-000000000071', 'authenticated', 'authenticated', 'rls-g@example.invalid', '00000000-0000-0000-0000-000000000000');
insert into auth.identities (user_id, provider, provider_id, identity_data)
values ('00000000-0000-4000-8000-000000000071', 'google', 'rls-g-google-sub', '{"sub":"rls-g-google-sub","email":"rls-g@example.invalid"}');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000071","role":"authenticated","email":"rls-g@example.invalid"}', true);
insert into public.profiles (nickname) values ('G');
reset role;
update public.profiles set suspended_at = now() where user_id = '00000000-0000-4000-8000-000000000071';
insert into rls_note select 135, null, count(*) from public.banned_identities where user_id = '00000000-0000-4000-8000-000000000071';
delete from auth.users where id = '00000000-0000-4000-8000-000000000071';
insert into auth.users (id, aud, role, email, instance_id)
values ('00000000-0000-4000-8000-000000000072', 'authenticated', 'authenticated', 'rls-g@example.invalid', '00000000-0000-0000-0000-000000000000');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000072","role":"authenticated","email":"rls-g@example.invalid"}', true);
insert into public.profiles (nickname) values ('G2');
reset role;
insert into check_result select 135, '이어 받으면 예전 계정의 다른 로그인 수단 해시도 새 계정에 묶인다 (이메일 + google)', case when
  (select n from rls_note where step = 135) = 2
  and (select suspended_at is not null from public.profiles where user_id = '00000000-0000-4000-8000-000000000072')
  and (select count(*) from public.banned_identities
       where user_id = '00000000-0000-4000-8000-000000000072' and left_at is null
         and hash in (public.identity_hash('email', 'rls-g@example.invalid'), public.identity_hash('google', 'rls-g-google-sub'))) = 2
  then 'PASS' else 'FAIL' end;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ad","role":"authenticated","email":"rls-admin@example.invalid"}', true);
select public.admin_unsuspend('00000000-0000-4000-8000-000000000072');
reset role;
insert into check_result select 136, '이어 받은 계정의 정지를 풀면 그 사람의 해시가 모두 지워진다 (예전 계정의 google 해시까지)', case when
  (select suspended_at is null from public.profiles where user_id = '00000000-0000-4000-8000-000000000072')
  and (select count(*) from public.banned_identities
       where hash in (public.identity_hash('email', 'rls-g@example.invalid'), public.identity_hash('google', 'rls-g-google-sub'))
          or user_id in ('00000000-0000-4000-8000-000000000071', '00000000-0000-4000-8000-000000000072')) = 0
  then 'PASS' else 'FAIL' end;

-- 같은 꼴의 H: 이어 받은 뒤 운영자가 이메일로 지우면(admin_forget_identity) 그 사람의 해시가 모두 지워진다 (정지는 그대로). G2 를 먼저 지운다.
delete from auth.users where id = '00000000-0000-4000-8000-000000000072';
insert into auth.users (id, aud, role, email, instance_id)
values ('00000000-0000-4000-8000-000000000081', 'authenticated', 'authenticated', 'rls-h@example.invalid', '00000000-0000-0000-0000-000000000000');
insert into auth.identities (user_id, provider, provider_id, identity_data)
values ('00000000-0000-4000-8000-000000000081', 'google', 'rls-h-google-sub', '{"sub":"rls-h-google-sub","email":"rls-h@example.invalid"}');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000081","role":"authenticated","email":"rls-h@example.invalid"}', true);
insert into public.profiles (nickname) values ('H');
reset role;
update public.profiles set suspended_at = now() where user_id = '00000000-0000-4000-8000-000000000081';
delete from auth.users where id = '00000000-0000-4000-8000-000000000081';
insert into auth.users (id, aud, role, email, instance_id)
values ('00000000-0000-4000-8000-000000000082', 'authenticated', 'authenticated', 'rls-h@example.invalid', '00000000-0000-0000-0000-000000000000');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000082","role":"authenticated","email":"rls-h@example.invalid"}', true);
insert into public.profiles (nickname) values ('H2');
reset role;
insert into rls_note select 137, null, count(*) from public.banned_identities where user_id = '00000000-0000-4000-8000-000000000082';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ad","role":"authenticated","email":"rls-admin@example.invalid"}', true);
select public.admin_forget_identity(p_email => 'rls-h@example.invalid');
reset role;
insert into check_result select 137, '이어 받은 계정을 운영자가 이메일로 지우면 그 사람의 해시가 모두 지워진다 (예전 계정의 google 해시까지, 정지는 그대로)', case when
  (select n from rls_note where step = 137) = 2
  and (select suspended_at is not null from public.profiles where user_id = '00000000-0000-4000-8000-000000000082')
  and (select count(*) from public.banned_identities
       where hash in (public.identity_hash('email', 'rls-h@example.invalid'), public.identity_hash('google', 'rls-h-google-sub'))
          or user_id in ('00000000-0000-4000-8000-000000000081', '00000000-0000-4000-8000-000000000082')) = 0
  then 'PASS' else 'FAIL' end;
set local role authenticated;

-- A가 B의 차단을 푼다: 다시 보인다. 예전 탈퇴 함수는 가입자도 부르지 못한다 (탈퇴는 account-delete 서버 함수로).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated","email":"rls-a@example.invalid"}', true);
select public.unblock_user('00000000-0000-4000-8000-00000000000b');
insert into check_result select 114, '차단을 풀면 그 사람의 글 · 프로필이 다시 보인다', case when (select count(*) from public.profile_summary('00000000-0000-4000-8000-00000000000b')) = 1 and (select count(*) from public.feed_page(null, '00000000-0000-4000-8000-00000000000b')) >= 1 and (select count(*) from public.my_blocks()) = 0 then 'PASS' else 'FAIL' end;
do $$
begin
  begin
    perform public.delete_my_account();
    raise exception 'undo_delete';
  exception when raise_exception then
    insert into check_result values (116, '예전 탈퇴 함수 delete_my_account() 는 가입자도 부르지 못한다', 'FAIL');
    return;
  end;
exception when others then
  insert into check_result values (116, '예전 탈퇴 함수 delete_my_account() 는 가입자도 부르지 못한다', 'PASS');
end $$;

-- 아래 로그인하지 않은 점검에 쓰도록 D의 'rls-d-hide' 를 다시 숨겨 둔다 (서버 권한).
reset role;
update public.posts set hidden_at = now() where column_id = 'rls-d-hide';
set local role authenticated;

-- 가입하지 않은(약관에 동의하지 않은) 로그인 사용자 C
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000c","role":"authenticated","email":"rls-c@example.invalid"}', true);
-- 0009 부터 피드 읽기는 누구에게나 열려 있다. 표는 여전히 가입자만 직접 읽는다.
insert into check_result select 21, '가입하지 않은 사용자는 표를 직접 읽지 못한다', case when (select count(*) from public.posts) = 0 and (select count(*) from public.post_comments) = 0 and (select count(*) from public.profiles) = 0 then 'PASS' else 'FAIL' end;
insert into check_result select 52, '가입하지 않은 사용자도 피드를 읽는다', case when (select count(*) from public.feed_page() where column_id = 'rls-a-post') = 1 and (select count(*) from public.profile_summary('00000000-0000-4000-8000-00000000000a')) = 1 then 'PASS' else 'FAIL' end;
do $$
begin
  insert into public.post_likes (post_id) select id from public.posts limit 1;
  insert into public.post_likes (post_id) select id from public.feed_page() where column_id = 'rls-a-post';
  insert into check_result values (53, '가입하지 않은 사용자는 좋아요를 누르지 못한다', 'FAIL');
exception when others then
  insert into check_result values (53, '가입하지 않은 사용자는 좋아요를 누르지 못한다', 'PASS');
end $$;

-- 로그인하지 않은 접근
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
insert into check_result select 11, '로그인하지 않으면 초안이 보이지 않는다', case when (select count(*) from public.drafts) = 0 then 'PASS' else 'FAIL' end;
insert into check_result select 22, '로그인하지 않으면 표를 직접 읽지 못한다', case when (select count(*) from public.posts) = 0 and (select count(*) from public.post_comments) = 0 then 'PASS' else 'FAIL' end;
insert into check_result select 54, '로그인하지 않아도 피드 · 인기 칼럼리스트 · 프로필 · 검색을 읽는다', case when (select count(*) from public.feed_page() where column_id = 'rls-a-post') = 1 and (select not liked from public.feed_page() where column_id = 'rls-a-post') and (select count(*) from public.popular_columnists(30) where user_id = '00000000-0000-4000-8000-00000000000a') = 1 and (select count(*) from public.profile_summary('00000000-0000-4000-8000-00000000000a')) = 1 and (select count(*) from public.feed_page(null, null, 20, null, false, '공개') where column_id = 'rls-a-post') = 1 and (select count(*) from public.search_columnists('B', 20)) >= 1 then 'PASS' else 'FAIL' end;
insert into check_result select 55, '로그인하지 않아도 본문과 댓글을 읽는다', case when (select public.post_body(id) is not null from public.feed_page() where column_id = 'rls-a-post') and (select count(*) from public.post_comment_list((select id from public.feed_page() where column_id = 'rls-a-post'))) = (select comment_count from public.feed_page() where column_id = 'rls-a-post') then 'PASS' else 'FAIL' end;
insert into check_result select 56, '로그인하지 않은 사람에게는 접속 시각을 주지 않는다', case when (select count(*) from public.popular_columnists(30) where last_seen_at is not null) = 0 and (select last_seen_at is null from public.profile_summary('00000000-0000-4000-8000-00000000000a')) and (select count(*) from public.search_columnists('B', 20) where last_seen_at is not null) = 0 then 'PASS' else 'FAIL' end;
insert into check_result select 57, '로그인하지 않으면 팔로잉 피드는 비어 있다', case when (select count(*) from public.feed_page(null, null, 20, null, true)) = 0 then 'PASS' else 'FAIL' end;
do $$
begin
  insert into public.post_comments (post_id, body) select id, '손님 댓글' from public.feed_page() where column_id = 'rls-a-post';
  insert into check_result values (58, '로그인하지 않으면 댓글을 쓰지 못한다', 'FAIL');
exception when others then
  insert into check_result values (58, '로그인하지 않으면 댓글을 쓰지 못한다', 'PASS');
end $$;

do $$
begin
  perform public.admin_daily_active(14);
  insert into check_result values (68, '로그인하지 않으면 하루 이용 인원을 보지 못한다', 'FAIL');
exception when others then
  insert into check_result values (68, '로그인하지 않으면 하루 이용 인원을 보지 못한다', 'PASS');
end $$;
-- 0013_daily_visitors.sql 부터: 로그인하지 않아도 방문을 센다. 점검이 실제 숫자를 바꾸지 않도록 안쪽 블록에서 일부러 오류를 내 되돌린다.
do $$
declare
  counted text;
begin
  begin
    raise exception 'undo_visit' using detail = public.count_visit()::text;
  exception when raise_exception then
    get stacked diagnostics counted = pg_exception_detail;
  end;
  insert into check_result values (69, '로그인하지 않아도 방문을 센다 (숫자만 오르고 아무 값도 받지 않는다)', case when counted = ((now() at time zone 'Asia/Seoul')::date)::text then 'PASS' else 'FAIL' end);
exception when others then
  insert into check_result values (69, '로그인하지 않아도 방문을 센다 (숫자만 오르고 아무 값도 받지 않는다)', 'FAIL');
end $$;
do $$
begin
  perform count(*) from public.daily_active;
  insert into check_result values (70, '로그인하지 않으면 날짜별 숫자 표를 직접 읽지 못한다', 'FAIL');
exception when others then
  insert into check_result values (70, '로그인하지 않으면 날짜별 숫자 표를 직접 읽지 못한다', 'PASS');
end $$;

-- 0014 부터: 로그인하지 않으면 신고 · 차단 표를 읽지 못하고, 신고 · 차단 함수를 부르지 못한다.
do $$
declare
  ok int := 0;
  seen bigint;
begin
  begin
    select count(*) into seen from public.reports;
    if seen = 0 then ok := ok + 1; end if;
  exception when others then ok := ok + 1;
  end;
  begin
    select count(*) into seen from public.blocks;
    if seen = 0 then ok := ok + 1; end if;
  exception when others then ok := ok + 1;
  end;
  begin
    perform public.report_content('post', (select id from public.feed_page() where column_id = 'rls-a-post'), 'spam');
  exception when others then ok := ok + 1;
  end;
  begin
    perform public.block_user('00000000-0000-4000-8000-00000000000a');
  exception when others then ok := ok + 1;
  end;
  insert into check_result values (93, '로그인하지 않으면 신고 · 차단 표를 읽지 못하고 신고 · 차단하지 못한다', case when ok = 4 then 'PASS' else 'FAIL' end);
end $$;

-- 0015_app_support.sql 부터: 앱 방문은 'app' 으로 센다. 69번처럼 안쪽 블록에서 일부러 오류를 내 숫자를 되돌린다.
do $$
declare
  counted text;
begin
  begin
    raise exception 'undo_visit' using detail = public.count_visit('app')::text;
  exception when raise_exception then
    get stacked diagnostics counted = pg_exception_detail;
  end;
  insert into check_result values (94, '로그인하지 않아도 앱 방문을 센다', case when counted = ((now() at time zone 'Asia/Seoul')::date)::text then 'PASS' else 'FAIL' end);
exception when others then
  insert into check_result values (94, '로그인하지 않아도 앱 방문을 센다', 'FAIL');
end $$;
do $$
begin
  perform public.count_visit('tv');
  insert into check_result values (95, '정해지지 않은 방문 출처는 받지 않는다', 'FAIL');
exception when others then
  insert into check_result values (95, '정해지지 않은 방문 출처는 받지 않는다', case when sqlerrm = 'bad_source' then 'PASS' else 'FAIL' end);
end $$;

-- 0014 부터: 대표 사진 보관함은 보이는 글의 사진만 내준다 (rls-d-hide 는 위에서 다시 숨겨 두었다).
insert into check_result select 100, '로그인하지 않은 사람은 숨긴 글의 대표 사진을 받지 못하고, 보이는 글의 사진은 받는다', case when
  not public.cover_visible('00000000-0000-4000-8000-00000000000d/rls-d-hide')
  and public.cover_visible('00000000-0000-4000-8000-00000000000d/rls-d-post')
  and (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'post-covers:%'
       and cmd = 'SELECT' and qual like '%cover_visible%' and 'anon' = any (roles)) = 1
  and (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'post-covers: 누구나 조회') = 0
  then 'PASS' else 'FAIL' end;
do $$
declare
  refused int := 0;
begin
  begin perform public.my_profile(); exception when others then refused := refused + 1; end;
  begin perform public.my_blocks(); exception when others then refused := refused + 1; end;
  begin perform public.admin_reports('open'); exception when others then refused := refused + 1; end;
  begin perform public.unblock_user('00000000-0000-4000-8000-00000000000a'); exception when others then refused := refused + 1; end;
  insert into check_result values (115, '로그인하지 않으면 my_profile · my_blocks · 운영자 함수 · 차단 풀기를 부르지 못한다', case when refused = 4 then 'PASS' else 'FAIL' end);
end $$;
do $$
begin
  perform public.bump_rate('rls-x', 1, 60);
  insert into check_result values (123, '로그인하지 않으면 빈도 제한 함수 bump_rate 를 부르지 못한다', 'FAIL');
exception when others then
  insert into check_result values (123, '로그인하지 않으면 빈도 제한 함수 bump_rate 를 부르지 못한다', 'PASS');
end $$;
do $$
declare
  refused int := 0;
begin
  begin perform count(*) from public.rate_limits; exception when others then if sqlstate = '42501' then refused := refused + 1; end if; end;
  begin perform count(*) from public.banned_identities; exception when others then if sqlstate = '42501' then refused := refused + 1; end if; end;
  begin perform count(*) from private.identity_pepper; exception when others then if sqlstate = '42501' then refused := refused + 1; end if; end;
  begin insert into public.rate_limits (key) values ('rls-x'); exception when others then if sqlstate = '42501' then refused := refused + 1; end if; end;
  begin insert into public.banned_identities (hash) values (repeat('0', 64)); exception when others then if sqlstate = '42501' then refused := refused + 1; end if; end;
  begin insert into private.identity_pepper (id, pepper) values (2, decode('00', 'hex')); exception when others then if sqlstate = '42501' then refused := refused + 1; end if; end;
  insert into check_result values (125, '로그인하지 않으면 rate_limits · banned_identities · pepper 표를 읽거나 쓰지 못한다', case when refused = 6 then 'PASS' else 'FAIL' end);
end $$;
do $$
declare
  refused int := 0;
begin
  begin perform public.naver_app_put(repeat('r', 43), 'rls-x', 'email'); exception when others then if sqlstate = '42501' then refused := refused + 1; end if; end;
  begin perform public.naver_app_take(repeat('r', 43)); exception when others then if sqlstate = '42501' then refused := refused + 1; end if; end;
  insert into check_result values (140, '로그인하지 않으면 네이버 앱 로그인 함수 naver_app_put · naver_app_take 를 부르지 못한다', case when refused = 2 then 'PASS' else 'FAIL' end);
end $$;
do $$
declare
  refused int := 0;
begin
  begin perform count(*) from public.naver_app_pending; exception when others then if sqlstate = '42501' then refused := refused + 1; end if; end;
  begin insert into public.naver_app_pending (state, token_hash) values (repeat('r', 43), 'rls-x'); exception when others then if sqlstate = '42501' then refused := refused + 1; end if; end;
  begin delete from public.naver_app_pending; exception when others then if sqlstate = '42501' then refused := refused + 1; end if; end;
  insert into check_result values (141, '로그인하지 않으면 naver_app_pending 표를 읽거나 쓰거나 지우지 못한다', case when refused = 3 then 'PASS' else 'FAIL' end);
end $$;

-- 뒷정리: 가짜 사용자를 지운다. 딸린 프로필·초안·글·좋아요·댓글·신고·차단도 함께 지워진다.
reset role;

-- 0015 부터: 인자 없는 count_visit() 은 웹으로, count_visit('app') 은 앱으로 세고 visitors 는 둘의 합이다. 숫자는 되돌린다.
do $$
declare
  moved text;
  w0 int; a0 int; v0 int;
  w1 int; a1 int; v1 int;
  today date := (now() at time zone 'Asia/Seoul')::date;
begin
  begin
    select coalesce(max(d.web), 0), coalesce(max(d.app), 0), coalesce(max(d.visitors), 0) into w0, a0, v0 from public.daily_active d where d.day = today;
    perform public.count_visit();
    perform public.count_visit('app');
    select coalesce(max(d.web), 0), coalesce(max(d.app), 0), coalesce(max(d.visitors), 0) into w1, a1, v1 from public.daily_active d where d.day = today;
    raise exception 'undo_visit' using detail = format('%s,%s,%s', w1 - w0, a1 - a0, v1 - v0);
  exception when raise_exception then
    get stacked diagnostics moved = pg_exception_detail;
  end;
  insert into check_result values (96, '인자 없는 방문 세기는 웹으로, app 은 앱으로 세고 합계도 오른다', case when moved = '1,1,2' then 'PASS' else 'FAIL' end);
exception when others then
  insert into check_result values (96, '인자 없는 방문 세기는 웹으로, app 은 앱으로 세고 합계도 오른다', 'FAIL');
end $$;

-- 0016 부터: 받아 둔 로그인 표는 한 번만 꺼내지고, 같은 state 는 두 번 들어가지 않고, 만료된 것은 내주지 않고 치워진다.
-- 서버 함수가 부르는 모습 그대로 시험하고, 안쪽 블록에서 일부러 오류를 내 넣은 행을 모두 되돌린다.
-- 적는 순서: 넣기 · 같은 state 다시 넣기 · 보관 시간 · 꺼낸 표:남은 행 · 다시 꺼내기 · 만료 꺼내기:남은 행 · 틀린 꼴 · 넣기 전 꺼내기.
do $$
declare
  steps text;
  s1 text := repeat('Q', 42) || 'a';
  s2 text := repeat('Q', 42) || 'b';
  r text[] := '{}';
  bad text := 'ok';
  early jsonb;
  took jsonb;
begin
  begin
    begin
      perform public.naver_app_put('too-short', 'rls-h', 'email');
    exception when check_violation then
      bad := 'refused';
    end;
    early := public.naver_app_take(s1);
    r := r || public.naver_app_put(s1, 'rls-h1', 'email')::text;
    r := r || public.naver_app_put(s1, 'rls-h2', 'email')::text;
    r := r || (select (p.expires_at - p.created_at)::text from public.naver_app_pending p where p.state = s1);
    took := public.naver_app_take(s1);
    r := r || (coalesce(took ->> 'token_hash', 'null') || '/' || coalesce(took ->> 'kind', 'null') || ':'
               || (select count(*) from public.naver_app_pending p where p.state = s1));
    took := public.naver_app_take(s1);
    r := r || coalesce(took ->> 'token_hash', 'null');
    -- 만료된 행은 꺼내기 바로 앞에 넣는다 (넣기 · 꺼내기가 지난 행을 먼저 치우므로 앞에 넣으면 만료 확인까지 가지 않는다).
    insert into public.naver_app_pending (state, token_hash, created_at, expires_at)
    values (s2, 'rls-old', now() - interval '3 minutes', now() - interval '1 minute');
    took := public.naver_app_take(s2);
    r := r || (coalesce(took ->> 'token_hash', 'null') || ':' || (select count(*) from public.naver_app_pending p where p.state = s2));
    r := r || bad;
    r := r || coalesce(early ->> 'token_hash', 'null');
    raise exception 'undo_naver_app' using detail = array_to_string(r, ',');
  exception when raise_exception then
    get stacked diagnostics steps = pg_exception_detail;
  end;
  insert into check_result values (142, '네이버 앱 로그인 표는 2분 동안 한 번만 꺼내지고, 같은 state 는 거절, 만료는 내주지 않고 치운다',
    case when steps = 'true,false,00:02:00,rls-h1/email:0,null,null:0,refused,null' then 'PASS' else 'FAIL' end);
exception when others then
  insert into check_result values (142, '네이버 앱 로그인 표는 2분 동안 한 번만 꺼내지고, 같은 state 는 거절, 만료는 내주지 않고 치운다', 'FAIL');
end $$;
insert into check_result select 143, 'naver_app_pending 은 RLS 가 켜져 있고 정책이 없다 (서버 함수 전용)', case when
  (select c.relrowsecurity from pg_class c where c.oid = 'public.naver_app_pending'::regclass)
  and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'naver_app_pending') = 0
  then 'PASS' else 'FAIL' end;

delete from auth.users where id in ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000d',
  '00000000-0000-4000-8000-00000000000e', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-00000000000f',
  '00000000-0000-4000-8000-0000000000ad', '00000000-0000-4000-8000-000000000071', '00000000-0000-4000-8000-000000000072',
  '00000000-0000-4000-8000-000000000081', '00000000-0000-4000-8000-000000000082');
delete from public.banned_words where word = public.moderation_text('rls금칙어시험');
-- 정지 해시는 탈퇴해도 남는 것이 정상이다. 점검용 E 의 것만 지운다.
delete from public.banned_identities where hash in (public.identity_hash('email', 'rls-e@example.invalid'),
  public.identity_hash('email', 'rls-g@example.invalid'), public.identity_hash('google', 'rls-g-google-sub'),
  public.identity_hash('email', 'rls-h@example.invalid'), public.identity_hash('google', 'rls-h-google-sub'));
update public.app_config set value = value - 'rls-admin@example.invalid' where key = 'admin_emails';

commit;

select step, name, result from check_result order by step;
