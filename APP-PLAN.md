# HIGH PRESS 앱 PLAN (iOS · Android)

v1 · Oct 17, 2026 · @lee

`APP-PRD.md`(무엇을, 왜)를 **어떤 순서로, 어떤 파일로, 누가, 어떻게 확인하며** 만드는지 적은 실행 계획이다. 요구사항과 결정(D1~D18)은 PRD가 기준이며, 이 문서와 PRD가 다르면 PRD를 따르고 이 문서를 고친다.

- 작업 ID: `A단계-번호` (예: A1-3). `fixed.md` "앱" 구역과 보고에 이 ID를 쓴다.
- 담당: 디자인 · 글쓰기 · 미디어 · 보안 · 플랫폼 · 서버 (PRD 13장의 서브 에이전트), 메인(메인 세션), **운영자**(요청자가 직접 할 일).

---

## 1. 진행 규칙

CLAUDE.md 규칙을 앱 작업에 맞게 적용한다.

| CLAUDE.md | 앱 작업에서 |
| --- | --- |
| 1. 계획을 세우고 만들 파일을 알린다 | 단계를 시작할 때 이 문서의 해당 단계 표를 보여 주고, 표와 달라지는 파일만 따로 알린다 |
| 2. context7로 라이브러리 문법 확인 | 그대로. Expo SDK에 맞는 버전은 `npx expo install`로 고정한다 |
| 3. 다 만들면 테스트 | 7장의 테스트를 단계마다 돌린다. 웹 테스트(`npm test`)도 매 단계 함께 돌린다 |
| 4. strix | **쓰지 않는다.** PRD 9.6 점검 절차로 대신한다 (8장 단계 종료 조건) |
| 단계마다 한 줄 보고 | 그대로. 작업 ID를 붙인다 |
| 5. 서브 에이전트 총합 | PRD 13장. 결정은 메인이 총합해 내린다 |
| 6. 환경 변수는 `.env.local` | 앱은 `mobile/.env.local`(`EXPO_PUBLIC_*`만). 비밀 값은 Supabase secrets · EAS Secret에만 |
| 7 · 9. 디자인 스킬, effort high | 화면 작업 전에 impeccable · design-taste-frontend를 불러온다 |
| 8. Playwright 캡처 | 앱은 실기기 캡처로 대신한다(7.3). 웹 화면을 고친 단계(A1 · A4)는 웹을 Playwright로 캡처한다 |
| 10. 세션 시작 시 Gmail 피드백 확인 | 그대로 |

- 배포 · 서버 반영(마이그레이션 실행, 함수 배포) · 스토어 제출은 **요청이 있을 때만** 한다.
- 단계 시작 전에 그 단계의 `미정` · `가정` 항목(9장)을 먼저 묻는다.
- 결제수단 등록을 요구하는 화면이 나오면 그 자리에서 멈추고 보고한다(예외는 스토어 등록비뿐).
- 메모리 8GB: 무거운 작업(웹 빌드, 테스트, Metro)은 하나씩 앞에서 돌린다. 에뮬레이터는 쓰지 않는다.

## 2. 단계 순서

```
A0 준비 ──┬─> A1 서버 · 커뮤니티 안전 (웹에도 반영) ────────────────────────────┐
          └─> A2 실기기 시험 (A1과 나란히) ──> A3 앱 골격 ──> A4 글쓰기 ──┬─> A5 피드 · 글 · 프로필
                                                                    ├─> A6 스탯 · 전술 ──> A7 사진 ──> A8 영상
                                                                    └─> A9 보내기
A1 · A5 · A8 · A9 완료 ──> A10 스토어 준비 ──> A11 출시 (Android 비공개 테스트 14일 ∥ iOS TestFlight → 심사)
```

- A1과 A2는 나란히 한다(서버 담당 / 미디어 · 글쓰기 담당).
- A3는 A2 결과(에디터 방식, 네이버 콜백)가 나온 뒤 시작한다.
- A5와 A6은 A4가 끝나면 나란히 할 수 있다. 다만 메모리 때문에 Metro는 한 번에 하나만 띄운다.

| 단계 | 어림 기간 | 누적 |
| --- | --- | --- |
| A0 | 3~5일 (계정 신원 확인 대기 포함) | 1주 |
| A1 | 1~1.5주 | 2주 |
| A2 | 1~2주 (A1과 나란히) | 2.5주 |
| A3 | 1.5주 | 4주 |
| A4 | 2주 | 6주 |
| A5 | 1.5주 | 7.5주 |
| A6 | 1.5주 | 9주 |
| A7 | 1주 | 10주 |
| A8 | 2~3주 | 12.5주 |
| A9 | 0.5주 | 13주 |
| A10 | 1주 | 14주 |
| A11 | 3~5주 (14일 테스트 포함) | 17~19주 |

어림은 미확인이다. A2가 끝나면 다시 잡는다.

## 3. 운영자가 할 일

| ID | 할 일 | 언제까지 | 비고 |
| --- | --- | --- | --- |
| O-1 | Google Play Console 개인 계정 등록 (25달러, 신분증 확인) | A0 | 신원 확인 1~3일 |
| O-2 | Apple Developer Program 개인 등록 (99달러/년) | A0 | 판매자로 실명이 보인다(D14). 갱신일을 기록해 둔다 |
| O-3 | Expo 계정 만들기 (무료). 카드를 요구하면 멈추고 알려 주기 | A0 | |
| O-4 | 안드로이드폰: 개발자 옵션 → USB 디버깅 켜기 | A0 | |
| O-5 | 아이폰: Apple 계정 등록 뒤 TestFlight 앱 설치 | A0 이후 | 개발 빌드 설치는 기기 등록(UDID)이 필요하다 |
| O-6 | Supabase SQL Editor에서 새 마이그레이션 실행, `rls_check.sql` 확인 | A1 | 요청할 때마다 |
| O-7 | 네이버 개발자센터 Callback URL에 `<SUPABASE_URL>/functions/v1/naver-app/callback`(https) 한 줄 추가(웹 주소는 그대로). `highpress://`는 등록하지 않음. 그 전에 0016 적용 · naver-app 배포 | A2 | 네이버가 `*.supabase.co` https 주소를 받는지 확인 |
| O-8 | Supabase Auth: Redirect URL 추가, Apple 제공자 켜기 | A3 | 값은 그때 알려 드린다 |
| O-9 | Apple: App ID에 Sign in with Apple 켜기, .p8 키 발급 → Supabase secrets에 넣기 | A3 | 키 내용은 채팅에 붙이지 않는다 |
| O-10 | 심사용 계정 준비 (Google 또는 네이버 시험 계정) | A10 | |
| O-11 | 스토어 등록 정보 확인 (설명 문구, 연락처 = 개인 메일, 연령 등급 설문) | A10 | |
| O-12 | 비공개 테스터 12명 모집 (카페 홍보 글) | A10~A11 | 14일 연속 참여 |

## 4. 먼저 확정할 공통 규약 (메인 담당, A3 전에)

PRD 13장에 따라 아래 넷이 확정되기 전에는 글쓰기 · 미디어 구현을 시작하지 않는다(A2 시험은 예외).

### 4.1 패키지 경계

```
football_app/
  package.json            workspaces: ["packages/*", "mobile"] (웹은 루트에 그대로)
  src/                    웹. packages에서 가져다 쓰도록 import만 바뀐다
  packages/core/src/
    stats/                normalize · types · leagues · sites
    spell/                rules
    feed/                 commentTree · feedBody(excerptOf) · publishError · remote(클라이언트 주입)
    sync/                 draftSync(DraftStore 저장소 인터페이스) · remote
    body/                 bodyMedia · autosave · saveStatus · urls(isHttpUrl 포함) · toolbarOptions · json(JSONContent)
    backup/               v1 확인 · v2 ZIP 형식 (fflate, A4-8)
    tactics/              animation · geometry · formations · projectOps · draw(FrameContext) · gifFrames
    photo/                marks · collage(plan*)
    video/                clip · marker
    naver/                limits · errors(오류 문구)
    db/                   types (Column, Team, TacticProject, Settings) · ids(isId, NewId). MediaRef는 A3-7에서
  packages/editor/src/    extensions · blockLineHeight · statBlock · pastedHtml · sanitize · exportDocument · spellPositions
  mobile/                 Expo 앱 (5장)
```

- `packages/core`는 DOM · React Native 어느 쪽에도 의존하지 않는다. `packages/editor`만 DOM(웹 화면 · 앱의 웹뷰 안)에서 돈다.
- 환경 값 · `crypto.randomUUID` · 이미지 축소 · 저장소는 함수 인자(어댑터)로 받는다.
- React는 웹과 앱이 같은 버전을 쓰도록 맞춘다(A0-4에서 확인). 맞출 수 없으면 웹 React를 앱 쪽 버전에 맞춘다.

### 4.2 기기 저장 스키마 (앱, expo-sqlite)

| 표 | 열 | 비고 |
| --- | --- | --- |
| `columns` | id TEXT PK, title, body (TipTap JSON 문자열), teamId, status(draft/saved/published), best INTEGER, postUrl, createdAt, updatedAt, syncedAt | Dexie `columns`와 같은 필드 (A3-7 착수 때 `src/db/types.ts`와 대조해 확정) |
| `teams` | id, name, color, order | |
| `tactic_projects` | id, columnId, data(JSON), updatedAt | |
| `media` | id, columnId, kind(image/gif/mp4/png), path(`document/media/<id>.<ext>`), width, height, bytes, createdAt | 파일 자체는 file-system |
| `settings` | key PK, value(JSON) | 화면 밝기, 방문일 등 |
| `schema_version` | version | 마이그레이션용 |

- 날짜는 웹과 같이 ISO 문자열(UTC)이다. 하루 단위 값(방문일)만 한국 시간 `YYYY-MM-DD`다.
- **A3-7 구현에서 바뀐 점 (2026-10-24, `mobile/src/db/schema.ts`가 기준):** 시각은 웹 Dexie와 같이 밀리초 숫자다(core 초안 동기화가 `updatedAt` 숫자를 비교). 칸 이름은 SQL 관례(`team_id`, `sort_order` 등)이고 코드에서 core 이름으로 바꾼다. 미디어 종류는 core 값(`image`/`gif`/`video`) + mime으로 나눈다. `columns`에 `feed_club` · `feed_cover`를 더했다. 사진 경로는 문서 폴더 기준 상대 경로(`media/<id>.<확장자>`, core `mediaPath`)로만 저장한다(iOS는 업데이트 때 절대 경로가 바뀜). 설정 중 화면 밝기 · 진동은 첫 화면 전에 읽어야 해서 `prefs.db`(expo-sqlite kv-store)에 따로 둔다.
- 백업 v2: `manifest.json`(`{format:"highpress-backup", version:2, exportedAt, columns, teams, tacticProjects, media:[{id, file}]}`) + `media/<id>.<ext>`.

### 4.3 "본문에 넣기" 인터페이스

```ts
type InsertRequest =
  | { kind: 'stat'; snapshot: StatSnapshot }                  // packages/editor statBlock (스냅숏을 받아 블록으로 만듦)
  | { kind: 'image'; mediaId: string; alt: string }           // 사진 · 전술 PNG · 사진 편집 결과
  | { kind: 'gif' | 'mp4'; mediaId: string; poster?: string } // 전술 · 영상 결과
  | { kind: 'tactic'; projectId: string; mediaId: string }    // 다시 열어 고칠 수 있는 전술
// 도구 시트 → editorRef.insert(req) → 웹뷰 안에서 bodyMedia 규약대로 노드 삽입 → 커서 위치로 스크롤
```

### 4.4 웹뷰 ↔ 앱 메시지 규약 (에디터)

- 앱 → 웹뷰: ref 메서드만 쓴다(`insert`, `exec(command)`, `setContent`, `getJSON`, `runSpellcheck(live)`, `setMedia(mediaId, {mime, base64})`).
  - `exec` 명령에 맞춤법 `spellShow`(그 자리 보이기) · `spellFix`(최대 500개 한 묶음)가 있다 (A4-5).
  - `setMedia`: 화면용 사진 사본(긴 변 1280px, 1MB 이하, jpeg · png · webp · gif만). 웹뷰가 `blob:` 주소로 바꿔 보여 준다. file:// · data: 그림은 쓰지 않는다(CSP `img-src blob:`, A4-6).
- 웹뷰 → 앱: `{type, payload}` 다섯 종류만 쓴다.
  - `change`(JSON, 2초 간격 · `edited`: 불러온 뒤 사용자가 고쳤는지)
  - `selection`(서식 상태)
  - `spell`(결과 목록 최대 500개 · `total`: 찾은 전체 수)
  - `ready`
  - `error`
- 앱은 type 목록 · 크기 상한(1MB) · 형식을 확인한다. 토큰은 웹뷰에 넘기지 않는다(PRD 9.3).

### 4.5 A1 서버 ↔ 화면 규약 (2026-10-18 메인 확정)

클라이언트 쪽 코드 규약은 `src/features/moderation/api.ts`(웹 · 앱 공통으로 쓸 예정)다. 이름 · 인자 · 오류 코드는 이 표와 그 파일이 같아야 한다.

**표 · 칸 (`0014_moderation.sql`)**

| 이름 | 내용 |
| --- | --- |
| `reports` | id, reporter(기본 auth.uid(), profiles 삭제 시 함께), target_kind(`post`·`comment`·`user`), target_id uuid, part(`cover`·`avatar`·null), reason(`spam`·`abuse`·`hate`·`sexual`·`illegal`·`other`), detail(≤300자), created_at, resolved_at, resolution. unique(reporter, target_kind, target_id). RLS: 본인 신고만 읽기, 직접 쓰기 없음(함수로만) |
| `blocks` | blocker, blocked, created_at. PK(blocker, blocked), 자기 자신 금지. RLS: 본인 것만 읽기 |
| `banned_words` | word(소문자, 1~30자) PK, created_at. RLS: 운영자만 읽기 · 쓰기 |
| `posts.hidden_at` · `post_comments.hidden_at` | 숨긴 시각. 숨긴 것은 글쓴이 · 운영자만 본다 (테이블 select 정책도 같게) |
| `profiles.hidden_at` | 사용자가 3명에게 신고되면 남에게 프로필 사진 · 소개를 감춘다 (닉네임 · 글은 그대로) |
| `profiles.suspended_at` | 이용 정지. 글 · 댓글 · 팔로우 · 신고 · 닉네임 · 소개 변경이 `suspended` 오류로 막힌다 |

**동작**
- 서로 다른 3명이 같은 대상을 신고하면 그 자리에서 `hidden_at`을 채운다 (D10). 운영자가 `restore`하면 그 대상의 열린 신고가 모두 닫힌다.
- 차단: 차단한 사람에게 차단된 사람의 글 · 댓글 · 프로필이 피드 · 검색 · 인기 칼럼리스트 · 글 · 댓글 목록에서 사라진다. 차단된 사람은 차단한 사람의 글에 댓글을 달거나 팔로우할 수 없다(`blocked`). 차단하면 서로의 팔로우가 풀린다.
- 금칙어: 글(제목 · 요약 · 본문 글자) · 댓글 · 닉네임 · 소개에 들어 있으면 `banned_word` 오류. 비교는 소문자로 바꾸고 공백 · 문장부호를 뺀 글자에 대해 포함 여부로 한다. 기본 목록은 오탐이 적은 말만 넣는다.
- 자기 글이 숨겨졌을 때: 글쓴이가 부를 때만 `hidden: true`가 실려 온다(`feed_page`의 author 목록, `post_body`, `post_comment_list`). 화면은 `HIDDEN_NOTICE` 문구를 보여 준다.

**함수 (클라이언트가 부르는 것)**

| 함수 | 반환 | 오류 메시지 |
| --- | --- | --- |
| `report_content(p_kind text, p_target uuid, p_reason text, p_detail text default null, p_part text default null)` | void | `not_member` · `self_report` · `already_reported` · `report_quota`(하루 30건) · `suspended` · `bad_report` |
| `block_user(p_user uuid)` · `unblock_user(p_user uuid)` | void | `not_member` · `self_block` · `block_quota`(500명) |
| `my_blocks()` | table(user_id, nickname, avatar, blocked_at) | — |
| `admin_reports(p_status text default 'open')` | table(kind, target_id, parts text[], reasons jsonb, report_count, first_at, last_at, hidden, preview, author_id, author_nickname, author_suspended, post_id) | `not_admin` |
| `admin_resolve_report(p_kind text, p_target uuid, p_action text)` — `restore`·`delete`·`suspend`·`dismiss` | void | `not_admin` · `bad_action` · `not_found` |
| `admin_unsuspend(p_user uuid)` | void | `not_admin` |
| `admin_banned_words()` / `admin_add_banned_word(p_word text)` / `admin_remove_banned_word(p_word text)` | setof text / void / void | `not_admin` |
| 기존 쓰기(글 올리기 · 댓글 · 팔로우 · 프로필) | — | 새로 `banned_word` · `suspended` · `blocked` |
| `count_visit(p_source text default 'web')` (`0015_app_support.sql`) | date | 인자 없이 부르는 지금 웹 호출도 그대로 동작 |

**Edge Function**
- `naver-login`: Origin 검사를 없애고 IP(해시) 기준 빈도 제한(10분 20회). 몸통 `{code, state, verifier}`, verifier는 `^[A-Za-z0-9_-]{43,128}$`, `base64url(SHA-256(verifier)) === state`가 아니면 400 `bad-verifier`. 웹도 verifier를 만든다.
- `naver-app`(새, 2026-10-24 보안 점검 H1 대응, `--no-verify-jwt`): 앱의 네이버 로그인 전용. `GET /functions/v1/naver-app/callback?code&state`(네이버 Callback URL, state는 base64url 43자) → 서버가 코드를 교환해 한 번 쓰는 로그인 표를 `naver_app_pending`에 2분 보관 → 성공 302 `highpress://auth/callback?naver=1&state=<state>`, 실패 302 `?naver=1&error=<cancelled|rate|off|bad-request|naver|used|failed>`(앱 주소에 코드 · 로그인 표 없음). `POST /functions/v1/naver-app/claim {state, verifier}` → 200 `{tokenHash, type:'email'}` / 400 `bad-request`·`bad-verifier` / 404 `expired` / 429 `rate` / 503 `off`. verifier는 표를 건드리기 전에 대조. 빈도 제한은 IP 해시로 콜백 · claim 각각 10분 20회. 비밀값은 NAVER_CLIENT_ID/SECRET 재사용. 공통 코드 `supabase/functions/_shared/naverAccount.ts`(naver-login과 공유). 시험 `node --test supabase/tests/naver_app.test.ts`.
- `naver_app_pending`(0016): state PK, token_hash, kind, created_at, expires_at(2분). RLS 켬 · 정책 없음 · anon/authenticated 권한 없음. `naver_app_put` / `naver_app_take`(service_role만). rls_check 138~143.
- `account-delete`(새): 로그인 토큰으로 부른다(JWT 검사 켬). 서버가 `post-covers/<uid>/` · `avatars/<uid>/`를 지우고 계정을 지운다. Apple로 가입한 계정이면 토큰 취소(A3에서 채움, 지금은 자리만). 응답 `{ok:true}` / `{error}`.

**구현하며 정한 것 (2026-10-18, 서버 결과를 메인이 받아들임)**
- `post_body`는 반환 꼴을 바꾸지 않는다(웹 `body()` 호환). 글의 숨김 여부는 `feed_page`(author) 결과의 `hidden`으로 본다.
- 숨기거나 차단한 사람의 댓글에 답글이 달려 있으면 남에게는 "지워진 자리"로 나온다. 답글이 없으면 빠진다.
- `dismiss`는 숨김을 유지하고 신고만 닫는다. 다시 보이게 하는 것은 `restore`뿐이다. 자동 숨김은 열린 신고만 센다.
- 운영자의 `delete`는 행만 지운다. Storage의 대표 사진 · 프로필 사진은 운영 화면이 지운다.
- 추가 오류 이름: `not_found`, `bad_word`, `server_full`, `bad_source`. 답글 · 팔로우는 어느 쪽이 차단했든 막힌다. 정지된 계정은 프로필 사진을 새로 넣지 못한다(빼기는 됨).
- `admin_daily_active`에 `sources_since`(출처를 나눠 처음 센 날)가 더해진다.
- 보안 점검 뒤 더해진 것: `my_profile()`(본인 프로필 읽기, profiles의 bio · avatar 직접 읽기 권한은 회수), `admin_reports`의 `details text[]`(신고 내용 최근 3개), `admin_forget_identity(p_email, p_hash)`(정지 식별 해시 지우기, 오류 `bad_request`), 오류 `body_too_complex`(본문 조각 2만 개 초과 — 웹은 quota 문구). 정지 식별 해시는 서버 비밀값 HMAC, 탈퇴 뒤 1년 보관.
- 기본 금칙어 45개(오탐 때문에 짧은 형태는 뺌). 목록은 `0014_moderation.sql`에 있고 운영 화면에서 고친다.

**나눔**
- 서버 에이전트: `supabase/**` 전부.
- 글쓰기 에이전트: `src/features/feed/remote.ts`(새 오류 코드 · `hidden` 칸), `src/features/account/session.ts`(탈퇴를 함수로), 네이버 로그인 클라이언트(verifier), `src/features/legal/**`, `#/delete-account` 페이지와 `src/lib/router.ts`, 가입 동의 문구(만 14세).
- 디자인 에이전트: 신고 시트 · 차단 확인 · 차단 목록 · 운영 화면(신고 처리 · 금칙어) · 숨김 안내를 `src/features/moderation/*`에 만들고 글 카드 · 글 · 댓글 · 프로필 · 설정 · 운영 화면에 잇는다.

## 5. 앱 폴더 구조 (mobile/)

```
mobile/
  app.config.ts           번들 ID, 스킴 highpress, userInterfaceStyle, privacyManifests, 회전 설정, 글꼴 플러그인
  eas.json                development / preview / production 프로필
  .env.local              EXPO_PUBLIC_SUPABASE_URL 등 공개 값만 (커밋 안 함)
  src/app/                expo-router (SDK 58 템플릿 관례에 따라 src/ 아래. 아래 경로의 app/은 모두 src/app/)
    _layout.tsx           루트 Stack, 테마, KeyboardProvider, 세션
    (tabs)/_layout.tsx    NativeTabs [피드 | 내 칼럼 | 나]
    (tabs)/feed/…         피드, 검색
    (tabs)/columns/…      내 칼럼
    (tabs)/me/…           프로필, 설정, 백업, 약관, 운영 현황
    write/[id].tsx        에디터 (전체 화면)
    write/tool/[kind].tsx 스탯 · 모션 · 영상 · 사진 시트
    write/send.tsx        보내기 시트
    p/[author]/[id].tsx   글
    u/[id].tsx            프로필
    login.tsx             로그인 시트
    auth/callback.tsx     리디렉트 받기
  src/
    theme/                tokens.ts(웹 app.css에서 생성) · fonts · useTheme
    db/                   sqlite 스키마 · store · 변경 알림 · 백업 입출력
    lib/                  supabase(LargeSecureStore) · visit · share · haptics
    auth/                 google · naver(verifier) · apple
    editor/               EditorDom.tsx('use dom') · Toolbar · FormatBar · SpellPanel
    feed/ post/ profile/ admin/ moderation/
    stats/ tactics/ photo/ video/ send/
    skia/                 canvas2d 어댑터
  modules/hp-video/       Expo 네이티브 모듈 (ios/ Swift, android/ Kotlin, index.ts)
  e2e/                    Maestro 흐름(yaml)
```

## 6. 단계별 작업

### A0 준비

시작 전 질문: Expo SDK 버전(가정 58), 앱 버전 체계(가정 1.0.0), 번들 ID(예: `dev.highpress.app`). 앱 이름 중복은 운영자가 스토어에서 확인한다.

| ID | 작업 | 파일 | 담당 | 확인 |
| --- | --- | --- | --- | --- |
| A0-1 | git 시작. `.gitignore`에 `.env*.local`, `dist`, `node_modules`, `mobile/ios`, `mobile/android`, `*.keystore`, `*.p8`. 첫 커밋 전에 비밀 값 검사 | `.gitignore` | 플랫폼 | `git status`에 비밀 파일이 없음, gitleaks 통과 |
| A0-2 | npm workspaces 설정 (웹은 루트 그대로) | `package.json` | 플랫폼 | `npm install` 뒤 웹 `npm test` · `npm run build` 통과 |
| A0-3 | Expo 앱 만들기 (`create-expo-app`, SDK 확인), expo-router, 개발 빌드 설정 | `mobile/*`, `mobile/eas.json`, `mobile/app.config.ts` | 플랫폼 | `npx expo-doctor` 통과 |
| A0-4 | React 버전 · 모노레포 끌어올리기 확인 (React가 둘로 갈리지 않는지) | `package.json` | 플랫폼 | `npm ls react`에 한 버전 |
| A0-5 | EAS 프로젝트 연결, Android 개발 빌드 → 실기기 설치 | `mobile/eas.json` | 플랫폼 + 운영자 | 안드로이드폰에서 빈 앱이 뜨고 Metro에 붙음 |
| A0-6 | iOS 개발 빌드 (O-2 승인 뒤, 기기 등록) | — | 플랫폼 + 운영자 | 아이폰에서 빈 앱이 뜸 |
| A0-7 | `fixed.md`에 "앱" 구역, `CLAUDE.md`에 "앱 작업은 strix 대신 APP-PRD 9.6" 한 줄 (요청자 확인 뒤) | `fixed.md`, `CLAUDE.md` | 메인 | — |

끝나는 조건: 실기기 두 대에서 개발 빌드가 뜨고, 웹 테스트 · 빌드가 그대로 통과한다.

### A1 서버 · 커뮤니티 안전 (웹에도 반영)

시작 전 질문: 금칙어 목록의 출처(직접 작성 / 공개 목록), 연령 기준(예: 만 14세 이상), 자동 숨김 뒤 작성자에게 보이는 문구.

| ID | 작업 | 파일 | 담당 | 확인 |
| --- | --- | --- | --- | --- |
| A1-1 | 신고 · 차단 · 숨김 · 정지 스키마. `reports`(reporter, target_kind, target_id, reason, created_at, unique(reporter, target)), `blocks`(blocker, blocked), 글 · 댓글 · 프로필에 `hidden_at`, 프로필에 `suspended_at`. 서로 다른 3명이 신고하면 숨기는 트리거. RLS: 신고 · 차단은 본인 것만 읽기 | `supabase/migrations/0014_moderation.sql` | 서버 | `rls_check.sql`에 신고 · 차단 케이스 추가, 전부 PASS |
| A1-2 | 피드 함수에 차단 · 숨김 반영: `feed_page`, `post_comment_list`, `search_columnists`, `popular_columnists`, `post_body`, `profile_summary` 재정의 | 같은 파일 | 서버 | 차단한 사람의 글 · 댓글이 안 보임 (SQL 테스트) |
| A1-3 | 금칙어: `banned_words` 표(운영자만 쓰기) + 글 · 댓글 · 닉네임 · 소개 트리거 | 같은 파일 | 서버 | 금칙어가 든 댓글이 `banned_word` 오류로 거부됨 |
| A1-4 | 운영자 처리 함수: `admin_reports(p_status)`, `admin_resolve_report(id, action: restore/delete/suspend)` | 같은 파일 | 서버 | 운영자가 아니면 `not_admin` |
| A1-5 | 앱용 서버 변경: `count_visit(source text default 'web')`(지금 웹 호출은 그대로 동작), `admin_daily_active`에 source별 합계, `max_users` 100 | `supabase/migrations/0015_app_support.sql` | 서버 | 웹 `visit.test.ts` 통과, rls_check 69 · 70 다시 PASS |
| A1-6 | `naver-login` 변경: Origin 검사를 빼고 IP · 빈도 제한을 둔다. `{code, state, verifier}`를 받아 `base64url(sha256(verifier)) === state`를 확인한다. 웹도 verifier를 쓰도록 바꾼다. (`stats` · `naver` · `feedback`은 Origin이 없어도 막지 않으므로 그대로) | `supabase/functions/naver-login/index.ts`, `src/features/account/naverLogin*`, `src/features/naver/naverAuth.ts` | 서버 + 글쓰기 | 웹 네이버 로그인 테스트 통과, verifier가 틀리면 거부 |
| A1-7 | 탈퇴를 서버 함수 하나로: 사진 → 계정 순서를 서버에서 처리, Apple 토큰 취소 자리 마련 | `supabase/functions/account-delete/index.ts`, `src/features/account/session.ts` | 서버 | 탈퇴 뒤 storage · 행이 남지 않음 |
| A1-8 | 웹 화면: 글 · 댓글 · 프로필 ⋯ 메뉴에 신고 · 차단, 차단 목록(설정), 운영 화면 신고 처리 | `src/features/moderation/*`(새), `feed/PostCard.tsx`, `feed/CommentThread.tsx`, `post/OwnerMenu.tsx`, `profile/ProfilePage.tsx`, `account/AdminPage.tsx`, `home/SettingsDrawer.tsx` | 디자인 + 글쓰기 | 웹 테스트 추가 · 통과, Playwright 데스크톱 · 모바일 캡처 |
| A1-9 | 약관 · 방침 · 연락처 · 탈퇴 안내 페이지(로그인 없이 보임). OPERATOR_CONTACT = 운영자 개인 메일, 금지 콘텐츠 · 무관용 · 정지 · 연령, 상한 100, 앱 항목 | `src/features/legal/PolicyPages.tsx`, `#/delete-account` 새 화면, `src/lib/router.ts` | 글쓰기 | 시행일 갱신, 캡처 |
| A1-10 | 보안 점검 | — | 보안 | PRD 9.6의 1 · 2 · 3 · 4 |

끝나는 조건: 마이그레이션 · 함수 코드와 웹 화면 완료, 테스트 통과. **서버 반영과 웹 배포는 요청을 받은 뒤 한다** (O-6). 버전은 웹 v0.24.0으로 기록한다.

### A2 실기기 시험 (A1과 나란히)

시험 코드는 `mobile/spikes/`에 두고, 결과는 이 문서 10장에 기록한다. 시험이 끝나면 시험 코드는 지우거나 정식 코드로 옮긴다.

| ID | 시험 | 담당 | 통과 기준 | 실패하면 |
| --- | --- | --- | --- | --- |
| A2-1 | DOM 컴포넌트 TipTap: 한글 입력 · 키보드 위 서식 줄 · 선택 핸들 · 스크롤 · 표 · 사진 10장 | 글쓰기 | 두 OS에서 한글 조합이 깨지지 않고, 입력 지연을 느낄 수 없음 | TenTap으로 같은 시험 |
| A2-2 | Skia Canvas2D 어댑터로 `draw.ts` 전술판 그리기 + 끌기 | 미디어 | 22명 끌기가 60fps에 가깝고, 웹 PNG와 같은 모양 | Konva를 DOM 컴포넌트로 (대비책) |
| A2-3 | `hp-video` 최소 기능: 구간 자르기(원본 그대로 · 다시 인코딩) | 미디어 | 두 OS에서 1분 클립을 자름 | 해당 OS만 react-native-video-trim 검토 → 요청자 확인 |
| A2-4 | 네이버 블로그 · 카페 앱에 HTML 붙여넣기 | 글쓰기 + 운영자 | 서식 유지 여부 기록 | 결과를 보내기 시트 문구에 반영 |
| A2-5 | 네이버 https 콜백(naver-app) → 앱 복귀(`highpress://…?naver=1&state`) → claim 로그인 (2026-10-24 방식 변경) | 서버 + 보안 | 앱으로 돌아와 로그인. 이미 동의한 사용자도 돌아오는지 | 결과를 앱이 2분 안에 직접 claim |
| A2-6 | gifenc를 Hermes 워크렛에서 (15초 GIF) | 미디어 | 30초 안에 끝남 | iOS ImageIO / Android 네이티브 인코더 |
| A2-7 | react-native-view-recorder로 전술 1280×720 MP4 | 미디어 | 크기 지정 · 두 OS 재생 | `hp-video` 인코더로 |
| A2-8 | 딥링크 가로채기 재현 (adb). 2026-10-24 서버가 코드를 받는 방식(naver-app)으로 바꿔 "네이버가 state를 대조하는지" 실측은 필요 없음. 가로챈 앱 주소의 state로 claim하면 400 `bad-verifier`인지 재현 | 보안 | 가로챈 앱 주소로 로그인 불가 | (해당 없음) |

끝나는 조건: 8개 결과와 그에 따른 결정이 10장에 기록되고, 바뀐 결정을 PRD 15장에 반영한다.

### A3 앱 골격

시작 전 질문: 글꼴 용량(가정: 5굵기 전체).

| ID | 작업 | 파일 | 담당 | 확인 |
| --- | --- | --- | --- | --- |
| A3-1 | packages/core 분리 (웹 import 변경) | `packages/core/**`, `src/**` import | 글쓰기 | 웹 `npm test` 전부 통과, `npm run build` 통과 |
| A3-2 | 디자인 토큰: `app.css` 변수 → `tokens.json` → 웹 CSS · 앱 TS 생성 스크립트 | `scripts/gen-tokens.mjs`, `mobile/src/theme/*` | 디자인 | 두 결과의 값이 같음(테스트) |
| A3-3 | 글꼴 · 아이콘 · 햅틱 · 안전 영역 · 키보드 | `app.config.ts`(expo-font 플러그인), `mobile/src/theme/fonts.ts`, `mobile/src/lib/haptics.ts` | 디자인 | 실기기에서 Pretendard 굵기 5개 확인 |
| A3-4 | 탭 · 스택 · 시트 뼈대, 어두운 화면 기본(D15), 회전 설정(D18) | `mobile/app/**` | 디자인 | 화면 이동 Maestro 흐름 |
| A3-5 | Supabase 클라이언트(LargeSecureStore, pkce, AppState 자동 갱신) | `mobile/src/lib/supabase.ts` | 글쓰기 구현, 보안 검토 | 앱을 껐다 켜도 로그인 유지 |
| A3-6 | 로그인 3종 + 약관 동의 | `mobile/src/auth/*`, `app/login.tsx`, `app/auth/callback.tsx` | 글쓰기 + 운영자(O-8 · O-9) | Google · 네이버(두 OS), Apple(iOS) 로그인 성공 |
| A3-7 | 기기 저장 (4.2 스키마, 변경 알림) | `mobile/src/db/*` | 글쓰기 | 저장 → 앱 재시작 → 그대로 (jest) |
| A3-8 | 방문자 수 (`count_visit('app')`, 하루 한 번) | `mobile/src/lib/visit.ts` | 글쓰기 | 웹 `visit.test.ts`와 같은 경우의 jest 테스트 |
| A3-9 | 보안 점검 | — | 보안 | PRD 9.6의 1 · 3 · 4 |

끝나는 조건: 로그인한 뒤 빈 칼럼을 만들고, 앱을 다시 열어도 남아 있다. 실기기 캡처(세로 · 큰 글자)로 간격 · 넘침 · 정렬을 확인했다.

### A4 글쓰기

시작 전 질문: 앱에 넣는 사진 크기(가정: 긴 변 2560px).

| ID | 작업 | 파일 | 담당 | 확인 |
| --- | --- | --- | --- | --- |
| A4-1 | packages/editor 분리 (웹 에디터도 이것을 씀) | `packages/editor/**`, `src/features/editor/*` | 글쓰기 | 웹 에디터 테스트 통과 |
| A4-2 | 에디터 DOM 컴포넌트 + 4.4 메시지 규약 + CSP | `mobile/src/editor/EditorDom.tsx` | 글쓰기 | 메시지 형식 검사 jest |
| A4-3 | 위 막대 · 키보드 위 서식 줄 · 도구 막대 · 글 정보 시트 · 팀 태그 | `mobile/src/editor/*`, `app/write/[id].tsx` | 디자인 | 실기기 캡처 |
| A4-4 | 자동 저장 · 저장 · 상태 표시(임시/저장됨/게시됨) | `mobile/src/editor/useAutosave.ts` | 글쓰기 | 앱을 백그라운드로 보내면 바로 기록 |
| A4-5 | 맞춤법 패널 | `mobile/src/editor/SpellPanel.tsx` | 글쓰기 | core 규칙 테스트 공유 |
| A4-6 | 사진 넣기 (image-picker → 줄이기 → media 저장 → insert) | `mobile/src/editor/insertImage.ts` | 글쓰기 | 사진 10장 성능 |
| A4-7 | 초안 동기화 (core draftSync + sqlite 어댑터) | `mobile/src/sync/*` | 글쓰기 | 웹에서 쓴 초안을 앱에서 이어 씀 |
| A4-8 | 백업 v2 (웹 · 앱), v1 읽기 | `packages/core/src/backup/*`, `src/db/backup.ts`, `mobile/src/db/backup.ts` | 글쓰기 | 웹 → 앱, 앱 → 웹으로 주고받기, v1 파일 읽기 |
| A4-9 | 보안 점검 (웹뷰) | — | 보안 | PRD 9.3 체크리스트 |

끝나는 조건: 칼럼 한 편을 앱에서 쓰고 저장하고, 백업을 웹과 주고받는다. 웹 백업 v2는 웹 v0.25.0으로 기록한다.

### A5 피드 · 글 · 프로필

| ID | 작업 | 파일 | 담당 | 확인 |
| --- | --- | --- | --- | --- |
| A5-1 | 피드 (인기 칼럼리스트, 구단 칩, 전체/팔로잉, 검색, 당겨서 새로 고침) | `app/(tabs)/feed/*`, `mobile/src/feed/*` | 디자인 + 글쓰기 | 웹과 같은 목록 |
| A5-2 | 글 본문 네이티브 렌더 (허용 노드만) | `mobile/src/post/BodyRenderer.tsx` | 글쓰기 | XSS 시험 글이 글자로만 보임 |
| A5-3 | 좋아요 · 댓글 · 답글 · 공유 막대 | `mobile/src/post/*` | 디자인 + 글쓰기 | |
| A5-4 | 프로필 · 팔로우 · 내 프로필 수정(사진 · 소개 · 응원 구단) | `app/u/[id].tsx`, `app/(tabs)/me/*` | 디자인 | |
| A5-5 | 신고 · 차단 (길게 누르기 메뉴 · ⋯) | `mobile/src/moderation/*` | 디자인 | 차단 즉시 숨김 |
| A5-6 | 피드에 올리기 · 내리기 (구단, 대표 사진) | `mobile/src/send/publish.ts` | 글쓰기 | |
| A5-7 | 설정: 밝기 · 계정 · 할당량 · 탈퇴 · 백업 · 약관 · 라이선스 · 피드백 · 차단 목록 | `app/(tabs)/me/settings/*` | 디자인 | 탈퇴 뒤 서버에 남는 것 없음 |
| A5-8 | 운영 현황 + 신고 처리 (운영자만) | `app/(tabs)/me/admin.tsx` | 디자인 | 운영자가 아니면 안 보임 |
| A5-9 | 라이선스 목록 (앱 의존성 포함) | `scripts/generate-licenses.mjs` 확장 | 플랫폼 | |

### A6 스탯 · 전술

| ID | 작업 | 파일 | 담당 | 확인 |
| --- | --- | --- | --- | --- |
| A6-1 | 스탯 시트 (반쯤 열림, 리그 · 순위 · 득점 · 결과 · 지난 시즌 비교, 추천 사이트) | `app/write/tool/[kind].tsx`, `mobile/src/stats/*` | 글쓰기 + 디자인 | 넣은 표에 출처 · 조회일 |
| A6-2 | Canvas2D 어댑터 정식화 | `mobile/src/skia/canvas2d.ts` | 미디어 | 웹 PNG와 픽셀 비교(허용 오차) |
| A6-3 | 전술판: 포메이션 · 장면 · 공 · 이름 · 도형 · 색 · 끌기 · 재생 | `mobile/src/tactics/*` | 미디어 | core 테스트 공유, 실기기 |
| A6-4 | 내보내기 PNG · GIF · MP4, "사진에 저장" | `mobile/src/tactics/export/*` | 미디어 | 두 OS에서 재생 |
| A6-5 | 본문에 넣기 (4.3) · 다시 열어 고치기 | `mobile/src/editor/insert.ts` | 글쓰기 | |

### A7 사진

| ID | 작업 | 파일 | 담당 | 확인 |
| --- | --- | --- | --- | --- |
| A7-1 | 불러오기 · EXIF · HEIC · 두 장 붙이기 | `mobile/src/photo/load.ts` | 미디어 | 세로 사진이 눕지 않음 |
| A7-2 | 표시 도구 9종 (선 · 화살표 · 곡선 · 물결 · 고리 · 조명 · 구역 · 글자 · 번호) | `mobile/src/photo/marks/*` | 미디어 | 웹 결과와 나란히 비교 캡처 |
| A7-3 | 고르기 · 손잡이 · 색 바꾸기 · 지우기 · 되돌리기 | `mobile/src/photo/Selection.tsx` | 미디어 + 디자인 | |
| A7-4 | 내보내기 · 사진에 저장 · 본문에 넣기 | `mobile/src/photo/export.ts` | 미디어 | |

### A8 영상

시작 전 질문: iOS WebM 처리(가정: 받지 않음).

| ID | 작업 | 파일 | 담당 | 확인 |
| --- | --- | --- | --- | --- |
| A8-1 | `hp-video` iOS: 자르기(Passthrough · 재인코딩) · 배속 · 소리 제거 · 표시 굽기 | `mobile/modules/hp-video/ios/*` | 미디어 | 실기기 |
| A8-2 | `hp-video` Android: Media3 Transformer로 같은 기능, 짝수 해상도 | `mobile/modules/hp-video/android/*` | 미디어 | 실기기 |
| A8-3 | JS 인터페이스 · 진행률 · 취소 · 백그라운드 끊김 처리 | `mobile/modules/hp-video/index.ts` | 미디어 | |
| A8-4 | 영상 화면: 불러오기(공간 확인, 2GB) · 미리보기 · 구간 · 배속 · 음소거 · 표시 | `mobile/src/video/*` | 미디어 + 디자인 | 상한 안내 문구 |
| A8-5 | GIF (Skia Video 프레임 → drawMark → gifenc) | `mobile/src/video/gif.ts` | 미디어 | 15초 상한 |
| A8-6 | 본문에 넣기 · 사진에 저장 | — | 글쓰기 | |

### A9 보내기

| ID | 작업 | 파일 | 담당 | 확인 |
| --- | --- | --- | --- | --- |
| A9-1 | 보내기 시트 (카페 바로 올리기 맨 위, D8) | `app/write/send.tsx` | 디자인 | |
| A9-2 | 카페 바로 올리기 (네이버 인증 세션, 사진 축소, 토큰은 메모리) | `mobile/src/send/cafe.ts` | 글쓰기 | 실기기에서 카페 게시 성공 |
| A9-3 | 글 복사(HTML) + 사진첩 저장(번호 순서, HIGH PRESS 앨범) + 네이버 앱 열기 | `mobile/src/send/copy.ts` | 글쓰기 | A2-4 결과대로 문구 |
| A9-4 | PC로 보내기 (미디어 ZIP 공유) | `mobile/src/send/zip.ts` | 글쓰기 | |

### A10 스토어 준비

| ID | 작업 | 파일 | 담당 | 확인 |
| --- | --- | --- | --- | --- |
| A10-1 | 앱 아이콘(H와 공, iOS 다크 · 틴트), 스플래시 | `mobile/assets/*` | 디자인 | |
| A10-2 | Privacy Manifest · Android 권한 최소화 · `allowBackup:false` | `app.config.ts` | 플랫폼 + 보안 | |
| A10-3 | 스토어 등록 자료: 설명 · 스크린샷(Play 2~8장, iPhone 6.9형) · 기능 그래픽 1024×500 · 개인정보 라벨 · 데이터 보안 양식 · 연령 등급 | `store/`(새 폴더, 문구 · 이미지) | 플랫폼 + 디자인 | |
| A10-4 | 심사 메모 · 심사 계정 · 상한 여유 확인 | `store/review-notes.md` | 플랫폼 + 운영자 | 남은 자리 확인 |
| A10-5 | 전체 보안 점검 (PRD 9.6 1~8, MobSF 포함) | — | 보안 | 발견 사항을 고치고 다시 점검 |
| A10-6 | Maestro E2E 전체 흐름 (글쓰기 → 전술 넣기 → 저장 → 카페 올리기 / 피드 읽기 · 신고) | `mobile/e2e/*.yaml` | 플랫폼 | 두 실기기 통과 |

### A11 출시 (요청을 받은 뒤)

| ID | 작업 | 담당 | 확인 |
| --- | --- | --- | --- |
| A11-1 | Android production 빌드 → Play 비공개 테스트 트랙 | 플랫폼 | 테스터 설치 |
| A11-2 | 14일 동안 받은 피드백으로 고치기 (EAS Update 또는 새 빌드) | 전원 | `fixed.md` 앱 구역 |
| A11-3 | iOS production 빌드 → TestFlight → 같은 기간 확인 | 플랫폼 + 운영자 | |
| A11-4 | Play 프로덕션 신청 | 운영자 | 심사 통과 |
| A11-5 | App Store 심사 제출 (EAS Submit) | 플랫폼 + 운영자 | 반려되면 사유를 기록하고 고쳐서 다시 |
| A11-6 | 홍보 글 · 사이트에 앱 링크 | 메인 | 요청 시 |

## 7. 테스트

### 7.1 층별 테스트

| 층 | 도구 | 범위 |
| --- | --- | --- |
| packages/core · editor | vitest (웹과 같이) | 옮긴 로직의 기존 테스트를 그대로 가져가고, 어댑터 경계를 테스트 |
| 웹 | vitest + Testing Library (지금 그대로) | 매 단계 전체 실행. 메모리 때문에 `--maxWorkers=1 --pool=threads` |
| 앱 화면 · 로직 | jest-expo + React Native Testing Library | 저장, 동기화, 메시지 규약, 화면 상태 |
| 서버 | `supabase/tests/rls_check.sql` | 마이그레이션마다 |
| 네이티브 모듈 | 실기기 수동 + 작은 예제 영상 세트 | A8 |
| 흐름 | Maestro CLI (실기기) | A3부터 화면이 생길 때마다 흐름 추가 |

### 7.2 실기기 확인 목록 (각 화면 단계마다)

- 세로 기본, 회전이 허용된 화면은 가로도 본다.
- 큰 글자 크기(접근성 최대)에서 넘침 · 잘림이 없는지.
- 어두운 화면 · 밝은 화면 모두.
- VoiceOver / TalkBack으로 주요 버튼 이름을 읽는지.
- 키보드가 열렸을 때 입력칸 · 버튼이 가려지지 않는지.

### 7.3 캡처 (CLAUDE.md 규칙 8 대신)

- Android: `adb exec-out screencap -p > shot.png` (scratchpad에 저장).
- iOS: TestFlight · 개발 빌드에서 운영자가 찍어 보내 준다.
- 캡처를 보고 간격 · 넘침 · 정렬을 고친 뒤 다시 찍어 보여 준다.

## 8. 단계 종료 조건 (모든 단계 공통)

1. 그 단계 표의 "확인"이 모두 통과한다.
2. 웹 `npm test`와 `npm run build`가 통과한다(웹 회귀 없음).
3. 앱 jest와 해당 Maestro 흐름이 통과한다.
4. 보안 서브 에이전트가 PRD 9.6에서 그 단계에 해당하는 항목을 점검했고, 나온 문제를 고친 뒤 다시 점검했다.
5. 화면을 바꿨다면 실기기 캡처를 확인했다.
6. `fixed.md` "앱" 구역에 기록하고, 바뀐 결정은 PRD 15 · 16장에 반영했다.
7. 한 줄 보고: `A?-? 완료: …`.

## 9. 단계별로 물을 미정 · 가정 항목

| 단계 | 물을 것 (PRD 15장) |
| --- | --- |
| A0 | Expo SDK, 앱 버전 체계, 번들 ID, (운영자) 앱 이름 중복 · 카드 요구 여부 |
| A1 | 금칙어 목록 출처, 연령 기준, 숨김 문구, 방문자 수를 웹 · 앱으로 나눠 셀지 |
| A2 | 시험 결과에 따른 에디터 방식 · 네이버 콜백 · GIF/MP4 경로 |
| A3 | 글꼴 용량 |
| A4 | 앱에 넣는 사진 크기 |
| A6 | 결과물 저장 위치 |
| A8 | iOS WebM |
| A10 | 성능 · 앱 크기 수치 기준, 스토어 설명 문구 |

## 10. 시험 · 결정 기록

| 날짜 | ID | 결과 | 결정 |
| --- | --- | --- | --- |
| 2026-10-23 | 공통 | 안드로이드 에뮬레이터(API 37, 소프트웨어 그래픽)에서 시험. 속도 값은 참고만. iOS 절반은 O-2 뒤. 개발 빌드가 EAS 무료 워커(16GB, 스왑 없음)에서 Skia C++ 컴파일 중 메모리 부족으로 네 번 실패 | 개발 빌드는 x86_64만 · Gradle 작업 1개 · ninja -j2(`mobile/scripts/eas-limit-ninja.sh`)로 통과. 정식 빌드(4 ABI)도 같은 문제가 날 수 있어 A10에서 같은 설정으로 먼저 시험 |
| 2026-10-23 | A2-1 | @expo/dom-webview + TipTap: 입력 · 자동 저장 · 키보드 바로 위 서식 줄 · 표(표 전용 도구 줄) · 사진 1장(읽기 1.4초, 보내기 0.26초, 웹뷰 축소 3.6초) · 긴 글 17,644자(71.5KB) 받기 왕복 0.2~0.3초 · 되살리기 통과. 입력 지연 중간값 257ms(에뮬레이터). react-native-webview 엔진은 빈 화면 | 에디터는 DOM 컴포넌트 + @expo/dom-webview로 간다. **한글 조합(낱자 깨짐) · 선택 핸들 · 사진 10장 · iOS는 실기기에서 남음** (adb로 한글을 칠 수 없음) |
| 2026-10-23 | A2-2 | 22명 + 공 · 선 · 구역 · 화살표 모두 그려지고 손가락 끌기 동작. 앱 PNG(1280×856)와 웹 PNG가 0.50% 다름 — 이름 글자만 다르고(글꼴 차이) 도형은 같음. 끌기 4.4fps · 한 번 그리기 평균 15ms(에뮬레이터) | Skia 어댑터로 간다. 이름 글자를 웹과 맞추려면 Skia에 Pretendard를 넣는다(A3-3). 60fps 판정은 실기기에서 |
| 2026-10-23 | A2-3 | hp-video(Media3 1.11.1)로 60초 클립: 원본 그대로 13.1초(transmuxed, 13.3초 요청 → 앞 키프레임 12.0초에서 시작), 다시 인코딩 220초(c2.android.avc.encoder, 에뮬레이터 소프트웨어 인코더), edit list 7.6초. 모두 59.99초 결과 | 안드로이드 통과. expo-image-picker는 고른 영상을 앱 캐시로 복사하므로 2GB 영상은 A8에서 복사 없이 여는 방법을 본다. iOS(AVFoundation)는 O-2 뒤 |
| 2026-10-23 | A2-6 | 워크렛에서 15초 GIF(960×642, 20fps, 257장, 6.5MB) 432초 — 인코딩(gifenc)이 426초. 만드는 동안 JS 스레드는 막히지 않음 | **기준(30초) 미달**. 실기기가 에뮬레이터보다 몇 배 빨라도 못 미침 → 계획대로 네이티브 인코더(hp-video: Android 네이티브, iOS ImageIO)로 바꾼다. 실기기 1회 측정 뒤 확정 |
| 2026-10-24 | A2-6 대비책 | hp-video에 Kotlin GIF 인코더(장면별 팔레트: 15비트 칸 빈도 상위 256색 + LZW)를 넣고 같은 15초 GIF: **전체 21.1초**(그리기 15.2초와 인코딩 11.5초가 겹쳐 돎), 257장, 6.8MB. 파일 구조 검사(프레임 257 · 지연 합 15.00초 · 끝 표시) 통과, 앱에서 표시됨. PC JVM 시험에서 평균 색 오차 0.04 | **기준(30초) 통과 → GIF는 네이티브 인코더로 확정(Android)**. 이제 시간의 대부분은 JS 쪽 그리기(Skia readPixels)라, 줄이려면 그리기를 손본다. iOS는 같은 규칙을 ImageIO로(O-2 뒤) |
| 2026-10-23 | A2-7 | view-recorder로 1280×720 H.264 MP4(15.00초, 450프레임, 4.7MB) 248초. 크롬에서 재생되고 장면 순서 맞음. 화면의 보기(약 1016px 폭)를 늘려 찍어 조금 흐림. RN 0.88용으로 patch-package 수정 필요 | 크기 지정 · 재생 통과 → 유지. 선명도 · 시간은 실기기에서 다시 보고, 부족하면 hp-video 인코더로. 패치는 라이브러리가 고치면 뺀다 |
