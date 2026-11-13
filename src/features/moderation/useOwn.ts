import { useAccount } from '../account'

// 이 글 · 댓글 · 프로필이 로그인한 내 것인지. 닉네임이나 가입 마침 여부에 기대지 않고 계정 id 로만 본다.
// 신고 · 차단 메뉴를 내 것에 붙이지 않는 데와, 숨김 안내를 내 것에만 보이는 데 쓴다.
export function useOwn(): (userId: string) => boolean {
  const account = useAccount()
  const id = account.status === 'in' ? account.userId : ''
  return (userId: string) => id !== '' && userId === id
}
