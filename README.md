# HIGH PRESS (하이프레스)

축구 칼럼 한 편을 한 화면에서 끝내는 웹 도구입니다. 글쓰기, 스탯 조회, 영상 컷편집, 전술 모션그래픽을 글쓰기 창 옆에서 만들고, 결과를 네이버 블로그·카페에 붙여넣습니다.

- 배포 주소: https://app.high-press.workers.dev
- 버전: 0.25.0 (웹)

## 주요 기능

- **에디터**: 글꼴·크기·색·정렬·표·이미지, 자동 저장, 팀 태그, 기기 안에서 하는 맞춤법 검사
- **전술 모션그래픽**: 포메이션을 고르고 "장면 추가 → 선수 끌기"만 반복하면 애니메이션이 됩니다. PNG·GIF·MP4로 내보냅니다.
- **영상 편집**: 구간 자르기, 배속(0.25x~4x), 소리 제거, MP4·GIF 내보내기. 모두 기기 안에서 처리합니다.
- **스탯**: 주요 5개 리그의 순위표·득점 순위·경기 결과. 넣는 시점의 값으로 고정되고 출처와 조회일이 함께 적힙니다.
- **피드**: 가입자가 올린 칼럼을 읽고 좋아요·댓글·팔로우를 남깁니다. 읽기는 로그인 없이 누구나 할 수 있습니다.
- **내보내기**: 서식을 유지한 복사 + 미디어 ZIP, 네이버 카페 바로 올리기, 백업 내보내기·가져오기

## 데이터를 어디에 두나

- 글과 사진은 사용자 브라우저(IndexedDB)에 저장됩니다. 로그인하지 않아도 쓸 수 있습니다.
- 서버에는 작성 중 초안의 글 사본과, 사용자가 피드에 올린 글만 올라갑니다. 사진·영상·GIF는 올라가지 않습니다.
- 브라우저 데이터를 지우면 칼럼이 사라지므로 백업 내보내기를 해 두세요.

## 기술 구성

| 부분 | 사용한 것 |
| --- | --- |
| 화면 | React 19, Vite, TypeScript |
| 에디터 | TipTap |
| 전술판 | Konva (react-konva) |
| 영상 | Mediabunny, gifenc |
| 기기 저장 | Dexie (IndexedDB) |
| 서버 | Supabase (로그인 · 피드 · Edge Functions) |
| 배포 | Cloudflare Workers (정적 파일) |
| 테스트 | Vitest, Testing Library |

## 실행하기

Node.js 24에서 확인했습니다.

```bash
npm install
npm run dev      # 개발 서버
npm run build    # 배포용 빌드 (dist/)
npm test         # 테스트
npm run lint     # 코드 검사 (oxlint)
```

### 환경 변수

맨 위 폴더에 `.env.local` 파일을 만들고 아래 이름에 값을 넣습니다. 이 파일은 `.gitignore`에 들어 있어 커밋되지 않습니다. 값이 없어도 글쓰기·전술판·영상 편집은 됩니다.

```bash
# 개발 서버에서 스탯 조회 (vite 프록시가 씁니다)
FOOTBALL_DATA_TOKEN=     # football-data.org 토큰
API_FOOTBALL_KEY=        # api-football.com 키

# 계정 · 피드 (Supabase). anon(공개) 키만 넣습니다. service_role 키는 넣지 않습니다.
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

# 네이버 로그인 창을 열 때 쓰는 Client ID (공개되는 값)
VITE_NAVER_CLIENT_ID=
```

네이버 Client Secret 같은 서버 비밀 값은 `.env.local`이 아니라 Supabase 함수의 비밀 값으로 넣습니다. 서버 설정은 [supabase/README.md](supabase/README.md)에 순서대로 적혀 있습니다.

## 폴더 안내

```
src/            웹 화면 (기능별로 src/features/ 아래)
packages/core   웹·앱이 함께 쓰는 로직 (백업, 피드, 스탯, 전술판, 맞춤법, 동기화)
packages/editor 웹·앱이 함께 쓰는 에디터 확장과 붙여넣기 정리
supabase/       데이터베이스 마이그레이션, Edge Functions, 보안 규칙 테스트
vite/           개발 서버용 스탯 프록시
scripts/        디자인 토큰 생성, 라이선스 목록 생성
public/         아이콘 등 정적 파일
experiments/    기능을 정하기 전에 해 본 실측 코드 (API 확인, 영상 성능, 네이버 카페)
docs/           기획·계획·기록 문서
  PRD.md          요구사항 (무엇을 만드나)
  PLAN.md         구현 계획과 결정 기록
  naver-review.md 네이버 로그인 검수 신청 준비
  app/            앱 버전 기획·계획 (앱 코드는 이 저장소에 없습니다)
  log/fixed.md    버전별 수정 기록
PRODUCT.md      제품 원칙 요약 (디자인 작업 기준)
CLAUDE.md       Claude Code 작업 규칙
```

## 참고

- 이 저장소에는 웹 버전만 들어 있습니다. 앱(Expo) 코드는 포함하지 않았습니다.
- 운영비 0원이 제품 조건입니다. 무료 한도에 가까워지면 유료 전환이 아니라 사용량 제한으로 대응합니다.
- 구단은 공식 엠블럼 대신 구단 색과 약어로 표시합니다.
