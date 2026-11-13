-- 앱의 네이버 로그인을 서버가 코드를 받는 방식으로 (보안 점검 H1, 요청자 결정 2026-10-24, 서버 함수 naver-app).
-- 0001 ~ 0015 를 실행한 프로젝트에 이어서 한 번 실행한다. 여러 번 실행해도 같은 결과가 되게 썼다.
-- 웹의 네이버 로그인(naver-login)은 이 표를 쓰지 않으며 바뀌지 않는다.
--
-- 흐름: 네이버가 브라우저를 naver-app/callback 으로 보낸다 → 함수가 코드를 바꿔 로그인 표(token_hash)를 만들고
--   여기에 state 이름으로 2분 동안 둔다 → 앱이 naver-app/claim 에 { state, verifier } 를 보내면
--   함수가 verifier 의 해시가 state 와 같은지 본 뒤 행을 꺼내면서 지운다 (한 번만).
-- 표와 두 함수는 서버 함수(service_role)만 쓴다. 가입자 · 로그인하지 않은 사람은 읽지도 쓰지도 부르지도 못한다.

-- ── 받아 둔 로그인 표 (서버 전용) ────────────────────────────────────────
-- state = base64url(SHA-256(verifier)) 43자. token_hash 는 Supabase 의 한 번 쓰는 로그인 표(서버가 낸 hashed_token)다.
-- kind 는 앱이 verifyOtp 에 넘길 종류 ('email', 서버 버전에 따라 'magiclink').
create table if not exists public.naver_app_pending (
  state text primary key check (state ~ '^[A-Za-z0-9_-]{43}$'),
  token_hash text not null check (char_length(token_hash) between 1 and 200),
  kind text not null default 'email' check (kind in ('email', 'magiclink')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 minutes'
);
alter table public.naver_app_pending enable row level security;
create index if not exists naver_app_pending_expires on public.naver_app_pending (expires_at);
-- 정책을 하나도 두지 않고 권한도 거둔다 (service_role 은 RLS 를 건너뛰고, 아래 함수는 만든 사람 권한으로 돈다).
revoke all on public.naver_app_pending from public, anon, authenticated;

-- 넣기: 같은 state 가 이미 있으면 넣지 않고 false. 넣기 전에 만료된 행을 조금씩 치운다 (따로 예약 작업을 두지 않는다).
-- 만료 시각은 이 함수가 정한다 (지금부터 2분). 꼴이 틀린 값은 표의 check 에 걸려 오류가 난다.
create or replace function public.naver_app_put(p_state text, p_token_hash text, p_kind text default 'email') returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  added int;
begin
  delete from public.naver_app_pending
  where state in (select p.state from public.naver_app_pending p where p.expires_at <= now() limit 50);
  insert into public.naver_app_pending (state, token_hash, kind, created_at, expires_at)
  values (p_state, p_token_hash, coalesce(p_kind, 'email'), now(), now() + interval '2 minutes')
  on conflict (state) do nothing;
  get diagnostics added = row_count;
  return added = 1;
end;
$$;
revoke execute on function public.naver_app_put(text, text, text) from public, anon, authenticated;
grant execute on function public.naver_app_put(text, text, text) to service_role;

-- 꺼내기: 아직 살아 있는 행이면 지우면서 { token_hash, kind, expires_at } 를, 없거나 만료됐으면 null 을 돌려준다.
-- 한 문장(delete … returning)이라 같은 state 로 동시에 두 번 불러도 한쪽만 받는다. 만료된 행도 이때 치운다.
-- verifier 확인은 이 함수를 부르기 전에 서버 함수가 한다 (틀린 verifier 로 남의 행을 지우지 못하게).
create or replace function public.naver_app_take(p_state text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  taken jsonb;
begin
  delete from public.naver_app_pending p
  where p.state = p_state and p.expires_at > now()
  returning jsonb_build_object('token_hash', p.token_hash, 'kind', p.kind, 'expires_at', p.expires_at) into taken;
  delete from public.naver_app_pending
  where state in (select p.state from public.naver_app_pending p where p.expires_at <= now() limit 50);
  return taken;
end;
$$;
revoke execute on function public.naver_app_take(text) from public, anon, authenticated;
grant execute on function public.naver_app_take(text) to service_role;
