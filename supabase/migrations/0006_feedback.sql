-- 피드백 (M14): 가입자가 개발자에게 보내는 문의. 서버에 적어 두고, 서버 함수(feedback)가 운영자의 메일로 보낸다.
-- 0001 ~ 0005 를 실행한 프로젝트에 이어서 한 번 실행한다. 여러 번 실행해도 같은 결과가 되게 썼다.
-- 메일에는 닉네임과 종류·내용만 담는다. 이메일 주소는 담지 않는다.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (user_id) on delete cascade,
  -- bug: 버그, idea: 제안, other: 그 밖에
  kind text not null check (kind in ('bug', 'idea', 'other')),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  -- 운영자에게 메일로 보낸 시각. 보내지 못했으면 null (서버 함수만 채운다).
  mailed_at timestamptz
);
alter table public.feedback enable row level security;
create index if not exists feedback_user on public.feedback (user_id, created_at);
create index if not exists feedback_created on public.feedback (created_at desc);

drop policy if exists "feedback: 본인 또는 운영자 조회" on public.feedback;
drop policy if exists "feedback: 본인만 생성" on public.feedback;
create policy "feedback: 본인 또는 운영자 조회" on public.feedback for select to authenticated
  using ((select auth.uid()) = user_id or public.is_admin());
create policy "feedback: 본인만 생성" on public.feedback for insert to authenticated
  with check ((select auth.uid()) = user_id and public.is_member());

-- 보낸 사람과 시각은 서버가 정한다. 보낸 뒤에는 고치거나 지울 수 없다 (탈퇴하면 함께 지워진다).
revoke insert, update, delete on public.feedback from authenticated, anon;
grant insert (kind, body) on public.feedback to authenticated;

-- 한 사람이 하루에 보낼 수 있는 피드백은 5건까지. 서버가 한도에 닿으면 받지 않는다.
create or replace function public.enforce_feedback_quota() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.db_full() then
    raise exception 'server_full' using errcode = 'P0001';
  end if;
  if (select count(*) from public.feedback where user_id = new.user_id and created_at > now() - interval '1 day') >= 5 then
    raise exception 'feedback_quota' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists feedback_quota on public.feedback;
create trigger feedback_quota before insert on public.feedback
for each row execute function public.enforce_feedback_quota();
