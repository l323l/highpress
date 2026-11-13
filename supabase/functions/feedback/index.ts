// 피드백 받기: 가입자가 보낸 문의를 서버에 적고, 운영자의 Gmail 로 보낸다.
// 메일에는 닉네임과 종류·내용만 담는다. 보낸 사람의 이메일 주소는 담지 않는다.
// 비밀값: supabase secrets set GMAIL_USER=me@gmail.com GMAIL_APP_PASSWORD=<앱 비밀번호 16자>
// (선택) FEEDBACK_TO=받을 주소 — 없으면 GMAIL_USER 로 보낸다.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6'

const KINDS: Record<string, string> = { bug: '버그', idea: '제안', other: '그 밖에' }
const MAX_BODY = 2000
// 제목은 Claude 가 메일함에서 피드백만 골라 읽을 때 쓰는 표식이다. 바꾸면 feedback.md 의 절차도 함께 바꾼다.
const SUBJECT_TAG = '[HIGH PRESS 피드백]'

// 앱이 올라간 주소만 허용한다. 여러 개면 쉼표로 구분: supabase secrets set APP_ORIGINS=https://example.pages.dev,http://localhost:5173
function corsHeaders(req: Request): Record<string, string> {
  const allowed = (Deno.env.get('APP_ORIGINS') ?? '').split(',').map((origin) => origin.trim()).filter(Boolean)
  const origin = req.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : (allowed[0] ?? ''),
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

// 제목 줄에 줄바꿈이 섞여 다른 머리글이 끼어들지 못하게 한다.
const oneLine = (value: string) => value.replace(/[\r\n\t]+/g, ' ').trim()

Deno.serve(async (req) => {
  const cors = corsHeaders(req)
  const send = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return send(405, { error: 'method' })

  let input: { kind?: unknown; body?: unknown }
  try {
    input = await req.json()
  } catch {
    return send(400, { error: 'bad-request' })
  }
  const kind = typeof input.kind === 'string' && input.kind in KINDS ? input.kind : null
  const body = typeof input.body === 'string' ? input.body.trim() : ''
  if (!kind || body.length === 0 || body.length > MAX_BODY) return send(400, { error: 'bad-request' })

  // 로그인한 사용자의 권한으로 적는다. 가입자인지와 하루 한도(5건)는 데이터베이스가 지킨다 (0006_feedback.sql).
  const authorization = req.headers.get('Authorization') ?? ''
  const projectUrl = Deno.env.get('SUPABASE_URL')!
  const asUser = createClient(projectUrl, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } })
  const { data: auth } = await asUser.auth.getUser()
  if (!auth.user) return send(401, { error: 'login' })

  const { data: saved, error: saveError } = await asUser.from('feedback').insert({ kind, body }).select('id, created_at').single()
  if (saveError || !saved) {
    if (/feedback_quota/.test(saveError?.message ?? '')) return send(429, { error: 'quota' })
    if (/server_full/.test(saveError?.message ?? '')) return send(503, { error: 'full' })
    return send(403, { error: 'not-saved' })
  }

  // 여기부터는 이미 접수된 상태다. 메일을 보내지 못해도 글은 서버에 남아 있다.
  const user = Deno.env.get('GMAIL_USER')
  const password = Deno.env.get('GMAIL_APP_PASSWORD')
  if (!user || !password) return send(200, { saved: true, mailed: false })

  const admin = createClient(projectUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: profile } = await admin.from('profiles').select('nickname').eq('user_id', auth.user.id).maybeSingle()
  const nickname = oneLine(String(profile?.nickname ?? '')) || '이름 없음'

  try {
    // 서버 함수는 25·587 포트로 나갈 수 없다. Gmail 의 465(SSL) 포트를 쓴다.
    const transport = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass: password } })
    await transport.sendMail({
      from: `HIGH PRESS <${user}>`,
      to: Deno.env.get('FEEDBACK_TO') || user,
      subject: `${SUBJECT_TAG} ${KINDS[kind]} · ${nickname}`,
      text: [`종류: ${KINDS[kind]}`, `보낸 사람: ${nickname}`, `받은 시각: ${saved.created_at}`, `번호: ${saved.id}`, '', body].join('\n'),
    })
    await admin.from('feedback').update({ mailed_at: new Date().toISOString() }).eq('id', saved.id)
    return send(200, { saved: true, mailed: true })
  } catch (error) {
    console.error('feedback mail failed', error instanceof Error ? error.message : error)
    return send(200, { saved: true, mailed: false })
  }
})
