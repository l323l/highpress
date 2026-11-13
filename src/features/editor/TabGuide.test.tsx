import 'fake-indexeddb/auto'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db/db'
import { getSetting } from '../../db/store'
import { guideKey, TabGuide } from './TabGuide'

// 설정은 IndexedDB 에서 읽어 온다. 다른 테스트와 함께 돌 때는 느릴 수 있어 넉넉히 기다린다.
const SLOW = { timeout: 5000 }

describe('TabGuide', () => {
  beforeEach(async () => {
    await db.settings.clear()
  })

  it('탭을 처음 열면 그 탭의 안내가 뜨고, 닫으면 기억해서 다시 뜨지 않는다', async () => {
    const first = render(<TabGuide tab="motion" />)
    const dialog = await screen.findByRole('dialog', { name: '선수의 움직임을 짧은 영상으로 만듭니다' }, SLOW)
    expect(dialog).toHaveTextContent('선수를 끌어 처음 자리에 놓습니다')
    expect(dialog).toHaveTextContent('재생해 보고 본문에 넣습니다')

    fireEvent.click(screen.getByRole('button', { name: '안내 닫기' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(), SLOW)
    expect(await getSetting(guideKey('motion'), false)).toBe(true)
    first.unmount()

    // 다시 들어와도 뜨지 않는다.
    render(<TabGuide tab="motion" />)
    await waitFor(async () => expect(await getSetting(guideKey('motion'), false)).toBe(true))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('탭마다 따로 기억한다: 모션 안내를 닫아도 영상과 스탯 안내는 처음 한 번 뜬다', async () => {
    const view = render(<TabGuide tab="motion" />)
    fireEvent.click(await screen.findByRole('button', { name: '알겠습니다' }, SLOW))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(), SLOW)

    view.rerender(<TabGuide tab="video" />)
    expect(await screen.findByRole('dialog', { name: '경기 영상에서 필요한 장면만 잘라 넣습니다' }, SLOW)).toHaveTextContent('선수를 누른 채 따라갑니다')
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(), SLOW)

    view.rerender(<TabGuide tab="stats" />)
    expect(await screen.findByRole('dialog', { name: '스탯을 도표로 만들어 글에 넣습니다' }, SLOW)).toHaveTextContent('본문에 넣기를 누릅니다')
    expect(await getSetting(guideKey('stats'), false)).toBe(false)
    // 안내 세 개를 차례로 여닫는다. 다른 테스트와 함께 돌 때는 기본 5초를 넘길 수 있다.
  }, 20000)

  it('네이버 카페에 올리기 전의 유의사항을 한 번 알린다', async () => {
    render(<TabGuide tab="naver" />)
    const dialog = await screen.findByRole('dialog', { name: '네이버 카페에 올리기 전에 알아 두세요' }, SLOW)
    expect(dialog).toHaveTextContent('사진은 글 맨 위에 붙습니다')
    expect(dialog).toHaveTextContent('“카페 글쓰기”에 동의합니다')
    expect(dialog).toHaveTextContent('연달아 올릴 수 없습니다')
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(), SLOW)
    expect(await getSetting(guideKey('naver'), false)).toBe(true)
  })
})
