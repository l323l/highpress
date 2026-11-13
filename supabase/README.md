# Supabase 설정 (계정 · 초안 동기화 · 배포용 스탯 서버)

앱은 Supabase 없이도 지금처럼 기기 저장만으로 동작합니다. 아래를 마치면 로그인, 초안 동기화, 배포판의 스탯 조회가 켜집니다.
전부 무료 플랜 범위이고 결제수단을 등록하지 않습니다.

## 1. 프로젝트 만들기
1. https://supabase.com 에서 가입 → New project (지역은 가까운 곳, 예: Northeast Asia (Seoul)).
2. Project Settings → API 에서 두 값을 확인합니다.
   - Project URL
   - anon (publishable) key — 브라우저에 들어가도 되는 공개 키입니다. **service_role 키는 어디에도 붙여 넣지 않습니다.**
3. 프로젝트 루트의 `.env.local` 에 추가합니다.
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=...
   ```

## 2. 테이블과 보안 규칙 넣기
SQL Editor 에 `supabase/migrations/0001_init.sql` 전체를 붙여 넣고 Run 합니다. 한 번만 실행합니다.

## 3. Google 로그인 켜기
1. https://console.cloud.google.com → API 및 서비스 → 사용자 인증 정보 → OAuth 클라이언트 ID 만들기 (웹 애플리케이션).
2. 승인된 리디렉션 URI 에 Supabase 가 알려 주는 주소를 넣습니다: `https://xxxx.supabase.co/auth/v1/callback`
3. Supabase → Authentication → Providers → Google 에 Client ID 와 Client Secret 을 넣고 켭니다.
4. Authentication → URL Configuration 의 Site URL 과 Redirect URLs 에 앱 주소를 넣습니다.
   - 개발: `http://localhost:5173`
   - 배포: 호스팅 주소 (예: `https://example.pages.dev`)

## 4. 스탯 서버 올리기 (배포판에서 스탯을 쓰려면)
Supabase CLI 가 필요합니다 (`npx supabase` 로 설치 없이 쓸 수 있습니다).
```
npx supabase login
npx supabase link --project-ref <프로젝트 ref>
npx supabase secrets set FOOTBALL_DATA_TOKEN=... API_FOOTBALL_KEY=... APP_ORIGINS=http://localhost:5173,https://<배포 주소>
npx supabase functions deploy stats
```
키는 명령을 직접 실행해 넣습니다. 채팅이나 코드에 붙여 넣지 않습니다.

## 5. 운영 설정 넣기 (운영자 화면과 자동 제한)
1. SQL Editor 에 `supabase/migrations/0002_ops.sql` 전체를 붙여 넣고 Run 합니다.
2. 운영자 계정을 지정합니다 (Google 로그인에 쓰는 이메일, 소문자).
   ```sql
   update public.app_config set value = '["me@example.com"]' where key = 'admin_emails';
   ```
3. 앱 주소 뒤에 `#/admin` 을 붙여 열면 운영 현황이 보입니다 (예: `https://<배포 주소>/#/admin`).
4. 스탯 서버를 다시 올립니다: `npx supabase functions deploy stats --project-ref <프로젝트 ref> --use-api`

## 6. 칼럼 피드 켜기
SQL Editor 에 `supabase/migrations/0003_feed.sql` 전체를 붙여 넣고 Run 합니다.
게시글·좋아요·댓글 테이블이 생기고, 가입자끼리 닉네임과 마지막 접속 시각을 볼 수 있게 됩니다.
넣기 전에는 홈 화면의 피드 탭에 "피드를 불러오지 못했습니다"가 보입니다. 실행한 뒤 아래 7번 점검을 다시 합니다.

- 문제가 되는 글 지우기(운영자): `delete from public.posts where id = '<글 id>';`
- 댓글 지우기(운영자): `delete from public.post_comments where id = '<댓글 id>';`
- 올라온 글 수: `select count(*) from public.posts;`

### 구단 필터 · 프로필 · 팔로우 켜기
SQL Editor 에 `supabase/migrations/0004_social.sql` 전체를 붙여 넣고 Run 합니다.
글에 구단 태그가, 프로필에 한 줄 소개와 응원 구단이 생기고, 팔로우 테이블과 인기 칼럼리스트·프로필 조회 함수가 만들어집니다.
넣기 전에도 피드의 전체 보기와 글 올리기(구단 "없음")는 그대로 됩니다. 구단·팔로잉으로 거르기, 인기 칼럼리스트, 프로필 화면, 팔로우는 넣은 뒤에 동작합니다.
실행한 뒤 아래 7번 점검을 다시 합니다 (팔로우·프로필 항목이 늘었습니다. `0004_social.sql` 을 넣기 전에 점검을 돌리면 오류가 납니다).

### 검색 켜기
SQL Editor 에 `supabase/migrations/0005_search.sql` 전체를 붙여 넣고 Run 합니다.
피드의 글(제목·앞부분·글쓴이 이름)과 칼럼리스트(닉네임)를 찾는 함수가 만들어지고, 피드를 리그 단위(구단 여러 개)로 거를 수 있게 됩니다. 가입자만 쓸 수 있습니다.
넣기 전에도 피드와 구단 하나·팔로잉 거르기는 그대로 됩니다. 맨 위 검색창으로 찾기와 리그로 보기만 넣은 뒤에 동작합니다.
실행한 뒤 아래 7번 점검을 다시 합니다 (검색 항목이 늘었습니다. `0005_search.sql` 을 넣기 전에 점검을 돌리면 오류가 납니다).

### 좋아요순 켜기
SQL Editor 에 `supabase/migrations/0007_sort.sql` 전체를 붙여 넣고 Run 합니다. `0005_search.sql` 을 먼저 넣어야 합니다.
피드를 좋아요가 많은 순으로 늘어놓을 수 있게 됩니다. 넣기 전에도 최신순은 그대로 되고, "좋아요순"을 누르면 서버 설정이 필요하다는 안내가 보입니다.
실행한 뒤 아래 7번 점검을 다시 합니다 (정렬 항목이 늘었습니다. `0007_sort.sql` 을 넣기 전에 점검을 돌리면 오류가 납니다).

### 대표 사진 켜기
SQL Editor 에 `supabase/migrations/0008_cover.sql` 전체를 붙여 넣고 Run 합니다. `0007_sort.sql` 을 먼저 넣어야 합니다.
피드에 올리는 글에 사진을 한 장 붙일 수 있게 됩니다. 사진을 두는 비공개 보관함(`post-covers`)이 생기고, 가입자만 볼 수 있습니다. 한 장에 400KB까지, 한 사람 20장까지입니다.
넣기 전에도 "사진 없이"로는 지금처럼 올라가고, 사진을 고르고 올리면 서버 설정이 필요하다는 안내가 보입니다.
실행한 뒤 아래 7번 점검을 다시 합니다 (대표 사진 항목이 늘었습니다. `0008_cover.sql` 을 넣기 전에 점검을 돌리면 오류가 납니다).

### 로그인 없이 피드 읽기 켜기
SQL Editor 에 `supabase/migrations/0009_public_read.sql` 전체를 붙여 넣고 Run 합니다. `0008_cover.sql` 을 먼저 넣어야 합니다.
피드의 글, 인기 칼럼리스트, 프로필, 검색, 본문, 댓글, 대표 사진을 로그인하지 않은 사람도 읽게 됩니다. 열리는 것은 읽기뿐이고, 글 올리기 · 좋아요 · 댓글 · 팔로우는 그대로 가입자만 합니다. 로그인하지 않은 사람에게는 마지막 접속 시각을 주지 않습니다.
넣기 전에는 로그인하지 않은 사람에게 예전처럼 로그인 안내가 보입니다. 가입자의 화면은 넣기 전후가 같습니다.
실행한 뒤 아래 7번 점검을 다시 합니다 (항목이 58번까지 늘었습니다. `0009_public_read.sql` 을 넣기 전에 점검을 돌리면 오류가 납니다).

- 되돌리려면 `0008_cover.sql` 과 `0007_sort.sql`, `0005_search.sql`, `0004_social.sql` 을 다시 실행합니다 (가입자 조건이 든 예전 함수로 돌아갑니다). 그리고 `drop policy "post-covers: 누구나 조회" on storage.objects;` 를 실행합니다.
- 주소를 아는 사람은 누구나 읽을 수 있으므로, 무료 한도의 요청 수가 가입자 수와 무관하게 늘 수 있습니다. 사용량은 대시보드에서 봅니다.

### 답글과 댓글 좋아요 켜기
SQL Editor 에 `supabase/migrations/0010_comment_threads.sql` 전체를 붙여 넣고 Run 합니다. `0009_public_read.sql` 을 먼저 넣어야 합니다.
댓글에 답글을 달고 댓글에 좋아요를 누를 수 있게 됩니다. 답글은 4단계까지 들어가고, 그보다 깊이 달면 같은 단계에 붙습니다. 답글이 달린 댓글을 지우면 내용과 이름만 지워지고 자리는 남습니다.
넣기 전에도 댓글 읽기와 쓰기는 지금처럼 되고, 답글 달기나 댓글 좋아요를 누르면 서버 설정이 필요하다는 안내가 보입니다.
실행한 뒤 아래 7번 점검을 다시 합니다 (항목이 65번까지 늘었습니다. `0010_comment_threads.sql` 을 넣기 전에 점검을 돌리면 오류가 납니다).

### 프로필 사진 켜기
SQL Editor 에 `supabase/migrations/0011_avatar.sql` 전체를 붙여 넣고 Run 합니다. `0010_comment_threads.sql` 을 먼저 넣어야 합니다.
프로필에 사진 한 장을 넣을 수 있게 됩니다. 사진을 두는 공개 보관함(`avatars`)이 생깁니다. 256px 로 줄인 사본만 올라오고 한 장에 200KB까지입니다. 공개 보관함이라 주소를 아는 사람은 누구나 사진을 볼 수 있습니다.
넣기 전에도 나머지는 지금처럼 되고, 프로필에서 사진을 고르고 저장하면 서버 설정이 필요하다는 안내가 보입니다.
실행한 뒤 아래 7번 점검을 다시 합니다 (피드 · 프로필 · 댓글 함수를 다시 만들기 때문입니다. 항목 수는 그대로 65번까지입니다).

- 부적절한 사진을 내리려면 대시보드 → Storage → `avatars` → `<사용자 id>` 폴더의 파일을 지우고, SQL Editor 에서 `update public.profiles set avatar = null where user_id = '<사용자 id>';` 를 실행합니다.

- 사진은 데이터베이스(500MB)가 아니라 파일 보관함(1GB)을 씁니다. 사용량은 대시보드의 Storage 에서 봅니다. `#/admin` 의 자동 제한은 보관함 사용량을 세지 않습니다.
- 운영자가 SQL 로 글을 지우면 사진 파일은 남습니다. 대시보드 → Storage → `post-covers` → `<글쓴이 id>/<칼럼 id>` 를 직접 지웁니다.
- 글쓴이가 글을 내리거나 탈퇴하면 앱이 사진도 함께 지웁니다.

### 하루 이용 인원 켜기
SQL Editor 에 `supabase/migrations/0012_daily_active.sql` 전체를 붙여 넣고 Run 합니다. `0011_avatar.sql` 을 먼저 넣어야 합니다.
`#/admin` 아래쪽에 "하루 이용 인원"이 생깁니다. 그날(한국 시간) 앱을 연 로그인 사용자 수를 날짜별로 보여 줍니다 (최근 14일, 오늘 · 어제 · 최근 7일 평균). 누가 접속했는지는 남기지 않고 날짜별 숫자만 둡니다. 로그인하지 않은 방문자는 세지 않습니다.
넣은 날부터 셉니다. 넣기 전에는 그 자리에 이 파일을 넣으라는 안내가 보이고, 나머지 운영 현황은 그대로 보입니다.
실행한 뒤 아래 7번 점검을 다시 합니다 (항목이 68번까지 늘었습니다. `0012_daily_active.sql` 을 넣기 전에 점검을 돌리면 오류가 납니다).

### 하루 방문자 켜기 (로그인하지 않은 방문자까지)
SQL Editor 에 `supabase/migrations/0013_daily_visitors.sql` 전체를 붙여 넣고 Run 합니다. `0012_daily_active.sql` 을 먼저 넣어야 합니다.
`#/admin` 의 "하루 방문자"에 로그인하지 않은 사람까지 그날 앱을 연 수가 나오고, 그 옆에 그중 로그인한 사람 수가 함께 나옵니다.
- 서버에는 날짜별 숫자만 있습니다. 앱은 방문자를 알아볼 값을 보내지 않고, 브라우저에 마지막으로 센 날짜만 적어 두어 같은 브라우저를 하루에 한 번만 셉니다.
- 그래서 정확한 사람 수가 아니라 "브라우저 수"입니다. 같은 사람이 휴대폰과 PC로 열면 2, 저장 공간을 지우거나 시크릿 창을 새로 열면 다시 셉니다. 누구나 부를 수 있는 함수라 일부러 여러 번 부르면 숫자가 부풀 수 있습니다.
- 넣기 전에는 그 자리에 로그인한 사람 수만 보이고, 이 파일을 넣으라는 안내가 함께 보입니다.
실행한 뒤 아래 7번 점검을 다시 합니다 (항목이 70번까지 늘었습니다. 69번은 방문을 한 번 세어 본 뒤 되돌리므로 실제 숫자는 바뀌지 않습니다).

### 신고 · 차단 · 금칙어 · 이용 정지 켜기 (앱 A1, 웹에도 적용)
아래 순서대로 합니다. 앞의 것이 끝나야 다음 것이 동작합니다.
1. SQL Editor 에 `supabase/migrations/0014_moderation.sql` 전체를 붙여 넣고 Run 합니다. `0013_daily_visitors.sql` 을 먼저 넣어야 합니다.
   예전 판의 0014 를 이미 넣었어도 지금 판을 그대로 다시 실행합니다 (금칙어 검사 규칙을 새로 걸고, 정지 해시 표에 `user_id` · `left_at` 칸을 더하고, HMAC 이전 형식의 해시를 지운 뒤 지금 정지 중인 계정의 해시를 다시 적습니다). pg_cron 이 켜져 있으면 정기 정리 `football-column-cleanup` 에 정지 해시 정리 한 줄이 더해집니다.
2. SQL Editor 에 `supabase/migrations/0015_app_support.sql` 전체를 붙여 넣고 Run 합니다 (방문 출처 웹 · 앱 나눠 세기, 가입자 상한 100명, 네이버 로그인 빈도 제한 표).
3. 네이버 로그인 함수를 다시 올립니다 (0015 를 넣은 뒤에. 빈도 제한 표가 없으면 이 함수는 503 으로 멈춥니다): `npx supabase functions deploy naver-login --no-verify-jwt --project-ref <프로젝트 ref> --use-api`
4. 탈퇴 함수를 올립니다 (로그인 토큰 검사를 켠 채로): `npx supabase functions deploy account-delete --project-ref <프로젝트 ref> --use-api`
5. 네이버 카페 함수도 다시 올립니다 (로그인 코드 교환에 verifier 확인이 들어갔습니다): `npx supabase functions deploy naver --project-ref <프로젝트 ref> --use-api`
6. 아래 7번 점검을 다시 합니다 (항목이 137번까지 늘었습니다. 가짜 사용자가 여섯으로 늘어 가입자 상한에 여섯 자리가 비어 있어야 합니다. 점검 동안만 운영자 목록에 `rls-admin@example.invalid` 를 더했다가 뺍니다).
7. 배포 뒤 머리글 확인: naver-login 의 빈도 제한은 `cf-connecting-ip` → `x-real-ip` → `x-forwarded-for` 마지막 값 순서로 IP 를 읽습니다. 셋 다 없으면 모든 요청이 한 칸(`noip`, 10분 60회)에서 세어집니다. 실제로 어떤 머리글이 오는지 한 번 확인합니다 (IP 값 자체는 기록하지 않습니다).

- 서로 다른 3명이 같은 글 · 댓글 · 사용자를 신고하면 그 자리에서 숨겨집니다. 숨긴 글 · 댓글은 글쓴이에게만 보이고, 숨긴 사용자는 남에게 프로필 사진 · 소개만 감춰집니다.
  - 가입한 지 72시간이 안 된 사람의 신고는 기록만 하고 이 3명에 넣지 않습니다.
  - 운영자가 restore 한 대상은 다시 자동으로 숨지 않습니다 (글쓴이가 그 글 · 프로필을 고치면 다시 대상이 됩니다).
  - 운영자 계정의 글 · 댓글 · 프로필은 자동으로 숨지 않습니다.
- 숨긴 글의 대표 사진(post-covers)은 글쓴이 · 운영자만 받습니다. 프로필 사진(avatars)은 공개 보관함이라 주소를 아는 사람은 계속 볼 수 있습니다.
- 정지하면 그 사람의 로그인 수단(이메일 · Google/Apple 식별자)의 해시가 `banned_identities` 에 남아, 탈퇴 뒤 다시 가입해도 정지가 이어집니다. 정지를 풀면 지워집니다.
- 정지 해시는 서버만 아는 pepper(`private.identity_pepper`, 0014 를 처음 실행할 때 한 번 만들어짐)로 HMAC 한 값입니다. pepper 는 바꾸거나 지우지 않습니다 (바꾸면 지금까지의 정지 이어 가기가 모두 풀립니다). pepper 표는 RLS 가 켜져 있고 service_role 을 포함해 어느 역할에도 권한이 없습니다 (서버 함수 안에서만 읽힙니다).
- 보관 기준은 **탈퇴한 시각**(`banned_identities.left_at`, 프로필이 지워질 때 적힘)입니다. 정지한 지 오래됐어도 탈퇴 직후 다시 가입하면 정지가 이어지고, 탈퇴한 지 1년이 지난 해시는 쓰지 않고 지웁니다 (가입 검사 때, 그리고 pg_cron 정기 정리에서 매일).
- 지워 달라는 요청이 오면 운영자 계정으로 `admin_forget_identity(p_email => '<이메일>')` 를 부르거나, 이메일을 모르면 해시 값으로 `admin_forget_identity(p_hash => '<64자리 해시>')` 를 부릅니다 (둘 다 비면 `bad_request`). 같은 사용자에게 적힌 다른 로그인 수단 해시도 함께 지워집니다. SQL Editor 에서는 `delete from public.banned_identities where hash = public.identity_hash('email', '<이메일>');` 를 실행합니다.
  - 네이버 가입자는 이메일이 `n<해시>@naver.high-press.workers.dev` 꼴입니다. 사용자가 알려 준 네이버 메일 주소가 아니라 **Auth 대시보드(Authentication → Users)에 보이는 주소**를 씁니다.
- 본문의 값(글자 · 서식 · 표 칸 하나하나)이 20,000 개를 넘는 글은 `body_too_complex` 로 받지 않습니다.
- 예전 탈퇴 함수 `delete_my_account()` 는 닫혔습니다. 탈퇴는 `account-delete` 서버 함수로만 합니다 (웹을 먼저 새로 배포합니다).
- 운영 화면의 신고 처리(restore · delete · suspend · dismiss)는 행만 바꿉니다. 지운 글의 대표 사진 · 사용자의 프로필 사진 파일은 화면이 Storage 에서 지우거나, 대시보드 → Storage 에서 직접 지웁니다.
- 기본 금칙어는 45개입니다. 지금 목록 보기: `select word from public.banned_words order by word;`
- 운영자가 SQL 로 정지 · 정지 풀기: `update public.profiles set suspended_at = now() where user_id = '<사용자 id>';` / `... set suspended_at = null ...`
- 열린 신고 보기: `select target_kind, target_id, count(*) from public.reports where resolved_at is null group by 1, 2 order by 3 desc;`
- 넣기 전에도 나머지는 지금처럼 됩니다. 웹 화면의 신고 · 차단 · 운영 화면은 "서버가 아직 이 기능을 지원하지 않습니다"를 보여 줍니다.

### 앱의 네이버 로그인 켜기 (서버가 코드를 받는 방식, 보안 점검 H1)
앱은 네이버 코드를 앱 주소(`highpress://`)로 받지 않습니다. 네이버가 브라우저를 서버 함수 `naver-app` 으로 보내고, 함수가 코드를 로그인 표로 바꿔 2분 동안 맡아 두었다가, 앱이 처음에 만든 비밀 값(verifier)을 보여 줄 때 한 번만 내줍니다. 웹의 네이버 로그인(`naver-login`)은 그대로입니다.
아래 순서대로 합니다. 앞의 것이 끝나야 다음 것이 동작합니다.
1. SQL Editor 에 `supabase/migrations/0016_naver_app.sql` 전체를 붙여 넣고 Run 합니다. `0015_app_support.sql` 을 먼저 넣어야 합니다 (빈도 제한 표를 함께 씁니다).
2. 서버 함수를 올립니다. 네이버가 보내는 브라우저는 Supabase 로그인이 없으므로 로그인 토큰 검사를 끕니다:
   `npx supabase functions deploy naver-app --no-verify-jwt --project-ref <프로젝트 ref> --use-api`
   공통 모듈(`functions/_shared/naverAccount.ts`)로 코드를 옮겼으므로 웹 함수도 다시 올립니다 (동작은 같습니다):
   `npx supabase functions deploy naver-login --no-verify-jwt --project-ref <프로젝트 ref> --use-api`
3. 비밀값은 새로 넣지 않습니다. `naver-login` · `naver` 가 쓰는 `NAVER_CLIENT_ID` · `NAVER_CLIENT_SECRET` 을 그대로 씁니다 (같은 네이버 애플리케이션).
4. https://developers.naver.com/apps → 애플리케이션 → API 설정 → 네이버 로그인의 Callback URL 에 한 줄을 더합니다 (기존 웹 주소는 그대로 둡니다):
   `https://<프로젝트 ref>.supabase.co/functions/v1/naver-app/callback`
   앱에 넣는 주소(`highpress://auth/callback`)는 네이버에 등록하지 않습니다.
5. 아래 7번 점검을 다시 합니다 (항목이 143번까지 늘었습니다. `0016_naver_app.sql` 을 넣기 전에 돌리면 0016 을 먼저 넣으라는 문구로 멈춥니다).
6. 앱으로 한 번 로그인해 봅니다. 받아 둔 표가 남지 않았는지 확인: `select count(*) from public.naver_app_pending where expires_at <= now();` (지난 행은 다음 로그인 때 치워집니다. 0 이 아니어도 2분이 지난 것은 아무도 가져가지 못합니다.)

- 함수 시험(서버 · 네이버는 가짜): `node --test supabase/tests/naver_app.test.ts`
- 앱으로 돌아가는 주소에는 `state`(verifier 의 해시) 또는 짧은 오류 코드(`cancelled` · `rate` · `off` · `bad-request` · `naver` · `used` · `failed`)만 실립니다. 코드 · 로그인 표는 실리지 않습니다.
- 빈도 제한은 IP(서버 비밀값으로 해시한 값)마다 콜백 · 찾아가기 각각 10분에 20번입니다 (`naver-app-callback:` · `naver-app-claim:` 칸, 웹의 `naver-login:` 과 따로 셉니다).
- `error=off` 로 돌아오면: 0015 · 0016 을 넣었는지, 함수에 `SUPABASE_SERVICE_ROLE_KEY` · `NAVER_CLIENT_ID` · `NAVER_CLIENT_SECRET` 이 있는지 봅니다.

### 네이버 카페 직접 게시 켜기
1. https://developers.naver.com/apps 에서 애플리케이션을 등록합니다. 사용 API 는 **네이버 로그인**과 **카페**, 환경은 PC 웹.
   - 서비스 URL: 배포 주소 (예: `https://<배포 주소>`, `#/` 없이)
   - Callback URL: `https://<배포 주소>/naver-callback` 과 `http://localhost:5173/naver-callback`
2. 비밀값을 넣습니다 (값만, 꺾쇠·따옴표·예시 글자 없이):
   `npx supabase secrets set NAVER_CLIENT_ID=<Client ID> NAVER_CLIENT_SECRET=<Client Secret> --project-ref <프로젝트 ref>`
3. 서버 함수를 올립니다: `npx supabase functions deploy naver --project-ref <프로젝트 ref> --use-api`
4. `.env.local` 에 `VITE_NAVER_CLIENT_ID=<Client ID>` 를 넣고 앱을 다시 빌드해 올립니다 (`npm run build` → `npx wrangler deploy`). Client ID 는 공개돼도 되는 값이고, Secret 은 `VITE_` 로 넣지 않습니다.
5. 글쓰기 화면의 내보내기 → "네이버 카페에 바로 올리기"에 게시판 주소를 붙여 넣고 올려 봅니다.

- 검수를 받기 전에는 애플리케이션을 등록한 네이버 계정(과 멤버관리에 넣은 계정)만 로그인됩니다. 다른 사용자에게 열려면 네이버 개발자센터에서 검수를 신청합니다.
- 서버 함수는 글과 사진을 네이버로 넘기기만 하고 저장하지 않습니다. 네이버 토큰도 저장하지 않습니다.
- 네이버 쪽 규칙(2026-10-12 실측, `docs/PLAN.md` 결정 기록): 사진은 글 맨 위에 순서대로 붙고, 글을 연달아 올리면 거절됩니다. 네이버 공식 예제의 % 인코딩 방식은 오류 999 로 실패하므로 쓰지 않습니다.
- 배포판에서 `/naver-callback` 이 열리려면 `wrangler.jsonc` 의 `not_found_handling` 설정이 필요합니다. 대시보드에서 `dist` 를 직접 올리는 방식으로는 이 설정이 들어가지 않습니다.

### 피드백 받기 켜기
1. SQL Editor 에 `supabase/migrations/0006_feedback.sql` 전체를 붙여 넣고 Run 합니다. 피드백 테이블이 생깁니다 (가입자만, 한 사람 하루 5건).
2. Google 계정에서 **앱 비밀번호**를 만듭니다: Google 계정 → 보안 → 2단계 인증을 켠 뒤 → "앱 비밀번호"에서 새로 만들면 16자 값이 나옵니다. 이 값은 한 번만 보이므로 바로 다음 단계에 씁니다.
3. 비밀값을 넣습니다 (값은 따옴표 없이, 공백 없이):
   `npx supabase secrets set GMAIL_USER=<내 Gmail 주소> GMAIL_APP_PASSWORD=<16자 앱 비밀번호> --project-ref <프로젝트 ref>`
4. 서버 함수를 올립니다: `npx supabase functions deploy feedback --project-ref <프로젝트 ref> --use-api`
5. 앱의 메뉴 → 피드백에서 한 건 보내 보고, Gmail 에 제목이 `[HIGH PRESS 피드백]`으로 시작하는 메일이 오는지 확인합니다.

- 메일에는 닉네임과 종류·내용만 담깁니다. 보낸 사람의 이메일 주소는 담기지 않습니다.
- 메일을 보내지 못해도 글은 서버에 남습니다. 보내지 못한 글 보기: `select created_at, kind, body from public.feedback where mailed_at is null order by created_at desc;`
- 받는 주소를 따로 두려면 `FEEDBACK_TO=<주소>` 비밀값을 더합니다.
- 서버 함수는 메일 포트 25·587로 나갈 수 없어 Gmail 의 465 포트를 씁니다.
- 앱 비밀번호는 Gmail 전체에 접근할 수 있는 값입니다. 코드나 `.env.local` 에 적지 말고 위 명령으로만 넣습니다. 새어 나갔으면 Google 계정에서 그 앱 비밀번호를 지웁니다.

## 7. 배포 전 보안 점검
SQL Editor 에 `supabase/tests/rls_check.sql` 전체를 붙여 넣고 Run 합니다. 결과가 전부 PASS 여야 합니다.
가짜 사용자 둘로 "남의 초안을 보거나 고칠 수 없는지"를 확인하고, 끝나면 그 둘을 지웁니다.

## 서버가 멈췄을 때 (일시정지 복구 절차)
무료 프로젝트는 1주일 동안 요청이 없으면 일시정지됩니다. 정지 중에는 로그인·초안 동기화·스탯 조회가 멈추고,
글쓰기·전술판·영상 편집·내보내기는 기기 저장으로 계속 동작합니다. 홈 화면에는 "서버 점검 중" 또는 "서버에 연결하지 못했습니다"가 보입니다.

1. **확인**: https://supabase.com/dashboard 에서 프로젝트가 Paused 로 표시되는지 봅니다. (정지 예고 메일이 오면 그 전에 한 번 접속하면 됩니다.)
2. **복구**: 프로젝트 화면의 Restore project 를 누르고 몇 분 기다립니다.
3. **점검**: 앱의 `#/admin` 이 열리는지, 홈 화면에 "초안 동기화됨"이 다시 뜨는지, 스탯 탭에서 순위표가 나오는지 봅니다.
4. **정기 정리 확인**: SQL Editor 에서 `select jobname, schedule, active from cron.job;` 를 실행해 `football-column-cleanup` 이 active 인지 봅니다.
5. **예방**: 사용자가 적은 기간에는 1주일에 한 번 앱에 로그인하거나 `#/admin` 을 엽니다. (예약 작업이 "활동"으로 인정되는지는 확인하지 못했습니다.)

## 운영하면서
- 한도 기준 바꾸기: `update public.app_config set value = '450' where key = 'db_limit_mb';` (서버 함수 호출 기준은 `edge_month_limit`)
- 가입자 상한 바꾸기: `update public.app_config set value = '100' where key = 'max_users';`
- 현재 가입자 수: `select count(*) from public.profiles;`
- 오늘 API-Football 호출 수: `select * from public.api_budget order by day desc limit 5;`
- 정기 정리(pg_cron)가 설정되지 않았다면 가끔 직접 실행: `delete from public.drafts where updated_at < now() - interval '7 days';` (0014 를 넣었다면 `delete from public.banned_identities where left_at < now() - interval '1 year';` 도)
- `0001_init.sql` 을 다시 실행하면 정기 정리가 0001 의 네 줄로 돌아갑니다. 그 뒤에는 `0014_moderation.sql` 도 다시 실행해 정지 해시 정리 줄을 되살립니다.
- 무료 프로젝트는 1주일 동안 쓰지 않으면 일시정지됩니다. 대시보드에서 Restore 하면 돌아옵니다. 정지 중에도 앱은 기기 저장으로 계속 동작합니다.
