# HIGH PRESS 앱 PRD (iOS · Android)

v1 · Oct 17, 2026 · @lee

웹사이트(`https://app.high-press.workers.dev`, v0.23.0)와 **기능은 전부 같고, 화면만 휴대폰 앱에 맞춘** 앱을 Expo(React Native)로 만들어 애플 앱스토어와 구글 플레이에 올린다.

이 문서는 서브 에이전트 다섯(디자인, 글쓰기 기능, 미디어, 보안, 플랫폼·스토어)의 조사를 메인 세션이 합쳐 결론을 내고, 요청자 인터뷰로 확정한 내용이다. 웹의 요구사항은 `축구 칼럼 앱 PRD v2.md`, 제품 원칙은 `PRODUCT.md`, 이전 스토어 검토는 `appsuggest.md`를 따른다. 이 문서는 그 위에 **앱에서 달라지는 것만** 적는다.

**상태 표기**: `확정` 요청자가 정함 / `가정` 작성자가 둔 안, 확인 필요 / `미정` 실측·답변 대기

---

## 1. 개요

| 항목 | 내용 |
| --- | --- |
| 제품 | HIGH PRESS 앱. 축구 칼럼 작성 도구 (글쓰기 + 스탯 + 영상 컷편집 + 전술 모션그래픽 + 사진 편집 + 피드) |
| 플랫폼 | iOS · Android 휴대폰. 태블릿은 실행되지만 휴대폰 화면을 늘려 보여 줌 |
| 기술 | Expo(React Native) 크로스 플랫폼, 개발 빌드(dev client) |
| 서버 | 웹과 같은 Supabase 프로젝트를 그대로 씀 (계정 하나로 웹과 앱을 함께 사용) |
| 저장 원칙 | 웹과 같음. 기기가 원본, 서버에는 작성 중 초안의 글 사본과 피드에 올린 글만 |
| 배포 | 한국만. 안드로이드를 먼저 내고, 아이폰은 그 뒤 |
| 결과물의 도착지 | 네이버 카페(바로 올리기 우선) · 네이버 블로그(복사) |

## 2. 목표 / 비목표

| 구분 | 내용 |
| --- | --- |
| 목표 | 웹의 모든 기능을 앱에서 똑같이 쓸 수 있다 (6장의 대응표가 기준) |
| 목표 | 휴대폰 한 손 조작에 맞는 화면, 각 OS의 관례를 따르는 조작 |
| 목표 | 두 스토어 심사 통과 (UGC · 로그인 · 계정 삭제 · 개인정보 요건 충족) |
| 목표 | 운영비 0원 유지. 예외는 스토어 등록비뿐 |
| 목표 | 웹과 앱이 같은 서버 · 같은 계정 · 같은 백업 형식을 쓴다 |
| 비목표 | 태블릿 전용 화면(분할 창) — 늘려 보이기만 |
| 비목표 | 알림(푸시) — `PRODUCT.md`의 "만들지 않는 것" 유지 |
| 비목표 | 사진 · 영상의 서버 동기화 (웹과 같음) |
| 비목표 | 앱 안 결제, 광고, 추적 SDK |
| 비목표 | 한국 밖 배포 |

## 3. 필수 제약

| 제약 | 적용 방식 | 상태 |
| --- | --- | --- |
| 무료 원칙 | 웹과 같음. 결제수단 등록이 필요한 서비스 · 종량제는 쓰지 않음 | 확정 |
| 무료 원칙의 예외 | 구글 플레이 등록비 25달러(1회), 애플 개발자 프로그램 99달러(매년). 이 둘만 예외 | 확정 |
| 빌드 | EAS Build 무료 플랜(매달 Android 15회 · iOS 15회, 넘으면 다음 달까지 막힘, 과금 없음). 결제수단 등록이 필요하면 즉시 중단하고 보고 | 확정 (카드 필요 여부 미확인) |
| 개발 PC | Windows 11, 메모리 8GB, Mac 없음. 에뮬레이터 대신 실기기(안드로이드폰 · 아이폰 모두 있음)로 확인 | 확정 |
| 미디어 | 기기 안에서만 처리. 서버로 올리는 예외는 웹과 같음(대표 사진 1장, 프로필 사진 1장, 카페 바로 올리기 중계) | 확정 |
| 보안 점검 | strix는 쓰지 않음. 9.6의 무료 점검 절차로 대신 | 확정 |
| 비밀 값 | `.env.local`(커밋 금지)과 Supabase secrets에만. 앱 번들에는 공개 값만 (9.2) | 확정 |

## 4. 확정된 결정 (2026-10-17 인터뷰)

| # | 항목 | 결정 |
| --- | --- | --- |
| D1 | 스토어 등록비 | 두 스토어 모두 무료 원칙의 예외로 둔다 |
| D2 | 기기 범위 | 휴대폰 우선. 태블릿은 늘려 보이기만 |
| D3 | 서브 에이전트 | 디자인 · 글쓰기 기능 · 보안(필수) + 미디어 · 플랫폼·스토어 · 서버. 메인 세션이 총합해 판단 (13장) |
| D4 | 출시 순서 | 안드로이드 먼저. 비공개 테스트(12명 · 14일) 동안 아이폰은 TestFlight로 확인, 그 결과를 반영해 애플 심사 |
| D5 | 시험 기기 | 안드로이드폰 · 아이폰 모두 있음 |
| D6 | 코드 위치 | 같은 저장소 + 공통 패키지 (npm workspaces). git을 새로 시작 |
| D7 | 영상 엔진 | 직접 만든 네이티브 모듈 (iOS AVFoundation, Android Media3) |
| D8 | 휴대폰 내보내기 | 카페 바로 올리기 우선, "글 복사 + 사진첩 저장"은 보조 |
| D9 | 백업 형식 | 새 ZIP 형식(v2)을 웹 · 앱이 함께 씀. 기존 JSON(v1)은 읽기 유지 |
| D10 | 신고 처리 | 서로 다른 3명이 신고하면 자동으로 숨기고, 운영자가 운영 화면에서 복구 · 삭제 |
| D11 | 공개 연락처 | 운영자가 지금 쓰는 개인 메일 (약관 `OPERATOR_CONTACT`, 스토어 지원 연락처) |
| D12 | 가입자 상한 | 50명 → 100명. 무료 한도 80% 자동 제한은 그대로 |
| D13 | 배포 국가 | 한국만 |
| D14 | 애플 계정 | 개인 (판매자로 실명이 보임) |
| D15 | 처음 화면 밝기 | 웹처럼 어둡게. 설정에서 밝게 · 기기 따르기로 바꿀 수 있음 |
| D16 | OS별 모양 | 각 OS의 관례(탭 바, 시트, 메뉴, 뒤로 가기)를 따르고 색 · 글꼴 · 문구만 같게 |
| D17 | 아이콘 | 탭 · 메뉴는 OS 기호(SF Symbols / Material Symbols), OS에 없는 전술 · 사진 도구만 웹과 같은 Phosphor |
| D18 | 화면 회전 | 세로 고정. 전술판 · 영상 · 사진 화면만 가로 허용 |

## 5. 기술 기반

| 항목 | 내용 | 상태 |
| --- | --- | --- |
| Expo SDK | 조사 시점 최신은 SDK 58(React Native 0.88, New Architecture 필수). 착수할 때 최신 안정판과 React 버전을 context7로 다시 확인하고, 패키지는 `npx expo install`로 SDK에 맞춰 고정 | 가정 |
| 최소 OS | iOS 16.4, Android 7(API 24). 구글 목표 API 36(2026-08-31부터 필수)을 만족하는지 착수 때 확인 | 가정 |
| 개발 방식 | Expo Go가 아니라 개발 빌드. 네이티브 모듈(영상, Apple 로그인, Skia, 글꼴)이 들어가기 때문 | 확정 |
| 빌드 · 제출 | EAS Build(클라우드)로 APK/IPA를 만들고 EAS Submit으로 제출. iOS도 Windows에서 제출 가능 | 확정 |
| 화면 확인 | 실기기를 USB/Wi-Fi로 Metro에 연결 (Android Studio 없이 platform-tools만). 개발 빌드는 네이티브 모듈을 바꿀 때만 다시 만든다 | 확정 |
| 업데이트 | 글 · 화면 수정은 EAS Update(무료 한도 안)로, 네이티브 변경은 스토어 업데이트로 | 가정 |
| 앱 버전 | 1.0.0부터 웹과 따로 센다. 빌드 번호는 EAS가 올림. `fixed.md`에 "앱" 구역을 새로 둠 | 가정 |
| 테스트 | jest-expo + React Native Testing Library(단위 · 화면), Maestro CLI(무료, 실기기 E2E). 공통 패키지는 지금처럼 vitest | 가정 |

### 5.1 저장소 구조 (D6)

```
football_app/            ← git init (지금은 git 저장소가 아님. EAS가 git을 씀)
  package.json           ← npm workspaces
  src/ … (웹, 지금 자리 그대로)
  mobile/                ← Expo 앱 (expo-router)
  packages/core/         ← 순수 TS 공통 코드
  packages/editor/       ← TipTap 확장 · 정리 · 내보내기 변환 (웹과 앱의 에디터가 함께 씀)
  supabase/              ← 그대로
```

- **packages/core (약 1,700줄, 화면 없음):** 스탯 normalize · types · leagues · sites, 맞춤법 rules, commentTree, feedBody · excerptOf, bodyMedia, db/types, 백업 parse, sync · feed remote(Supabase 클라이언트를 밖에서 받게), autosave · saveStatus · urls · toolbarOptions, naver limits, 전술 animation · geometry · formations · projectOps, 사진 marks · collage(계산 부분), 영상 clip.
- **어댑터만 바꿔 쓰는 것 (약 800줄):** draftSync(저장소 인터페이스), stats api(환경 값 · 토큰), naverPost · cover(이미지 축소 함수 주입), 백업 입출력.
- **packages/editor (약 900줄):** extensions, blockLineHeight, statBlock, pastedHtml, sanitize, exportDocument, 맞춤법 위치 계산.
- **새로 짜는 것:** 모든 화면(TSX), 기기 저장(store · db), 사진 캔버스, 영상 네이티브 모듈.
- 웹 코드를 packages로 옮기는 동안 **웹 테스트를 매 단계 돌려 회귀를 막는다.** `crypto.randomUUID`는 expo-crypto로, Dexie liveQuery는 직접 만든 변경 알림으로 바꾼다.

## 6. 기능 요구사항 — 웹 기능 → 앱 대응표

웹에 있는 기능은 모두 앱에 있어야 한다. 아래 표의 "앱 구현"이 기준이고, 같은 결과를 낼 수 없는 것은 6.10에 따로 적는다.

### 6.1 화면 구조 (D16, D18)

루트 Stack 아래에 탭 3개를 두고, 각 탭 안에 Stack을 둔다.

| 웹 | 앱 |
| --- | --- |
| 홈 피드 탭 (검색, 리그 · 구단 줄, 전체/팔로잉, 인기 칼럼리스트) | **탭 1 피드.** 헤더에 네이티브 검색창, 구단 칩은 가로 스크롤, 인기 칼럼리스트는 맨 위 가로 아바타 줄 |
| 홈 내 칼럼 탭 (팀 필터, 베스트, 글쓰기 버튼) | **탭 2 내 칼럼.** 새 칼럼은 Android FAB / iOS 내비 바 +. 팀 추가는 시트 |
| 설정 서랍 (밝기 · 계정 · 피드백 · 백업 · 약관) | **탭 3 나.** 내 프로필 → 설정 목록 |
| 로그인 창 | 시트 |
| 글쓰기 `#/write/:id` | 전체 화면으로 push (탭 바 숨김) |
| 옆 창 (스탯 · 모션 · 영상 · 사진) | 시트. 스탯은 반쯤 열려 뒤의 글이 보이는 높이(0.5 / 1), 모션 · 영상 · 사진은 전체 높이 |
| 내보내기 · 피드에 올리기 · 카페 패널 | 에디터의 **보내기** 시트 하나 |
| 팀 선택 · 게시 링크 줄 | **글 정보** 시트 |
| 글 `#/p/:a/:id` | push. 좋아요 · 댓글 · 공유 막대를 아래에 고정, 내 글 메뉴는 헤더 ⋯ |
| 프로필 `#/u/:id` | push (내 것은 탭 3) |
| 약관 · 방침 · 라이선스 · 피드백 | 설정에서 push, 피드백은 시트 |
| 운영 현황 `#/admin` | 설정 → 운영 현황 (운영자에게만 보임) |

- **에디터 (휴대폰):**
  - **위쪽:** 뒤로(자동 저장을 바로 기록), 저장 상태, **저장**, 보내기, ⋯(임시저장 · 맞춤법 · 글 정보).
  - **아래쪽:** 키보드가 닫혀 있으면 도구 막대 [스탯 | 모션 | 영상 | 사진], 열려 있으면 키보드 위 서식 줄.
  - **본문에 넣기:** 끌어다 놓기 대신 시트 맨 아래에 고정한 "본문에 넣기" 버튼을 쓴다. 누르면 시트가 닫히고, 성공 햅틱이 울리고, 커서 자리에 들어간 뒤 그 자리로 스크롤한다.
- **회전:** 세로 고정. 전술판 · 영상 · 사진 화면에서만 가로를 허용한다.
- **앱다운 요소:**
  - 공유 시트: 글 링크, PNG · GIF · MP4 · ZIP, 백업 파일.
  - 사진 · 영상 고르기.
  - 길게 눌러 여는 메뉴: 피드 카드, 내 칼럼, 댓글.
  - 당겨서 새로 고침. 탭을 다시 누르면 맨 위로 가고 새로 고친다.
  - 행을 밀어 삭제. 가장자리를 밀어 뒤로 가기(iOS) · 예측 뒤로 가기(Android).
  - 백업 파일을 파일 앱 · 드라이브로 내보내고 가져오기.

### 6.2 디자인 (D15~D17)

- **색:** 웹의 `:root`와 다크 변수를 같은 이름으로 `theme.ts {light, dark}`에 옮긴다. 한 JSON에서 웹 CSS와 앱 TS를 함께 만들어 두 값이 어긋나지 않게 한다(가정).
  - 강조색은 먹색 하나다. 잔디색(`--live-a/b`)은 접속 점 · 새 글 고리 · 로고의 공에만, 좋아요 색은 좋아요에만 쓴다.
  - Android의 배경화면 따라 바뀌는 색(Material You)은 끈다.
- **밝기:** 처음에는 어둡게 연다. 설정에서 어둡게 / 밝게 / 기기 따르기를 고를 수 있다(D15).
- **글꼴:** Pretendard 5굵기(400 · 500 · 600 · 700 · 900, 약 7.8MB)를 expo-font config plugin으로 앱에 넣는다(가정).
  - Android는 굵기마다 `fontDefinitions`를 적어야 굵기가 먹는다.
  - 줄 높이는 글자 배율에 맞춰 계산한다. 고정 px로 두면 동적 글자 크기에서 잘린다.
  - 낱말 단위 줄바꿈은 iOS에서 `lineBreakStrategyIOS="hangul-word"`로 옮긴다. Android 방법은 착수 때 확인한다.
- **아이콘:** expo-symbols(iOS SF Symbols, Android Material Symbols). 전술 · 사진 도구만 phosphor-react-native + react-native-svg(D17).
- **움직임:** Reanimated 4(+ react-native-worklets). 시스템의 "움직임 줄이기" 설정을 따른다. 웹의 이징은 `bezier(0.16,1,0.3,1)`로 옮긴다. 새 글 고리의 원형 그라데이션은 SVG로 다시 그린다.
- **햅틱(expo-haptics):**
  - 탭 · 칩을 바꿀 때 selection, 선수를 집을 때 light, 넣기 · 저장 · 올리기에 성공하면 success, 오류는 warning.
  - Android는 시스템 진동 설정을 지키는 `performAndroidHapticsAsync`를 쓴다.
- **안전 영역과 키보드:** react-native-safe-area-context. Android는 edge-to-edge라 아래 막대마다 내비게이션 바 여백을 준다. 키보드는 react-native-keyboard-controller로 처리한다(서식 줄 · 댓글 입력은 키보드 위에 붙이고, 폼은 KeyboardAwareScrollView).
- **접근성(WCAG AA 대응):**
  - 웹의 aria-label 문구를 accessibilityLabel로 그대로 쓴다.
  - 누르는 영역은 44pt / 48dp 이상이다. 웹의 28~36px 버튼은 키우거나 hitSlop을 준다.
  - 저장 상태는 낭독기에 알린다. 빽빽한 스탯 표는 큰 글자에서 가로로 스크롤한다.
- **문구:** "이 브라우저에 저장"을 "이 기기에 저장. 앱을 지우면 사라집니다"로 바꾸는 식으로, 저장 위치를 앱에 맞게 고친다. 말투는 `PRODUCT.md`를 그대로 따른다.
- **앱에서 없어지는 것:** 마우스를 올렸을 때의 효과와 커서 빛은 앱에 없다. 편집기 글꼴 목록(나눔 · 굴림 · 바탕)은 휴대폰에 없어서, 앱 안 미리보기가 네이버에 붙인 결과와 다르게 보일 수 있다. 그 사실을 글꼴 메뉴에 적는다.
- **NativeTabs:** SDK 58에서는 `expo-router/native-tabs`로 들어왔다(템플릿 기본). 막히면 JS 탭으로 대신한다.

### 6.3 글쓰기 에디터 · 맞춤법

| 기능 | 앱 구현 |
| --- | --- |
| 에디터 (TipTap 3 전 기능: 글꼴 · 크기 · 색 · 정렬 · 줄간격 · 목록 · 인용 · 구분선 · 링크 · 표 · 이미지, 팀 태그) | **Expo DOM 컴포넌트(`'use dom'`) 안에서 지금의 TipTap 확장(packages/editor)을 그대로 쓴다.** 툴바와 패널은 네이티브로 새로 짠다. 명령은 ref 메서드(`useDOMImperativeHandle`)로 보낸다 |
| 붙여넣기 정리 | 웹뷰 안에서 DOMPurify를 그대로 돌린다 |
| 자동 저장 | 같은 `autosave` 로직. 웹뷰가 본문 JSON을 2초마다 넘긴다. 앱이 뒤로 가면(AppState) 바로 기록한다 |
| 맞춤법 | 규칙(core)을 공유한다. 검사는 웹뷰 안에서 하고, 결과 목록은 네이티브 패널에 보여 준다 |
| 사진 넣기 | expo-image-picker. 긴 변을 2560px로 줄여 저장한다(가정). 웹뷰에는 화면용으로 줄인 사본을 넘긴다 |

- **A2 실기기 시험(1주)에서 확인할 것:** 키보드 · 커서 · 선택 핸들 · 스크롤, 사진 10장일 때의 성능, 붙여넣기.
- **시험에 실패하면:** TenTap(@10play/tentap-editor, TipTap 3 기반)으로 바꾼다. 확장을 packages/editor에 따로 묶어 두므로 옮기는 비용이 작다.
- DOM 컴포넌트는 OTA 업데이트 범위와 웹뷰-네이티브 이음새를 따로 확인한다. 이음새가 보이면 애플 4.2(웹 포장) 반려 위험이 커진다.

### 6.4 기기 저장 · 백업 · 초안 동기화

| 기능 | 앱 구현 | 상태 |
| --- | --- | --- |
| 기기 저장 | expo-sqlite에 Dexie와 같은 표(columns · teams · tacticProjects · media 정보 · settings)를 만든다. 사진 같은 큰 파일은 expo-file-system의 `document/media/<id>`에 둔다. 임시 결과물(GIF 등)도 cache가 아니라 document 아래에 둔다 | 확정 |
| 백업 | **v2 ZIP**: `manifest.json` + `media/` 폴더를 fflate(순수 JS)로 만든다. 웹도 같은 v2로 바꾸고, v1 JSON은 웹 · 앱 모두 계속 읽는다. 웹 ↔ 앱으로 백업을 주고받을 수 있다 | 확정 (D9) |
| 기기 간 이어쓰기 | 웹과 같음. 작성 중 초안의 글만 서버로 동기화(3편 · 1MB · 7일)하고, 사진은 백업 파일로 옮긴다 | 확정 (웹과 동일) |
| 서버 클라이언트 | supabase-js를 그대로 쓴다. `flowType:'pkce'`, `detectSessionInUrl:false`, 앱이 앞에 있을 때만 토큰 자동 갱신 | 확정 |

### 6.5 스탯 · 피드 · 글 · 프로필 · 피드백 · 운영

- **스탯:** 같은 Edge Function `stats`를 쓴다. 환경 값은 `import.meta.env`에서 `EXPO_PUBLIC_*`로 바꾸고, 표를 그리는 코드는 네이티브로 짠다. 넣는 시점의 값으로 고정하고 출처 · 조회일을 적는 것은 웹과 같다.
- **피드 · 글 · 프로필:** 같은 RPC를 쓴다. 인기 칼럼리스트, 구단 거르기, 전체/팔로잉, 좋아요, 댓글 · 답글, 팔로우, 검색, 접속 중 점, 새 글 고리를 모두 넣는다.
  - **글 본문:** 웹뷰 없이 네이티브로 그린다. TipTap JSON에서 허용한 노드 · 서식만 컴포넌트로 바꾸므로 스크립트가 들어갈 여지가 없다.
  - **링크:** `isHttpUrl`로 확인한 뒤 시스템 브라우저로 연다.
- **피드에 올리기:** 웹과 같음(구단 선택, 대표 사진 한 장). 사진 축소는 expo-image-manipulator로, 업로드는 ArrayBuffer로 한다.
- **피드백 보내기 · 내 할당량 · 회원 탈퇴 · 약관 동의:** 웹과 같다.
- **운영 현황:** 웹과 같다(사용량, 하루 방문자). 여기에 **신고 처리 화면**을 더한다(8장).
- **방문자 수:**
  - 앱은 AsyncStorage에 마지막으로 센 날짜(`hp:visit-day`)만 두고, 앱이 앞으로 나올 때 한국 시간 기준 하루 한 번 센다.
  - `count_visit(source)`로 웹과 앱을 나눠 센다(가정, 마이그레이션 1개). 서버에 식별자는 보내지 않는다.

### 6.6 전술 모션그래픽

| 기능 | 앱 구현 |
| --- | --- |
| 경기장 · 선수 · 공 · 도형 · 이름 | `@shopify/react-native-skia` `<Picture>` + **Canvas2D 어댑터(약 150줄)**. 웹 `draw.ts`는 Konva 도형이 아니라 Canvas2D를 직접 부르므로 `drawFrame` · `drawShape` · `drawToken`을 거의 그대로 다시 쓴다. 화면과 내보낸 파일의 모양이 같다 |
| 끌기 · 누를 영역 | react-native-gesture-handler Pan + 직접 계산(원까지 거리, 선분까지 거리) |
| 포메이션 · 장면 · 재생 | core의 animation · formations · projectOps + Reanimated 시계 → `positionsAt` |
| PNG | Skia 오프스크린 surface → `encodeToBytes` |
| GIF | 프레임마다 `readPixels` → gifenc(JS 그대로, 워크렛 스레드). Hermes에서 너무 느리면 iOS는 ImageIO로 만든다 |
| MP4 | react-native-view-recorder(MIT, Skia 캔버스를 프레임 번호별로 녹화). 유지가 멈추거나 출력 크기를 못 정하면, D7에서 만드는 영상 네이티브 모듈의 인코더로 옮긴다 |

### 6.7 영상 편집 (D7)

| 기능 | 앱 구현 |
| --- | --- |
| 불러오기 | expo-image-picker(영상). 고르기 전에 남은 공간을 확인한다(iOS 선택기는 원본을 앱으로 복사함). 상한은 웹과 같이 파일 2GB · 구간 5분 · 결과 10분 · GIF 15초 |
| 미리보기 · 배속 · 음소거 | expo-video(`playbackRate`, `muted`) 위에 Skia로 표시를 겹친다 |
| 자르기 · 배속(0.25x~4x) · 소리 제거 | **직접 만드는 Expo 네이티브 모듈 `hp-video`**: iOS AVFoundation(AVAssetExportSession, 원본 그대로 자르기는 Passthrough), Android Media3 Transformer(트랜스먹스) |
| 표시(ring · spot)를 MP4에 굽기 | 같은 모듈 안에서 처리한다(iOS CIFilter 처리기, Android OverlayEffect). 웹과 같이 MP4 · GIF 모두 1차부터 넣는다 |
| GIF | Skia `Video`로 프레임을 꺼내 → 표시(core `drawMark`) → gifenc |
| WebM 입력 | iOS에서는 받지 않고 그 사실을 안내한다(가정). Android는 Media3가 읽을 수 있는 범위에서 받는다 |

- 인코딩하는 동안 앱이 백그라운드로 가면 iOS가 작업을 멈춘다. 그래서 화면을 켜 두고 진행 표시를 보여 주며, 끊기면 다시 시작하게 한다.
- Android 기기마다 MediaCodec이 다르게 동작하고, 홀수 해상도를 거부하는 기기가 있다. 출력 크기는 짝수로 맞추고 실기기로 실측한다.

### 6.8 사진 편집

| 기능 | 앱 구현 |
| --- | --- |
| 불러오기 · 두 장 붙이기 | expo-image-picker(`selectionLimit` 2) → expo-image-manipulator로 회전 정보(EXIF)를 적용하고 HEIC를 변환 → Skia `MakeImageFromEncoded`. 배치 계산은 core의 collage(plan*) |
| 선 · 화살표 · 곡선 · 물결 · 고리 · 조명 · 구역 · 글자 · 번호 | Skia Path · DashPathEffect · RadialGradient · Shadow · blendMode · Paragraph(Pretendard). 표시 데이터는 core의 marks |
| 크기 조절 손잡이 | Konva Transformer를 대신할 손잡이를 직접 만든다 |
| 글자 고치기 | 네이티브 TextInput |
| 내보내기 · 저장 | 오프스크린 surface → JPEG → expo-file-system. "사진에 저장"은 expo-media-library `Asset.create`(`saveToLibraryAsync`는 SDK 58에서 예외를 던지므로 쓰지 않음) |

### 6.9 내보내기 · 네이버 (D8)

**보내기 시트의 순서**

1. **네이버 카페에 바로 올리기 (맨 위).**
   - 같은 Edge Function `naver`를 쓴다.
   - 네이버 로그인은 시스템 브라우저 인증 세션(expo-web-browser)으로 하고, 사진은 expo-image-manipulator로 줄인다.
   - 한계는 웹과 같다: 사진이 글 맨 위에 붙고 최대 10장이며, MP4는 첨부할 수 없다.
2. **글 복사 + 사진첩에 저장.**
   - expo-clipboard로 HTML을 복사한다(`StringFormat.HTML`).
   - 사진은 "HIGH PRESS" 앨범에 번호 순서대로 저장한다. 쓰기 전용 권한만 받는다.
   - 그다음 네이버 앱을 연다. 블로그는 API가 없어 이 경로만 있다.
3. **PC로 보내기.** 미디어 ZIP을 공유 시트로 넘긴다.

**미확인 (A2에서 실측)**
- 네이버 블로그 · 카페 앱이 HTML 서식을 받아 주는지. 텍스트만 남으면 그 사실을 화면에 적는다.
- 카페 API를 일반 사용자에게 열려면 네이버 검수가 필요한지.
- 공유 시트로 파일 여러 개를 한 번에 보낼 수 있는지.

### 6.10 웹과 똑같이 하기 어려운 것

| 웹 | 앱에서 달라지는 것 | 대응 |
| --- | --- | --- |
| 글 옆 분할 창 + 끌어다 넣기 | 휴대폰 화면에서는 둘을 동시에 띄울 수 없다 | 스탯 시트는 반쯤 열어 글이 보이게 하고, "본문에 넣기" 버튼으로 넣는다 |
| 경계선 끌어 창 크기 바꾸기 | 없음 | 시트 높이 단계로 대신한다 |
| 서식 유지 복사 → 붙여넣기 | 네이버 앱이 받는지 미확인 | 카페 바로 올리기를 우선한다(D8) |
| 영상 WebM | iOS에서 열리지 않을 가능성 | iOS에서는 mp4 · mov만 받는다 |
| 원본 그대로 자르기 | 키프레임에 맞춰지는 위치가 웹과 조금 다를 수 있다 | 실측한 뒤 안내 문구를 넣는다 |
| 편집기 글꼴(나눔 · 굴림 · 바탕) | 휴대폰에 없다 | 글꼴 메뉴에 "네이버에서는 이 글꼴로 보입니다"라고 적는다 |

## 7. 계정 · 로그인

| 로그인 | 방식 | 상태 |
| --- | --- | --- |
| Google | 시스템 브라우저 + PKCE. `signInWithOAuth({skipBrowserRedirect:true})` → `WebBrowser.openAuthSessionAsync` → `exchangeCodeForSession`. 주소에서 토큰을 꺼내는 implicit 방식은 쓰지 않는다. 지금 Google 클라이언트를 그대로 쓴다 | 가정 |
| 네이버 | 시스템 브라우저 + 서버 함수 `naver-app`(서버가 코드를 받는 방식, 보안 점검 H1 대응 2026-10-24). 네이버 Callback URL은 `<SUPABASE_URL>/functions/v1/naver-app/callback`(https). 서버가 코드를 교환해 한 번 쓰는 로그인 표를 state 이름으로 2분 보관하고 브라우저를 `highpress://auth/callback?naver=1&state=…`(실패면 `&error=짧은 코드`)로 보낸다. 앱은 `POST naver-app/claim {state, verifier}`로 한 번만 찾아간다. 앱 주소에는 코드 · 로그인 표가 실리지 않는다. 네이티브 SDK는 Client Secret을 앱 안에 넣어야 해서 쓰지 않는다. 웹은 기존 `naver-login` 그대로 | 확정 |
| Apple (iOS만) | expo-apple-authentication + `signInWithIdToken` + nonce. App Store 4.8 요건이다. 탈퇴할 때 Apple 토큰을 취소(revoke)한다(.p8 키는 Edge Function 비밀 값) | 가정 |

- **리디렉트 주소:** 커스텀 스킴 하나(`highpress://auth/callback`)를 쓴다. Supabase 허용 목록에는 와일드카드 대신 정확한 주소를 넣는다. 개발용 `exp://`는 운영 프로젝트에서 뺀다.
- **네이버 콜백:** 네이버에는 https 주소(`naver-app/callback`)만 등록한다. 커스텀 스킴 등록 여부와 workers.dev 중계 페이지는 더는 필요 없다(2026-10-24).
- **남는 위험(공개 앱 공통):** 나쁜 앱이 처음부터 우리 Client ID로 로그인 창을 열고 사용자가 그 안에서 로그인을 마치면 그 앱이 세션을 얻는다(Google PKCE도 같은 종류). 사용자가 HIGH PRESS 동의 화면을 직접 거쳐야 하고, 완전히 막으려면 앱 진위 확인(Play Integrity · App Attest)이 필요해 범위 밖으로 둔다. naver-app이 막는 것은 "우리 앱이 연 로그인의 코드 · 앱 주소를 가로채는 경우"다.
- **심사용 계정:** 심사자가 로그인할 수 있는 계정과 접속 방법을 스토어에 함께 낸다. 상한 100명 안에 자리가 있어야 한다(D12).

## 8. 서버 변경 (웹과 함께 적용)

같은 서버를 쓰므로 아래 변경은 **웹에도 같이 들어간다.** 웹에도 신고 · 차단 화면을 넣는다. `PRODUCT.md`의 "만들지 않는 것: 신고 기능"은 이 문서로 바뀐다.

### 8.1 사용자 콘텐츠 안전 (두 스토어 필수)

| 항목 | 내용 | 근거 |
| --- | --- | --- |
| 신고 | 글 · 댓글 · 사용자 · 사진(대표 사진, 프로필 사진)을 신고한다. `reports` 표와 RLS를 두고, 본인 신고만 볼 수 있게 한다 | Apple 1.2, Play UGC |
| 자동 숨김 | 서로 다른 3명이 신고하면 바로 숨긴다. 운영자가 운영 화면에서 복구하거나 지운다 | D10 |
| 차단 | 사용자를 차단한다. 차단하면 그 사람의 글과 댓글이 바로 숨겨진다. `feed_page` · `post_comment_list` · 검색 · 인기 칼럼리스트에 반영한다 | Apple 1.2, Play UGC |
| 금칙어 | 서버 트리거로 글 · 댓글 · 닉네임 · 소개 글을 검사한다. 앱에서만 거르면 우회할 수 있다 | Apple 1.2 |
| 연락처 | 운영자 개인 메일을 약관 `OPERATOR_CONTACT`와 스토어 지원 연락처에 적는다 | D11 |
| 약관 보강 | 금지 콘텐츠의 정의, 불량 콘텐츠 · 사용자에 대한 무관용, 이용 정지 조항, 연령 기준 | Apple 1.2 |
| 계정 정지 | 운영자가 계정을 정지할 수 있다 | 권장 |
| 계정 삭제 웹 링크 | 로그인하지 않아도 볼 수 있는 탈퇴 안내 페이지(웹에 추가)와 메일로 요청하는 방법 | Google Play |
| 탈퇴 처리 한곳으로 | 지금은 앱이 사진을 먼저 지우고 계정을 지우는 순서라, 중간에 실패하면 사진이 남는다. 서버 함수 하나로 옮긴다. Apple 토큰 취소도 이 함수에서 한다 | 권장 |

### 8.2 앱을 위한 변경

| 항목 | 내용 |
| --- | --- |
| `naver-login` Origin 검사 | 앱은 Origin을 보내지 않아 지금은 403이 난다. Origin은 위조할 수 있어 보안 장치도 아니다. 이 검사를 빼고 IP · 호출 빈도 제한을 둔다(SEC-3) |
| `naver-login` 코드 가로채기 방지 | 앱이 무작위 verifier를 만들고 `state = base64url(SHA-256(verifier))`로 둔다. 코드를 교환할 때 서버가 verifier의 해시가 state와 같은지 확인한다. 웹은 https로 코드를 받으므로 이 방식 그대로. 앱은 2026-10-24 `naver-app`으로 옮겼다 — 코드는 서버(https)로만 오고, 앱 주소를 가로챈 다른 앱이 얻는 것은 state뿐이라 claim에서 400 `bad-verifier`로 막힌다 |
| `naver-app` + 0016 | `naver_app_pending`(state PK, token_hash, kind, created_at, expires_at=2분) · `naver_app_put` / `naver_app_take`(service_role 전용). RLS 켬, 정책 없음. rls_check 138~143 |
| Supabase Auth | Redirect URL에 `highpress://auth/callback`을 넣고, Apple 제공자를 켜고 번들 ID를 등록한다 |
| 가입자 상한 | 50명 → 100명 (D12). 운영 화면과 약관의 숫자도 고친다 |
| 방문자 수 | `count_visit(source)` (웹/앱) |
| 신고 · 차단 · 금칙어 | 8.1의 마이그레이션. `rls_check.sql`에 케이스를 더한다: 차단 뒤 글이 숨는지, 남의 신고 내용을 볼 수 없는지 |

## 9. 보안 요구사항 (앱)

웹 PRD 9장(SEC-1~)은 그대로 적용하고, 아래를 더한다.

### 9.1 로그인 · 딥링크
- PKCE를 쓴다. 네이버는 `naver-app` claim의 verifier 확인으로 대신한다.
- 리디렉트 허용 목록은 정확한 주소만 둔다.
- iOS의 인증 세션은 그 세션을 연 앱으로만 결과를 돌려준다. 가로채기 위험은 주로 Android에 있으므로 A2에서 `adb`로 조작한 딥링크를 보내 재현 시험을 한다.

### 9.2 비밀 값 · 토큰
- **앱 번들에 넣어도 되는 값(`EXPO_PUBLIC_*`):** Supabase URL, anon 키, 네이버 Client ID, Google 클라이언트 ID. 모두 공개 값이다.
- **번들에 절대 넣지 않는 값:**
  - 서버 비밀 값: service_role 키, NAVER_CLIENT_SECRET, 축구 API 키 2개, GMAIL_APP_PASSWORD, Apple .p8 키.
  - 빌드 · 서명 자격 증명: 안드로이드 키스토어, 스토어 업로드 키, EXPO_TOKEN.
  - 빌드에만 쓰는 값은 EAS Secret에 둔다.
- **세션 보관:** Supabase 공식 예시의 LargeSecureStore 방식을 쓴다. 암호화 키는 SecureStore(`WHEN_UNLOCKED_THIS_DEVICE_ONLY`)에, 암호문은 AsyncStorage에 둔다.
- **네이버 카페용 접근 토큰:** 지금처럼 메모리에만 둔다(SEC-6).
- **Android:** `allowBackup:false`. 출시판에서는 `console.log`를 없앤다.

### 9.3 웹뷰 (에디터 DOM 컴포넌트)
- 앱에 들어 있는 로컬 HTML만 불러온다. 페이지 안에 CSP(`connect-src 'none'`, 바깥 스크립트 금지)를 둔다.
- 첫 화면 말고는 모든 이동을 막고(`onShouldStartLoadWithRequest`), 링크는 앱 밖에서 연다.
- 파일 접근, 여러 창 열기, 출시판 웹뷰 디버깅을 모두 끈다.
- 웹뷰 → 앱 메시지는 정해 둔 type 목록 · 크기 상한 · 형식을 확인한다. 웹뷰에는 로그인 토큰을 넘기지 않는다.

### 9.4 피드 글 렌더
- 웹뷰를 쓰지 않는다. TipTap JSON에서 허용한 노드만 네이티브 컴포넌트로 그린다(6.5). DOMPurify는 React Native에서 돌지 않는다.

### 9.5 개인정보 (스토어 제출 자료)
- **Apple 개인정보 라벨 / Google 데이터 보안 양식:** 목적은 모두 "앱 기능"이고, 사용자와 연결되며, 추적은 없다.
  - 연락처: 이메일. 식별자: 사용자 ID.
  - 사용자 콘텐츠: 글 · 댓글 · 소개, 사진(대표 사진 · 프로필 사진), 고객 지원(피드백).
  - 사용 데이터: 마지막 접속 시각.
  - 방문자 수는 식별자가 없는 날짜별 숫자뿐이다. 수집에 넣을지는 제출할 때 판단한다.
  - Google 양식에는 전송 중 암호화 "예", 삭제 요청 가능 "예"를 적는다.
- **추적 허용 창(ATT):** 광고 · 분석 SDK가 없으므로 필요 없다. SDK를 새로 넣으면 다시 확인한다.
- **iOS Privacy Manifest:** `app.json`의 `ios.privacyManifests`에 둔다.
  - `NSPrivacyTracking: false`.
  - 필요 API 이유 코드 후보: UserDefaults CA92.1, 파일 시각 C617.1, 부팅 시각 35F9.1, 디스크 공간 E174.1. 정확한 코드는 빌드 결과로 확인한다(미확인).
- **개인정보처리방침:** 앱 항목(기기 저장 위치, Apple 로그인, 사진첩 쓰기 권한)을 더한다. 탈퇴 뒤에도 Gmail로 보낸 피드백 사본이 남는다는 점도 적는다.

### 9.6 strix 대신 쓰는 점검 절차 (모두 무료)

기능 단계가 끝날 때마다 보안 서브 에이전트가 아래를 돌린다. 수정은 구현 에이전트가 한다.

1. 9.1~9.5 체크리스트 리뷰
2. 마이그레이션마다 `supabase/tests/rls_check.sql` 다시 돌리기(신고 · 차단 케이스 포함), Supabase Security Advisor
3. 비밀 값 검사: `npx expo export` 번들과 APK에서 비밀 값 이름 · `service_role` · `BEGIN PRIVATE KEY`를 grep으로 찾고, 번들 속 JWT의 role이 anon인지 확인한다. 저장소 전체는 gitleaks로 검사한다
4. 의존성: `npm audit --omit=dev`, `npx expo-doctor`
5. APK 정적 분석: MobSF(Docker, 로컬)로 백업 허용 · 평문 통신 · 밖에 열린 컴포넌트 · 하드코딩된 비밀을 본다
6. 코드 규칙: semgrep(OSS)
7. 손으로 하는 시험
   - 조작한 딥링크를 보내고, 네이버 코드를 다시 써 본다.
   - 피드 글에 `<script>`, `javascript:` 링크, `onerror` 이미지를 넣어 실행되는지 본다.
8. 참고 기준: OWASP MASVS

## 10. 비기능 요구사항

| 항목 | 기준 | 상태 |
| --- | --- | --- |
| 오프라인 | 웹과 같다. 서버가 없어도 글쓰기 · 전술 · 영상 · 사진 · 복사가 된다 | 확정 |
| 성능 | 에디터에 사진 10장이 있어도 입력이 끊기지 않는다. 전술판은 끄는 동안 60fps를 목표로 한다. 숫자 기준은 A2 실측 뒤 정한다 | 가정 |
| 앱 크기 | 글꼴 약 7.8MB를 포함한 목표치는 A2 뒤 정한다 | 미정 |
| 접근성 | WCAG AA에 맞먹는 수준: VoiceOver · TalkBack 이름, 동적 글자 크기, 44pt/48dp 터치 영역, 움직임 줄이기 | 확정 |
| 화면 확인 | CLAUDE.md 규칙 8(Playwright 캡처)을 앱에서는 실기기 캡처로 대신한다. Android는 `adb exec-out screencap`, iOS는 TestFlight 빌드의 스크린샷을 쓴다. 휴대폰 세로 · 가로와 큰 글자 크기를 확인한다 | 확정 |
| 데이터 보존 | 앱을 지우면 기기의 칼럼이 사라진다. 첫 실행과 설정에서 이 사실과 백업 방법을 알린다 | 확정 |

## 11. 마일스톤

| 단계 | 내용 | 끝나는 조건 |
| --- | --- | --- |
| A0 준비 | git init, npm workspaces, `mobile/` 생성. 두 개발자 계정 등록(운영자, 신원 확인 1~3일). EAS 프로젝트(무료, 카드 요구 여부 확인) | 빈 앱이 실기기 두 대에서 개발 빌드로 뜸 |
| A1 서버 · 커뮤니티 안전 | 8장 전부: 신고 · 차단 · 금칙어 · 연락처 · 약관 · 탈퇴 함수 · 계정 삭제 웹 페이지, naver-login 변경, 상한 100, count_visit(source). **웹에 먼저 배포**한다(요청 시) | RLS 테스트 통과, 웹에서 신고 · 차단이 동작 |
| A2 실기기 시험 (1~2주) | ① DOM 에디터의 키보드 · 선택 · 성능 ② Skia 전술 어댑터 ③ `hp-video` 자르기 최소 기능(두 OS) ④ 네이버 앱 HTML 붙여넣기 ⑤ 네이버 커스텀 스킴 콜백 ⑥ gifenc 속도 | 각 항목 결정 기록. 실패한 항목은 대체안으로 바꿈 |
| A3 앱 골격 | 탭 · 스택, 테마 · 글꼴 · 아이콘, 로그인 3종, 기기 저장(sqlite · 파일), packages/core 분리(웹 테스트 통과 유지) | 로그인한 뒤 빈 칼럼을 저장하고 다시 열 수 있음 |
| A4 글쓰기 | 에디터 · 맞춤법 · 자동 저장 · 초안 동기화 · 백업 v2(웹도) | 웹 ↔ 앱으로 백업을 주고받음 |
| A5 피드 · 글 · 프로필 | 피드 전체, 신고 · 차단 화면, 피드백, 설정, 운영 현황(신고 처리) | 웹과 같은 피드를 앱에서 사용 |
| A6 스탯 · 전술 | 스탯 시트, 전술판 · 재생 · PNG/GIF/MP4 | 본문에 넣기까지 |
| A7 사진 | 사진 편집 전체 | 웹 사진 탭과 같은 결과물 |
| A8 영상 | `hp-video` 전체, 표시 굽기, GIF | 상한 안의 영상을 두 OS에서 내보냄 |
| A9 보내기 | 카페 바로 올리기, 복사 + 사진첩, ZIP | 실기기에서 카페 게시 성공 |
| A10 스토어 준비 | 개인정보 라벨 · Manifest, 스크린샷(Play 2~8장, iPhone 6.9형), 아이콘 · 기능 그래픽, 콘텐츠 등급(IARC, Apple 새 연령 설문), 심사 계정, 9.6 전체 점검 | 점검 통과 |
| A11 출시 | Android 비공개 테스트(12명 · 14일, 테스터는 카페 홍보 글로 모집) → 프로덕션. 같은 기간에 iOS TestFlight → 애플 심사 | 두 스토어에 공개 |

- 일정 어림: 개발(A0~A10) 8~14주(미확인), 출시(A11) 3~5주. A2 결과에 따라 다시 잡는다.
- 단계가 끝날 때마다 무엇을 했는지 한 줄로 알리고, `fixed.md` "앱" 구역에 기록한다.

## 12. 리스크

| 리스크 | 가능성 | 영향 | 대응 |
| --- | --- | --- | --- |
| 영상 네이티브 모듈 개발 · 유지 부담 (D7) | 높음 | 높음 | A2에서 자르기만 먼저 두 OS로 검증. 막히는 기능은 단계별로 안내 |
| 웹뷰 에디터의 키보드 · 커서 UX | 중간 | 높음 | A2 실기기 시험, 실패하면 TenTap |
| 애플 4.2(웹 포장) 반려 | 중간 | 높음 | 에디터 웹뷰 말고는 모두 네이티브. 이음새가 보이지 않게 한다 |
| 신고 · 차단 미비로 반려 | A1을 마치면 낮음 | 높음 | A1을 먼저 끝낸다 |
| 네이버 콜백이 커스텀 스킴을 허용하지 않음 | — | — | 해소(2026-10-24): 네이버에는 https 서버 주소(naver-app)만 등록 |
| 네이버 앱이 HTML 붙여넣기를 받지 않음 | 중간 | 중간 | 카페 바로 올리기 우선(D8), 블로그는 텍스트 + 사진첩 |
| 테스터 12명 · 14일을 못 채움 | 높음 | 중간 | 카페 홍보 글로 모집, 참여 방법을 한 장으로 정리 |
| 가입자 100명이 차서 심사자가 가입하지 못함 | 낮음 | 높음 | 제출 전에 남은 자리 확인 |
| EAS 무료 빌드 15회 소진 | 중간 | 중간 | 개발 빌드는 네이티브가 바뀔 때만 만들고, 나머지는 Metro와 EAS Update |
| 8GB PC 메모리 | 높음 | 중간 | 에뮬레이터를 쓰지 않음. 실기기 + 클라우드 빌드 |
| 1인 유지 라이브러리(view-recorder) 정지 | 중간 | 중간 | `hp-video` 인코더로 옮길 수 있게 둔다 |
| Android MediaCodec 기기 차이 | 중간 | 중간 | 짝수 해상도, 실기기 실측 |
| 애플 등록비를 갱신하지 않아 앱이 내려감 | 운영 중 상시 | 높음 | 갱신일을 운영 기록에 적는다 |
| 웹 코드를 packages로 옮기다 생기는 회귀 | 중간 | 중간 | 단계마다 웹 테스트 전체 실행 |
| NativeTabs 실험 기능의 API 변경 | 중간 | 낮음 | JS 탭으로 대체 |

## 13. 서브 에이전트 운영 (D3)

| # | 서브 에이전트 | 담당 | 권한 |
| --- | --- | --- | --- |
| 1 | 디자인 | 6.1 · 6.2 화면 구조, 토큰, 접근성, 실기기 캡처 점검. 작업 전에 impeccable · design-taste-frontend 스킬을 불러온다 | 코드 작성 (화면) |
| 2 | 글쓰기 기능 | 6.3 · 6.4 · 6.5(스탯 · 피드 올리기) · 6.9, packages/core · editor 분리 | 코드 작성 |
| 3 | 미디어 | 6.6 · 6.7 · 6.8, `hp-video` 네이티브 모듈 | 코드 작성 |
| 4 | 보안 | 7 · 9장, 9.6 점검 절차 | **읽기 · 테스트 전용** (수정 권한 없음) |
| 5 | 플랫폼 · 스토어 | 5장, EAS, 11장 A0 · A10 · A11, 스토어 제출 자료 | 코드 작성 (설정) |
| 6 | 서버 (Supabase) | 8장 마이그레이션 · Edge Function, RLS 테스트 | 코드 작성 (서버) |

**운영 규칙**

- 메인 세션이 먼저 확정하는 것: 공통 패키지의 경계(5.1), 기기 저장 스키마, "본문에 넣기" 공통 인터페이스. 확정 전에는 2 · 3번의 구현을 시작하지 않는다(A2 시험은 예외).
- 결정은 메인 세션이 서브 에이전트들의 결과를 **총합해서** 내린다. 한 에이전트의 권장안을 그대로 채택하지 않고, 겹치거나 부딪치는 권장(예: 디자인의 태블릿 분할 창 vs D2)은 확정 결정을 기준으로 정리한다.
- 각 에이전트는 담당 밖 파일을 고치지 않는다.
- 4번(보안)은 구현과 분리한다. 발견한 문제는 메인 세션에 보고하고, 해당 구현 에이전트가 고친다.
- 라이브러리 문법은 context7로 확인한다(CLAUDE.md 규칙 2).
- 15장의 `미정` · `가정` 항목에 닿으면 작업을 멈추고, 메인 세션을 거쳐 요청자에게 묻는다.
- 무료 원칙 위반(결제수단 등록 · 종량제)이 나오면 즉시 멈추고 보고한다. 예외는 D1뿐이다.
- 배포 · 스토어 제출 · 서버 반영은 요청자가 요청할 때만 한다.

## 14. 사용자 결정 수렴 절차

웹 PRD 14장과 같다.

1. 각 단계를 시작하기 전에 메인 세션이 그 단계의 미정 항목을 묻는다.
2. 질문에는 선택지와 권장안을 함께 낸다.
3. 답을 받으면 15장의 상태를 `확정`으로 바꾸고 결정 기록에 남긴다.

## 15. 남은 가정 · 미정 항목

| 항목 | 지금 안 | 상태 | 정할 때 |
| --- | --- | --- | --- |
| Expo SDK | SDK 58.0.14 (RN 0.88, React 19.3.0 — 웹과 같은 버전) | 확정 | A0 |
| 번들 ID · 앱 이름 | `dev.highpress.app` · HIGH PRESS | 확정 | A0 |
| 금칙어 목록 | 짧은 기본 목록(오탐이 적은 말만) + 운영 화면에서 추가 | 확정 | A1 |
| 가입 연령 | 만 14세 이상 (가입 동의 항목으로 확인) | 확정 | A1 |
| 자동 숨김 뒤 글쓴이 화면 | 알림 문구를 보여 줌 | 확정 | A1 |
| 에디터 방식 | DOM 컴포넌트(@expo/dom-webview) + TipTap. 안드로이드 에뮬레이터 통과(2026-10-23), 한글 조합 · iOS는 실기기 확인 전 | 가정 | A2 실기기 |
| 전술 MP4 | react-native-view-recorder (안드로이드 통과, 선명도는 실기기에서) | 가정 | A2 실기기 |
| GIF 인코더 | hp-video 네이티브 인코더. Android(Kotlin)는 에뮬레이터에서 21.1초로 기준(30초) 통과(gifenc는 432초). iOS는 ImageIO로 같은 규칙 | 확정(Android) · 가정(iOS) | iOS는 O-2 뒤 |
| 전술 이름 글꼴 | Skia에 Pretendard를 넣어 웹 PNG와 맞춤 | 가정 | A3-3 |
| Google 로그인 | 시스템 브라우저 + PKCE | 가정 | A3 |
| 네이버 콜백 | 서버 함수 https 콜백(`naver-app`) | 확정(2026-10-24) | — |
| 앱 권한 | 출시판은 인터넷 · 진동만(마이크 · 카메라 · 옛 저장소 · 다른 앱 위에 그리기 뺌) | 확정(2026-10-24) | — |
| 네이버 앱의 HTML 붙여넣기 | 실측 전 | 미정 | A2 |
| 카페 API 일반 공개 검수 | 웹에서 진행 중인 재검수와 같은 건 | 미정 | — |
| 결과물 저장 위치 | 앱 안에 두고 "사진에 저장" 버튼 | 가정 | A6 |
| 앱에 넣는 사진 크기 | 긴 변 2560px | 가정 | A4 |
| 글꼴 용량 | Pretendard 5굵기 전체 | 가정 | A3 |
| 방문자 수 | 웹 · 앱 나눠 세기 (`count_visit(p_source)`, 0015) | 확정 | A1 |
| 앱 버전 | 1.0.0부터 따로 | 확정 | A0 |
| iOS WebM | 받지 않음 | 가정 | A8 |
| EAS · 계정 가입 때 카드 요구 | 미확인 (요구하면 멈추고 보고) | 미정 | A0 |
| 앱 이름 "HIGH PRESS" 중복 | 웹 검색으로는 없음, 스토어에서 직접 확인 전 | 미정 | A0 |
| 성능 · 앱 크기 수치 기준 | — | 미정 | A2 뒤 |

## 16. 결정 기록

| 날짜 | 결정 | 근거 |
| --- | --- | --- |
| 2026-10-17 | 웹과 같은 기능의 Expo 앱을 만들어 두 스토어에 올린다. strix는 빼고 9.6으로 대신한다 | 요청자 지시 |
| 2026-10-17 | D1~D18 (4장) | 요청자 인터뷰 |
| 2026-10-17 | A0 착수: SDK 58, 번들 ID `dev.highpress.app`, 앱 이름 HIGH PRESS, git 로컬 커밋까지(원격 없음) | 요청자 인터뷰 |
| 2026-10-17 | A1: 금칙어 기본 목록 + 운영 화면 추가, 만 14세 이상, 숨김 알림 문구, 공개 연락처는 운영자 Gmail | 요청자 인터뷰 |
| 2026-10-18 | 자동 숨김 남용 완화: 가입 72시간 미만 신고자는 세지 않음, 운영자가 되돌린 대상은 자동으로 다시 숨기지 않음(사진 · 내용을 바꾸면 다시 대상), 운영자 계정 제외 | 보안 점검 M6, 메인 총합 |
| 2026-10-18 | 정지 회피 방지: 로그인 식별자를 서버 비밀값으로 HMAC 해 보관(정지가 풀리거나 탈퇴 후 최대 1년) | 보안 점검 M7 · N2, 메인 총합 |
| 2026-10-18 | 네이버 코드 가로채기 방지가 "네이버가 state를 대조한다"는 가정에 기댐 → A2-8 실측, 실패하면 서버가 코드를 받는 방식으로 | 보안 점검 H1 |
| 2026-10-24 | 앱 네이버 로그인을 서버가 코드를 받는 방식(`naver-app`)으로. A2-8의 "네이버가 state를 대조하는지" 실측에 더는 기대지 않음 | 보안 점검 H1, 요청자 인터뷰 |
| 2026-10-24 | 안드로이드에서 쓰지 않는 권한(마이크 · 카메라 · 옛 저장소 · 다른 앱 위에 그리기)을 개발 빌드 전에 뺀다 | 요청자 인터뷰 |
| 2026-10-24 | Pretendard 5굵기 전체를 앱에 넣는다 | 요청자 인터뷰 |
| 2026-10-23 | A2 안드로이드 절반(앱 혼자 되는 5개): 에디터 · 전술판 · 영상 자르기 · MP4는 유지, GIF는 gifenc 대신 네이티브 인코더로 | 에뮬레이터 시험, APP-PLAN 10장 |
| 2026-10-17 | `PRODUCT.md`의 "만들지 않는 것" 중 "앱스토어 배포"와 "신고 기능"을 뺀다. "알림"은 그대로 둔다 | D1, 8.1 |
| 2026-10-15 | (이전 검토) 구글 먼저, 애플은 나중. 이번에 Expo로 두 스토어를 모두 하는 것으로 바뀌었고, 순서(안드로이드 먼저)는 유지한다 | `appsuggest.md`, D4 |

## 출처

- Expo:
  - https://docs.expo.dev/versions/latest
  - https://expo.dev/changelog/sdk-58
  - https://docs.expo.dev/guides/dom-components
  - https://docs.expo.dev/develop/development-builds/introduction
  - https://docs.expo.dev/build-reference/local-builds
  - https://docs.expo.dev/submit/ios
  - https://expo.dev/pricing
  - https://docs.expo.dev/billing/faq
  - https://docs.expo.dev/versions/latest/sdk/securestore
  - https://docs.expo.dev/eas/environment-variables
  - https://docs.expo.dev/guides/apple-privacy/
- Supabase:
  - https://supabase.com/docs/guides/getting-started/tutorials/with-expo-react-native
  - https://supabase.com/docs/guides/auth/native-mobile-deep-linking
  - https://supabase.com/docs/guides/auth/sessions/pkce-flow
  - https://supabase.com/docs/guides/auth/social-login/auth-apple
- Apple:
  - https://developer.apple.com/app-store/review/guidelines/
  - https://developer.apple.com/support/offering-account-deletion-in-your-app/
  - https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications
- Google Play:
  - https://support.google.com/googleplay/android-developer/answer/14151465
  - https://support.google.com/googleplay/android-developer/answer/9876937
  - https://support.google.com/googleplay/android-developer/answer/13327111
  - https://developer.android.com/google/play/requirements/target-sdk
  - https://developer.android.com/media/media3/transformer/transformations
- 라이브러리:
  - https://github.com/react-native-webview/react-native-webview/blob/master/docs/Reference.md
  - https://github.com/Rednegniw/react-native-view-recorder
  - https://github.com/maitrungduc1410/react-native-video-trim
  - https://github.com/arthenica/ffmpeg-kit (은퇴. 쓰지 않음)
  - context7: /wcandillon/react-native-skia, /websites/expo_dev
