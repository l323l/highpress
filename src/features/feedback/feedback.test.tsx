import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getServer } from '../../lib/supabase'
import { useAccount, type Account } from '../account/session'
import { FeedbackForm } from './FeedbackForm'

// 서버 호출은 가짜로 바꾼다. 실제 발송은 서버 함수를 올린 뒤 브라우저에서 확인한다.
vi.mock('../account/session', async (original) => ({ ...(await original<typeof import('../account/session')>()), useAccount: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ getServer: vi.fn() }))

const signedIn: Account = { status: 'in', userId: 'me', email: 'me@example.com', accessToken: 't', profile: { nickname: '나의 이름' }, serverDown: false }

function useServer(result: { error: unknown }) {
  const invoke = vi.fn().mockResolvedValue({ data: null, ...result })
  vi.mocked(getServer).mockReturnValue(Promise.resolve({ functions: { invoke } }) as unknown as ReturnType<typeof getServer>)
  return invoke
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAccount).mockReturnValue(signedIn)
})

describe('피드백', () => {
  it('로그인하지 않았으면 쓸 수 없고 이유를 알린다', () => {
    vi.mocked(useAccount).mockReturnValue({ status: 'out' })
    render(<FeedbackForm />)
    expect(screen.getByText('로그인하면 개발자에게 피드백을 보낼 수 있습니다.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '피드백 쓰기' })).not.toBeInTheDocument()
  })

  it('종류를 고르고 글을 써서 보낸다. 무엇이 전달되는지 미리 알린다', async () => {
    const invoke = useServer({ error: null })
    render(<FeedbackForm />)
    fireEvent.click(screen.getByRole('button', { name: '피드백 쓰기' }))
    expect(screen.getByText(/이메일 주소는 전달되지 않습니다/)).toBeInTheDocument()

    const submit = screen.getByRole('button', { name: '보내기' })
    expect(submit).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '버그' }))
    fireEvent.change(screen.getByLabelText('내용'), { target: { value: '  영상 탭에서 원이 안 찍혀요  ' } })
    fireEvent.click(submit)

    await waitFor(() => expect(invoke).toHaveBeenCalledWith('feedback', { body: { kind: 'bug', body: '영상 탭에서 원이 안 찍혀요' } }))
    expect(await screen.findByRole('status')).toHaveTextContent('피드백을 보냈습니다')
  })

  it('하루 한도를 넘으면 알리고, 쓴 글은 지우지 않는다', async () => {
    useServer({ error: { context: { status: 429 } } })
    render(<FeedbackForm />)
    fireEvent.click(screen.getByRole('button', { name: '피드백 쓰기' }))
    fireEvent.change(screen.getByLabelText('내용'), { target: { value: '여섯 번째 글' } })
    fireEvent.click(screen.getByRole('button', { name: '보내기' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('하루 5건까지')
    expect(screen.getByLabelText('내용')).toHaveValue('여섯 번째 글')
  })

  it('서버에 받는 함수가 없으면 준비되지 않았다고 알린다', async () => {
    useServer({ error: { context: { status: 404 } } })
    render(<FeedbackForm />)
    fireEvent.click(screen.getByRole('button', { name: '피드백 쓰기' }))
    fireEvent.change(screen.getByLabelText('내용'), { target: { value: '글' } })
    fireEvent.click(screen.getByRole('button', { name: '보내기' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('아직 준비되지 않았습니다')
  })
})
