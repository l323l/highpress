// 앱의 네이버 로그인 (서버가 코드를 받는 방식). 하는 일과 경로는 handler.ts 에 있다.
// 비밀값: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET (naver-login · naver 와 같은 값). SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 는 Supabase 가 넣어 준다.
// 네이버가 브라우저를 Supabase 로그인 없이 보내므로 --no-verify-jwt 로 올린다:
//   supabase functions deploy naver-app --no-verify-jwt
// 0015_app_support.sql(빈도 제한) · 0016_naver_app.sql(받아 둔 로그인 표)을 넣은 뒤에 올린다. 없으면 error=off · 503 off 로 멈춘다.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { handle } from './handler.ts'

Deno.serve((req) => {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const url = Deno.env.get('SUPABASE_URL')
  const admin = serviceKey && url ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null
  return handle(req, {
    clientId: Deno.env.get('NAVER_CLIENT_ID') ?? '',
    clientSecret: Deno.env.get('NAVER_CLIENT_SECRET') ?? '',
    admin,
  })
})
