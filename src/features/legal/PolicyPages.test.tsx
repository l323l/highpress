import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DeleteAccountPage, OPERATOR_CONTACT, PrivacyPage, TermsPage } from './PolicyPages'

describe('약관 · 방침 · 계정 삭제 안내 (A1-9)', () => {
  it('시행일과 운영자 연락처를 적는다', () => {
    render(<TermsPage />)
    expect(screen.getByText('시행일 2026-10-18')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: OPERATOR_CONTACT })).toHaveAttribute('href', `mailto:${OPERATOR_CONTACT}`)
    expect(OPERATOR_CONTACT).toBe('jawon2517@gmail.com')
  })

  it('이용약관에 금지 콘텐츠 · 무관용 · 신고와 숨김 · 정지 · 연령 · 상한을 적는다', () => {
    const { container } = render(<TermsPage />)
    const text = container.textContent ?? ''
    for (const kind of ['욕설 · 괴롭힘', '혐오 · 차별', '음란물', '불법 · 개인정보 노출', '광고 · 도배', '저작권 침해']) expect(text).toContain(kind)
    expect(text).toContain('봐주지 않습니다')
    expect(text).toContain('가입한 지 72시간이 지난 서로 다른 3명이 같은 대상을 신고하면')
    expect(text).toContain('자동으로 다시 숨기지 않고')
    expect(text).toContain('운영자가 확인한 뒤')
    expect(screen.getByRole('heading', { name: '8. 이용 정지' })).toBeInTheDocument()
    expect(text).toContain('정지가 풀리거나, 탈퇴한 경우 최대 1년 동안 보관합니다')
    expect(text).toContain('만 14세 이상만 가입할 수 있습니다')
    expect(text).toContain('가입자는 100명까지')
    expect(text).toContain('“차단”을 누릅니다')
    expect(screen.getByRole('link', { name: '계정 삭제 안내' })).toHaveAttribute('href', '#/delete-account')
  })

  it('개인정보처리방침에 앱 항목 · 신고와 차단 기록 · 피드백 사본 · 탈퇴 방법을 적는다', () => {
    const { container } = render(<PrivacyPage />)
    const text = container.textContent ?? ''
    expect(text).toContain('앱 전용 저장 공간')
    expect(text).toContain('Apple 로그인')
    expect(text).toContain('사진첩 쓰기 권한')
    expect(text).toContain('신고 기록:')
    expect(text).toContain('차단 기록:')
    expect(text).toContain('전달된 사본은 탈퇴한 뒤에도 남습니다')
    // 보안 점검 L6 · N2: 빈도 제한용 IP 해시(하루), 재가입 막기용 식별자(서버 비밀 값과 섞은 값, 정지가 풀리거나 탈퇴 뒤 최대 1년), Apple 허가 취소는 조건부
    expect(text).toContain('최대 하루 보관 뒤 삭제')
    expect(text).toContain('로그인 식별자를 서버만 아는 값과 섞어 알아보기 어렵게 바꾼 값')
    expect(text).toContain('정지가 풀리거나, 탈퇴한 경우 최대 1년 보관 뒤 삭제')
    expect(text).not.toContain('정지가 풀릴 때까지 남습니다')
    expect(text).toContain('앱에 Apple 로그인이 생기면(앱 출시 전)')
    expect(screen.getByRole('heading', { name: '7. 사용자의 권리와 탈퇴 방법' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '계정 삭제 안내' })).toHaveAttribute('href', '#/delete-account')
  })

  it('계정 삭제 안내는 탈퇴 순서 · 메일 요청 · 지워지는 것과 남는 것 · 처리 기간을 보여 준다', () => {
    render(<DeleteAccountPage />)
    expect(screen.getByRole('heading', { level: 1, name: '계정 삭제 안내' })).toBeInTheDocument()
    for (const name of ['1. 앱 · 웹에서 직접 탈퇴하기', '2. 로그인할 수 없을 때 메일로 요청하기', '3. 지워지는 것', '4. 남는 것', '5. 처리 기간']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument()
    }
    expect(document.body.textContent).toContain('정지가 풀리거나, 탈퇴한 경우 최대 1년 동안 남습니다')
    const mail = screen.getAllByRole('link', { name: OPERATOR_CONTACT })[0]
    expect(mail.getAttribute('href')).toMatch(/^mailto:jawon2517@gmail\.com\?subject=/)
  })
})
